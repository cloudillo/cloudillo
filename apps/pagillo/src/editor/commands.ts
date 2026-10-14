// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Text commands (toolbar, keymap, Format panel, pages rail). Every write goes through
 * `Editor.run` (one local transaction, refused for readers and while `readOnlyReason` is set);
 * the bid normaliser follows it.
 */

import type { Marks, ParagraphProps } from '@cloudillo/typeset'
import type * as Y from 'yjs'

import { newBlockId } from '../crdt/block-ids'
import { deltaOf } from '../crdt/delta-cache'
import { newId, type StyleId } from '../crdt/ids'
import { createStory } from '../crdt/story-ops'
import {
	LINE_KEYS,
	MARK_KEYS,
	type StoredInlineEmbed,
	type StoredLineAttrs,
	type StoredStyle,
	type StyleMap,
	type StyleMapKey,
	type YPagilloDocument
} from '../crdt/stored-types'
import { updateStyle } from '../crdt/style-ops'
import type { DeltaOp } from '../crdt/type-converters'
import * as C from './caret'
import { sliceDelta } from './clipboard'
import { deleteRange, insertText } from './text-edit'
import type { Editor } from './useEditor'

export interface CommandCtx {
	yDoc: Y.Doc
	doc: YPagilloDocument
	editor: Editor
}

export type ToggleMark = 'bold' | 'italic' | 'underline' | 'strike'
/** Paragraph override patch; `undefined` removes the override. */
export type ParagraphPatch = { [K in keyof ParagraphProps]?: ParagraphProps[K] | undefined }

/** Marks that "Clear formatting" removes (link stays). */
const FORMAT_MARKS = MARK_KEYS.filter((k) => k !== 'link')
/** All line attrs null: Yjs would otherwise copy the neighbour's onto an inserted embed. */
const NO_LINE = Object.fromEntries(LINE_KEYS.map((k) => [k, null]))

interface Line {
	/** Offset of the paragraph's `'\n'`. */
	index: number
	attrs: StoredLineAttrs
}

/** The `'\n'`s ending the paragraphs that intersect `[from, to]`. */
export function paragraphsIn(t: Y.Text, from: number, to: number): Line[] {
	const out: Line[] = []
	let pos = 0
	for (const op of deltaOf(t)) {
		if (typeof op.insert !== 'string') {
			pos++
			continue
		}
		for (let i = op.insert.indexOf('\n'); i >= 0; i = op.insert.indexOf('\n', i + 1)) {
			const index = pos + i
			if (index < from) continue
			out.push({ index, attrs: (op.attributes ?? {}) as Line['attrs'] })
			if (index >= to) return out
		}
		pos += op.insert.length
	}
	return out
}

/** Marks shared by every character of `[from, to)`; collapsed: the character typing would copy. */
export function marksIn(t: Y.Text, from: number, to: number): Marks {
	const txt = C.storyText(t)
	if (from === to) {
		if (from > 0 && txt[from - 1] !== '\n') from--
		else if (txt[from] !== '\n') to++
		else return {}
	}
	let out: Record<string, unknown> | undefined
	let pos = 0
	for (const op of deltaOf(t)) {
		const len = typeof op.insert === 'string' ? op.insert.length : 1
		const seg = typeof op.insert === 'string' ? op.insert : '￼'
		if (pos < to && pos + len > from && seg.replaceAll('\n', '') !== '') {
			const a = op.attributes ?? {}
			if (!out) out = Object.fromEntries(Object.entries(a).filter(([k]) => !(k in NO_LINE)))
			else for (const k of Object.keys(out)) if (a[k] !== out[k]) delete out[k]
		}
		pos += len
		if (pos >= to) break
	}
	return (out ?? {}) as Marks
}

/** Format the characters of `[from, to)`, skipping the paragraph `'\n'`s (they carry line attrs). */
function formatChars(t: Y.Text, from: number, to: number, attrs: Record<string, unknown>) {
	const txt = C.storyText(t)
	let a = from
	for (let i = from; i <= to; i++) {
		if (i === to || txt[i] === '\n') {
			if (i > a) t.format(a, i - a, attrs)
			a = i + 1
		}
	}
}

/** Props inherited along the `basedOn` chain (cycle-safe), nearest ancestor wins. */
export function inheritedProps(
	doc: YPagilloDocument,
	id: StyleId | undefined
): Record<string, unknown> {
	const chain: StoredStyle[] = []
	const seen = new Set<string>()
	for (let cur = id; cur && !seen.has(cur); cur = doc.st.get(cur)?.basedOn) {
		seen.add(cur)
		const s = doc.st.get(cur)
		if (s) chain.unshift(s)
	}
	return Object.assign({}, ...chain.map((s) => s.props))
}

const styleMap = (doc: YPagilloDocument) => (doc.m.get('styleMap') as StyleMap | undefined) ?? {}

export interface TextState {
	/** Paragraph style of every selected paragraph, or undefined when mixed. */
	ps?: string
	/** Direct overrides of the first paragraph. */
	po: Partial<ParagraphProps>
	list?: 'bullet' | 'ordered'
	indent: number
	/** Marks shared by the whole selection. */
	marks: Marks
	/** Effective paragraph props (style chain + overrides) of the first paragraph. */
	eff: Record<string, unknown>
	/** "Body +": direct paragraph overrides or formatting marks. */
	overrides: boolean
}

export function textState(
	doc: YPagilloDocument,
	sel: C.EditorSelection | undefined
): TextState | undefined {
	const t = sel && doc.tx.get(sel.story)
	if (!sel || !t) return
	const paras = paragraphsIn(t, C.selFrom(sel), C.selTo(sel))
	const first = paras[0]?.attrs ?? {}
	const ps = paras.every((p) => p.attrs.ps === first.ps) ? first.ps : undefined
	const po = first.po ?? {}
	const marks = marksIn(t, C.selFrom(sel), C.selTo(sel))
	return {
		ps,
		po,
		list: first.list,
		indent: first.indent ?? 0,
		marks,
		eff: { ...inheritedProps(doc, first.ps), ...po },
		overrides: Object.keys(po).length > 0 || FORMAT_MARKS.some((k) => k in marks)
	}
}

/** Toggle a raw mark on the selection; collapsed is a no-op (no pending marks for typing). */
export function toggleMark({ editor }: CommandCtx, mark: ToggleMark): void {
	editor.run((t, from, to) => {
		if (from === to) return
		formatChars(t, from, to, { [mark]: marksIn(t, from, to)[mark] ? null : true })
	})
}

/** Set (or with `null` remove) a value mark: color, font, size (Fx), link, cs. */
export function setMark(
	{ editor }: CommandCtx,
	mark: 'color' | 'font' | 'size' | 'link' | 'cs',
	value: string | number | null
): void {
	editor.run((t, from, to) => {
		if (from !== to) formatChars(t, from, to, { [mark]: value })
	})
}

function formatParagraphs(
	editor: Editor,
	fn: (attrs: Line['attrs']) => Record<string, unknown> | undefined
): void {
	editor.run((t, from, to) => {
		for (const p of paragraphsIn(t, from, to)) {
			const a = fn(p.attrs)
			if (a) t.format(p.index, 1, a)
		}
	})
}

export function setParagraphStyle({ editor }: CommandCtx, id: StyleId): void {
	formatParagraphs(editor, () => ({ ps: id }))
}

/** Ctrl+Alt+0–3: apply the `m.styleMap` style of a block type. */
export function applyStyleKey(ctx: CommandCtx, key: StyleMapKey): boolean {
	const id = styleMap(ctx.doc)[key]
	if (!id) return false
	setParagraphStyle(ctx, id)
	return true
}

/** Merge direct paragraph overrides (`po`); an `undefined` value drops that override. */
export function setParagraphProps({ editor }: CommandCtx, patch: ParagraphPatch): void {
	formatParagraphs(editor, (a) => {
		const po: Record<string, unknown> = { ...a.po, ...patch }
		for (const k of Object.keys(po)) if (po[k] === undefined) delete po[k]
		return { po: Object.keys(po).length ? po : null }
	})
}

/** Toggle a list kind on the selected paragraphs (same kind again removes it). */
export function toggleList(ctx: CommandCtx, kind: 'bullet' | 'ordered'): void {
	const off = textState(ctx.doc, ctx.editor.sel)?.list === kind
	formatParagraphs(ctx.editor, () => (off ? { list: null, indent: null } : { list: kind }))
}

/** List nesting ±1 (0–8); outdenting level 0 ends the list. False when not in a list. */
export function indentList(ctx: CommandCtx, dir: -1 | 1): boolean {
	if (!textState(ctx.doc, ctx.editor.sel)?.list) return false
	formatParagraphs(ctx.editor, (a) => {
		if (!a.list) return
		const n = (a.indent ?? 0) + dir
		if (n < 0) return { list: null, indent: null }
		return { indent: Math.min(8, n) || null }
	})
	return true
}

export function insertTab({ editor }: CommandCtx): void {
	editor.run((t, from, to) => {
		deleteRange(t, from, to)
		return insertAt(t, from, '\t')
	})
}

function insertAt(t: Y.Text, at: number, text: string): number {
	t.insert(at, text, { ...marksIn(t, at, at), ...NO_LINE })
	return at + text.length
}

/** Insert a field embed at the caret (date `fixed` with `d`, or `export`). */
export function insertField({ editor }: CommandCtx, field: StoredInlineEmbed): void {
	editor.run((t, from, to) => {
		deleteRange(t, from, to)
		t.insertEmbed(from, field, { ...marksIn(t, from, from), ...NO_LINE })
		return from + 1
	})
}

/**
 * Split the story at the caret into a new section after the current one (same masters); the
 * caret moves to the new section's start. Not available in text-box stories.
 */
export function insertSectionBreak({ doc, editor }: CommandCtx): void {
	const story = editor.sel?.story
	const secId = [...doc.s.entries()].find(([, s]) => s.story === story)?.[0]
	const sec = secId ? doc.s.get(secId) : undefined
	if (!secId || !sec) return
	let next: string | undefined
	editor.run((t, from, to) => {
		deleteRange(t, from, to)
		const txt = C.storyText(t)
		// Split mid-paragraph first, so the tail starts at a paragraph start.
		const at = from > 0 && txt[from - 1] !== '\n' ? insertText(t, from, '\n') : from
		// Uncached on purpose: `applyDelta` writes nulls into the ops' attribute objects.
		const tail = sliceDelta(t.toDelta() as DeltaOp[], at, t.length)
		const body = styleMap(doc).p
		const id = createStory(doc, tail.length ? [] : [{ ps: body }])
		doc.tx.get(id)?.applyDelta(tail)
		t.delete(at, t.length - at)
		if (t.length === 0) t.insert(0, '\n', { bid: newBlockId(), ...(body ? { ps: body } : {}) })
		const { pageNum: _p, maxPages: _m, ...rest } = sec
		const sid = newId()
		doc.s.set(sid, { ...rest, story: id })
		doc.secs.insert(doc.secs.toArray().indexOf(secId) + 1, [sid])
		next = id
	})
	if (next) editor.select({ story: next, anchor: 0, head: 0 })
}

/** Mark → style prop for "Update <style> to match". */
const MARK_PROPS: [keyof Marks, string, (v: unknown) => unknown][] = [
	['font', 'font', (v) => v],
	['size', 'size', (v) => v],
	['color', 'color', (v) => v],
	['italic', 'italic', (v) => v],
	['underline', 'underline', (v) => v],
	['strike', 'strike', (v) => v],
	['bold', 'weight', (v) => (v ? 700 : undefined)]
]

/** Redefine the caret paragraph's style from its overrides and shared marks, then drop them. */
export function redefineStyle({ yDoc, doc, editor }: CommandCtx): void {
	editor.run((t, from) => {
		const [p] = paragraphsIn(t, from, from)
		const id = p?.attrs.ps
		if (!p || !id) return
		const [a] = C.paragraphAt(C.storyText(t), from)
		const marks = marksIn(t, a, p.index) as Record<string, unknown>
		const props: Record<string, unknown> = { ...p.attrs.po }
		for (const [m, k, f] of MARK_PROPS) if (m in marks) props[k] = f(marks[m])
		updateStyle(yDoc, doc, id, { props } as Partial<Omit<StoredStyle, 'k'>>)
		t.format(p.index, 1, { po: null })
		formatChars(t, a, p.index, Object.fromEntries(MARK_PROPS.map(([m]) => [m, null])))
	})
}

/** "Clear formatting": drop paragraph overrides and formatting marks (links stay). */
export function clearOverrides({ editor }: CommandCtx): void {
	editor.run((t, from, to) => {
		const paras = paragraphsIn(t, from, to)
		const a = from === to ? C.paragraphAt(C.storyText(t), from)[0] : from
		const b = from === to ? (paras[0]?.index ?? to) : to
		formatChars(t, a, b, Object.fromEntries(FORMAT_MARKS.map((m) => [m, null])))
		for (const p of paras) t.format(p.index, 1, { po: null })
	})
}

/**
 * Heading nudge: a single-line Body paragraph ≥ 1.3× Body size or bold throughout,
 * not dismissed (`nh: 1`). Returns the paragraph's `'\n'` offset.
 */
export function headingNudge({ doc, editor }: CommandCtx): number | undefined {
	const sel = editor.sel
	const t = sel && doc.tx.get(sel.story)
	const map = styleMap(doc)
	if (!sel || !t || !map.p || !map.h2) return
	const [p] = paragraphsIn(t, sel.head, sel.head)
	if (!p || p.attrs.ps !== map.p || p.attrs.nh || !p.attrs.bid) return
	const [a] = C.paragraphAt(C.storyText(t), sel.head)
	if (a === p.index) return
	const lines = editor.index.stories.get(sel.story) ?? []
	if (lines.filter((l) => l.line.bid === p.attrs.bid).length !== 1) return
	const marks = marksIn(t, a, p.index)
	const body = Number(inheritedProps(doc, map.p).size) || 0
	const big = !!marks.size && !!body && marks.size >= 1.3 * body
	return big || marks.bold ? p.index : undefined
}

export function applyHeadingNudge(ctx: CommandCtx): void {
	applyStyleKey(ctx, 'h2')
}

export function dismissHeadingNudge({ editor }: CommandCtx): void {
	formatParagraphs(editor, () => ({ nh: 1 }))
}

/**
 * Enter's "next style": a new empty paragraph after a heading (style with `tocLevel`) gets the
 * Body style without overrides. Call inside the Enter transaction with the caret after it.
 */
export function applyNextStyle(doc: YPagilloDocument, t: Y.Text, caret: number): void {
	const [cur] = paragraphsIn(t, caret, caret)
	const [prev] = caret > 0 ? paragraphsIn(t, caret - 1, caret - 1) : []
	if (!cur || cur.index !== caret || !prev?.attrs.ps) return
	if (!inheritedProps(doc, prev.attrs.ps).tocLevel) return
	t.format(cur.index, 1, { ps: styleMap(doc).p ?? null, po: null })
}

/** Story range shown on global page `page` (lines of `story` only). */
function pageRange(editor: Editor, story: string, page: number): [number, number] | undefined {
	const lines = (editor.index.pages.get(page) ?? []).filter((l) => l.line.story === story)
	if (!lines.length) return
	return [Math.min(...lines.map((l) => l.from)), Math.max(...lines.map((l) => l.to))]
}

/** "+ Add page": a paragraph starting on a new page after the text of `page`; caret moves there. */
export function addPage({ doc, editor }: CommandCtx, story: string, page: number): void {
	const t = doc.tx.get(story)
	if (!t) return
	const end = pageRange(editor, story, page)?.[1] ?? C.storyEnd(C.storyText(t))
	editor.select({ story, anchor: end, head: end })
	editor.run((t, from) => {
		const [p] = paragraphsIn(t, from, from)
		if (!p) return
		const caret = insertText(t, p.index, '\n')
		const [n] = paragraphsIn(t, caret, caret)
		if (n) t.format(n.index, 1, { po: { ...n.attrs.po, breakBefore: 'page' } })
		return caret
	})
}

/** "Delete page": delete the story range shown on `page` (the caller confirms first). */
export function deletePage({ editor }: CommandCtx, story: string, page: number): void {
	const r = pageRange(editor, story, page)
	if (!r) return
	editor.select({ story, anchor: r[0], head: r[1] })
	// The page's last paragraph mark stays (an empty paragraph may remain).
	editor.run((t, from, to) => {
		deleteRange(t, from, to)
		return from
	})
}

// vim: ts=4
