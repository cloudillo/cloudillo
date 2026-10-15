// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Editor toolbar: `role="toolbar"` with a roving tabindex (←/→, Home/End). Paragraph-style
 * listbox first (`StyleSelect`: previews, "Body +", style actions and the heading nudge in its
 * foot), then B/I/U/S, font, size, colour, alignment, lists, Insert menu and undo/redo.
 */

import { FX } from '@cloudillo/typeset'
import {
	Button,
	ColorInput,
	FontPicker,
	Menu,
	MenuDivider,
	MenuItem,
	SubMenuItem,
	ToolbarDivider,
	Toolbar as UiToolbar,
	useDialog
} from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
	LuAlignCenter,
	LuAlignJustify,
	LuAlignLeft,
	LuAlignRight,
	LuBold,
	LuIndentDecrease,
	LuIndentIncrease,
	LuItalic,
	LuList,
	LuListOrdered,
	LuPlus,
	LuRedo2,
	LuStrikethrough,
	LuUnderline,
	LuUndo2
} from 'react-icons/lu'

import { stylesOf } from '../crdt/entities'
import * as Cmd from '../editor/commands'
import type { Editor } from '../editor/useEditor'
import type { Undo } from '../editor/undo'
import type { YPagilloDocument } from '../crdt/stored-types'
import { useDocVersion } from '../panels/useY'
import { LengthInput } from '../ui/LengthInput'
import { StyleSelect } from './StyleSelect'

/** Selection text state, refreshed on edits to the selection's story. */
export function useTextState(doc: YPagilloDocument, editor: Editor): Cmd.TextState | undefined {
	const docv = useDocVersion(doc)
	const [txv, bump] = React.useReducer((n: number) => n + 1, 0)
	const story = editor.sel?.story
	React.useEffect(() => {
		const t = story ? doc.tx.get(story) : undefined
		t?.observe(bump)
		return () => t?.unobserve(bump)
	}, [doc, story])
	const { sel } = editor
	return React.useMemo(() => Cmd.textState(doc, sel), [doc, sel, docv, txv])
}

const FOCUSABLE = 'button:not(:disabled), select, input'

/** Roving tabindex: one tab stop, arrows move between controls. */
function useRoving(ref: React.RefObject<HTMLDivElement | null>) {
	const active = React.useRef(0)
	React.useLayoutEffect(() => {
		const els = [...(ref.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])]
		active.current = Math.min(active.current, Math.max(0, els.length - 1))
		els.forEach((el, i) => {
			el.tabIndex = i === active.current ? 0 : -1
		})
	})
	const onFocus = (e: React.FocusEvent) => {
		const els = [...(ref.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])]
		const i = els.findIndex((el) => el.contains(e.target as Node))
		if (i < 0) return
		active.current = i
		els.forEach((el, j) => {
			el.tabIndex = j === i ? 0 : -1
		})
	}
	const onKeyDown = (e: React.KeyboardEvent) => {
		const target = e.target as HTMLElement
		if (target instanceof HTMLInputElement) return
		const els = [...(ref.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])]
		const i = els.indexOf(target)
		if (i < 0) return
		const n =
			e.key === 'ArrowRight'
				? (i + 1) % els.length
				: e.key === 'ArrowLeft'
					? (i - 1 + els.length) % els.length
					: e.key === 'Home'
						? 0
						: e.key === 'End'
							? els.length - 1
							: -1
		if (n < 0) return
		e.preventDefault()
		els[n].focus()
	}
	return { onFocus, onKeyDown }
}

export interface ToolbarProps extends Cmd.CommandCtx {
	undo: Undo
	/** Insert an image inline at the caret, or as a frame on the page in view. Absent = no layout rights. */
	onInsertImage?(inline: boolean): void
	/** Insert a text box on the page in view. Absent = no layout rights. */
	onInsertTextBox?(): void
	/** Inline image refused (Edit layout, a frame selected). */
	inlineImageOff?: boolean
}

const ALIGNS = [
	['left', LuAlignLeft, 'Left'],
	['center', LuAlignCenter, 'Center'],
	['right', LuAlignRight, 'Right'],
	['justify', LuAlignJustify, 'Justify']
] as const

const today = () => new Date().toISOString().slice(0, 10)

export function Toolbar({
	yDoc,
	doc,
	editor,
	undo,
	onInsertImage,
	onInsertTextBox,
	inlineImageOff
}: ToolbarProps) {
	const { t } = useTranslation()
	const dialog = useDialog()
	const ref = React.useRef<HTMLDivElement>(null)
	const roving = useRoving(ref)
	const st = useTextState(doc, editor)
	const ctx: Cmd.CommandCtx = { yDoc, doc, editor }
	const off = !st
	/** Title of the Insert items that need a caret. */
	const needCaret = t('Place the caret in text first')
	/** Footnotes and the TOC: section flows only (not text boxes, not a footnote body). */
	const flowCaret = !off && Cmd.isSectionStory(doc, editor.sel?.story)
	const flowTitle = off
		? needCaret
		: !flowCaret
			? t('Only in the main text flow')
			: st?.table
				? t('Not inside a table')
				: undefined
	const nudge = React.useMemo(
		() => (st ? Cmd.headingNudge(ctx) !== undefined : false),
		[st, editor.index]
	)

	/** Run a command and give the text its focus back. */
	const act = (fn: () => void) => () => {
		fn()
		editor.focus()
	}
	const styles = stylesOf(doc).filter(([, s]) => s.k === 'p')
	/** Option preview: the style's inherited font, size clamped to 11–20 px. */
	const preview = (id: string): React.CSSProperties => {
		const p = Cmd.inheritedProps(doc, id)
		const pt = typeof p.size === 'number' ? p.size / FX : 11
		return {
			fontFamily: typeof p.font === 'string' ? `'${p.font}', sans-serif` : undefined,
			fontSize: `${Math.min(20, Math.max(11, (pt * 4) / 3))}px`
		}
	}
	const align = (st?.eff.align as string | undefined) ?? 'left'

	const askLink = async () => {
		const url = await dialog.askText(t('Link'), t('Web address'), {
			defaultValue: st?.marks.link ?? 'https://'
		})
		if (url === undefined) return
		const v = url.trim()
		Cmd.setMark(ctx, 'link', v && v !== 'https://' ? v : null)
		editor.focus()
	}
	// A text dialog, not a native date input; validated as YYYY-MM-DD.
	const askDate = async () => {
		const d = await dialog.askText(t('Fixed date'), t('Date (YYYY-MM-DD)'), {
			defaultValue: today()
		})
		if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d.trim())) return
		Cmd.insertField(ctx, { field: 'date', src: 'fixed', d: d.trim() })
		editor.focus()
	}
	// Header row on; toggled in Format › Table.
	const askTable = async () => {
		const v = await dialog.askText(t('Table'), t('Columns × rows'), { defaultValue: '3 × 3' })
		const m = v && /^\s*(\d+)\s*[×x*,]\s*(\d+)\s*$/i.exec(v)
		if (!m) return
		const n = (s: string) => Math.min(64, Math.max(1, Number(s)))
		Cmd.insertTable(ctx, n(m[1]), n(m[2]))
		editor.focus()
	}

	const mark = (m: Cmd.ToggleMark, Icon: React.ComponentType, label: string) => (
		<Button
			variant="ghost"
			size="sm"
			icon={<Icon />}
			aria-label={label}
			title={label}
			pressed={!!st?.marks[m]}
			disabled={off}
			onClick={act(() => Cmd.toggleMark(ctx, m))}
		/>
	)

	return (
		<UiToolbar
			ref={ref}
			role="toolbar"
			aria-label={t('Formatting')}
			className="pagillo-toolbar"
			onFocus={roving.onFocus}
			onKeyDown={roving.onKeyDown}
		>
			<StyleSelect
				styles={styles}
				preview={preview}
				value={st?.ps}
				overrides={!!st?.overrides}
				mixed={!!st && !st.ps}
				nudge={nudge}
				disabled={off}
				onSelect={(id) => act(() => Cmd.setParagraphStyle(ctx, id))()}
				onUpdate={act(() => Cmd.redefineStyle(ctx))}
				onClear={act(() => Cmd.clearOverrides(ctx))}
				onNudge={act(() => Cmd.applyHeadingNudge(ctx))}
				onDismissNudge={act(() => Cmd.dismissHeadingNudge(ctx))}
			/>
			<ToolbarDivider />
			{mark('bold', LuBold, t('Bold'))}
			{mark('italic', LuItalic, t('Italic'))}
			{mark('underline', LuUnderline, t('Underline'))}
			{mark('strike', LuStrikethrough, t('Strikethrough'))}
			<ToolbarDivider />
			<FontPicker
				value={st?.marks.font ?? (st?.eff.font as string | undefined) ?? ''}
				disabled={off}
				onChange={(f) => {
					Cmd.setMark(ctx, 'font', f)
					editor.focus()
				}}
			/>
			<div style={{ width: '5rem' }}>
				<LengthInput
					unit="pt"
					size="sm"
					min={FX}
					value={st?.marks.size ?? (st?.eff.size as number | undefined)}
					onChange={(v) => Cmd.setMark(ctx, 'size', v)}
				/>
			</div>
			<ColorInput
				value={st?.marks.color ?? (st?.eff.color as string | undefined) ?? '#000000'}
				showHex={false}
				onChange={(c) => Cmd.setMark(ctx, 'color', c)}
			/>
			<ToolbarDivider />
			{ALIGNS.map(([a, Icon, label]) => (
				<Button
					key={a}
					variant="ghost"
					size="sm"
					icon={<Icon />}
					aria-label={t(label)}
					title={t(label)}
					pressed={align === a}
					disabled={off}
					onClick={act(() => Cmd.setParagraphProps(ctx, { align: a }))}
				/>
			))}
			<ToolbarDivider />
			<Button
				variant="ghost"
				size="sm"
				icon={<LuList />}
				aria-label={t('Bulleted list')}
				title={t('Bulleted list')}
				pressed={st?.list === 'bullet'}
				disabled={off}
				onClick={act(() => Cmd.toggleList(ctx, 'bullet'))}
			/>
			<Button
				variant="ghost"
				size="sm"
				icon={<LuListOrdered />}
				aria-label={t('Numbered list')}
				title={t('Numbered list')}
				pressed={st?.list === 'ordered'}
				disabled={off}
				onClick={act(() => Cmd.toggleList(ctx, 'ordered'))}
			/>
			<Button
				variant="ghost"
				size="sm"
				icon={<LuIndentDecrease />}
				aria-label={t('Decrease list level')}
				title={t('Decrease list level')}
				disabled={!st?.list}
				onClick={act(() => Cmd.indentList(ctx, -1))}
			/>
			<Button
				variant="ghost"
				size="sm"
				icon={<LuIndentIncrease />}
				aria-label={t('Increase list level')}
				title={t('Increase list level')}
				disabled={!st?.list}
				onClick={act(() => Cmd.indentList(ctx, 1))}
			/>
			<ToolbarDivider />
			<Menu
				trigger={
					<Button variant="ghost" size="sm" icon={<LuPlus />}>
						{t('Insert')}
					</Button>
				}
			>
				{onInsertImage && (
					<>
						<MenuItem
							label={t('Image on page…')}
							onClick={() => onInsertImage(false)}
						/>
						<MenuItem
							label={t('Image in text…')}
							disabled={off || inlineImageOff}
							title={off ? needCaret : undefined}
							onClick={() => onInsertImage(true)}
						/>
					</>
				)}
				{onInsertTextBox && <MenuItem label={t('Text box')} onClick={onInsertTextBox} />}
				{(onInsertImage || onInsertTextBox) && <MenuDivider />}
				<SubMenuItem label={t('Field')} disabled={off} title={off ? needCaret : undefined}>
					<MenuItem label={t('Date (fixed)…')} onClick={askDate} />
					<MenuItem
						label={t('Date of last export')}
						onClick={act(() => Cmd.insertField(ctx, { field: 'date', src: 'export' }))}
					/>
					<MenuItem
						label={t('Page number')}
						onClick={act(() => Cmd.insertField(ctx, { field: 'page' }))}
					/>
					<MenuItem
						label={t('Page count')}
						onClick={act(() => Cmd.insertField(ctx, { field: 'pages' }))}
					/>
					<MenuItem
						label={t('Section title')}
						onClick={act(() => Cmd.insertField(ctx, { field: 'section' }))}
					/>
					<MenuItem
						label={t('Publication title')}
						onClick={act(() => Cmd.insertField(ctx, { field: 'title' }))}
					/>
				</SubMenuItem>
				<MenuItem
					label={t('Link…')}
					disabled={off}
					title={off ? needCaret : undefined}
					onClick={askLink}
				/>
				<MenuItem
					label={t('Table…')}
					disabled={off || !!st?.table}
					title={off ? needCaret : st?.table ? t('Tables cannot be nested') : undefined}
					onClick={askTable}
				/>
				<MenuItem
					label={t('Footnote')}
					disabled={!flowCaret || !!st?.table}
					title={flowTitle}
					onClick={act(() => Cmd.insertFootnote(ctx))}
				/>
				<SubMenuItem
					label={t('Table of contents')}
					disabled={!flowCaret || !!st?.table}
					title={flowTitle}
				>
					{[2, 3, 4].map((n) => (
						<MenuItem
							key={n}
							label={t('Headings 1–{{n}}', { n })}
							onClick={act(() => Cmd.insertToc(ctx, n))}
						/>
					))}
				</SubMenuItem>
				<MenuItem
					label={t('Section break')}
					disabled={off}
					title={off ? needCaret : undefined}
					onClick={act(() => Cmd.insertSectionBreak(ctx))}
				/>
			</Menu>
			<ToolbarDivider />
			<Button
				variant="ghost"
				size="sm"
				icon={<LuUndo2 />}
				aria-label={t('Undo')}
				title={t('Undo')}
				disabled={!undo.canUndo}
				onClick={act(undo.undo)}
			/>
			<Button
				variant="ghost"
				size="sm"
				icon={<LuRedo2 />}
				aria-label={t('Redo')}
				title={t('Redo')}
				disabled={!undo.canRedo}
				onClick={act(undo.redo)}
			/>
		</UiToolbar>
	)
}

// vim: ts=4
