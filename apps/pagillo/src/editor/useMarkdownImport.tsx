// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * Markdown file import: the hidden file input with its caret and new-section targets, and the
 * file the shell pushes into a new publication, held until there is a section to put it in.
 */

import { decodeImportText, getAppBus, readImportFile, refuseImport } from '@cloudillo/core'
import { useFilePicker, type useToast } from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import type * as Y from 'yjs'

import { sectionOf } from '../crdt/entities'
import type { YPagilloDocument } from '../crdt/stored-types'
import { newerEngine } from '../layout/useLayout'
import { pasteDelta } from './clipboard'
import {
	addMarkdownSection,
	fillFirstSection,
	markdownOps,
	type ParsedMarkdown,
	parseMarkdown
} from './markdown'
import { deleteRange } from './text-edit'
import type { Undo } from './undo'
import type { Editor } from './useEditor'

export interface MarkdownImportOptions {
	yDoc: Y.Doc
	doc: YPagilloDocument
	editor: Editor
	undo: Undo
	toast: ReturnType<typeof useToast>
	/** No sections yet: a pushed import waits for `applied()`. */
	empty: boolean
	/** Scroll to section `id` and put the caret at the start of `story`. */
	onGo(id: string, story: string): void
}

export interface MarkdownImport {
	/** The hidden file input: render it once, outside anything that can unmount. */
	input: React.ReactNode
	insertAtCaret(): void
	/** New section at `index` with `like`'s page setup. */
	importSection(like: string, index: number): void
	/** Name of the pushed file waiting for a template. */
	pendingName?: string
	/** A template just went in: fill its first section with the held import, if there is one. */
	applied(): void
}

interface HeldImport {
	fileName: string
	data: string
}

/** The doc id `useCloudilloEditor` reads; trusted apps share an origin, hence the app prefix. */
const heldKey = () => `pagillo:md-import:${location.hash.slice(1)}`

/** Storage can throw (sandboxed frame, quota): the import then lives in the ref alone. */
function storeHeld(held?: HeldImport) {
	try {
		if (held) sessionStorage.setItem(heldKey(), JSON.stringify(held))
		else sessionStorage.removeItem(heldKey())
	} catch (err) {
		console.warn('Markdown import not kept for a reload', err)
	}
}

function loadHeld(): HeldImport | undefined {
	try {
		const stored = sessionStorage.getItem(heldKey())
		const held: unknown = stored ? JSON.parse(stored) : undefined
		const { fileName, data } = (held ?? {}) as Record<string, unknown>
		if (typeof fileName === 'string' && typeof data === 'string') return { fileName, data }
	} catch (err) {
		console.warn('Markdown import not restored', err)
	}
}

export function useMarkdownImport(opts: MarkdownImportOptions): MarkdownImport {
	const { t } = useTranslation()
	/** Where the next picked file goes; undefined = the caret. */
	const target = React.useRef<{ like: string; index: number }>(undefined)
	/** Latest render's values: the editor may have changed by the time the file is read. */
	const now = React.useRef({ ...opts, t })
	now.current = { ...opts, t }
	/**
	 * The pushed file, base64. A ref, so taking it is synchronous and cannot happen twice, with
	 * a copy in `sessionStorage`: the shell pushes once, so a reload must find it there.
	 * Closing the tab at the gallery still abandons the file; a shell-side retry would fix that.
	 */
	const held = React.useRef<string>(undefined)
	const [pendingName, setPendingName] = React.useState<string>()

	/** Reads the current `styleMap`, so a pushed file is parsed only once its template is in. */
	const parse = (md: string) => {
		const { doc, t } = now.current
		return parseMarkdown(doc, md, (alt) =>
			alt ? t('[Image: {{alt}}]', { alt }) : t('[Image]')
		)
	}

	const warnImages = ({ images: n }: ParsedMarkdown) => {
		const { toast, t } = now.current
		if (n > 0) toast.warning(t('Images not imported: {{n}}', { n }))
	}

	const onFiles = async ([file]: File[]) => {
		const to = target.current
		try {
			const md = await readImportFile(file)
			const { yDoc, doc, editor, undo, toast, onGo, t } = now.current
			const parsed = parse(md)
			undo.mark()
			if (to) {
				const story = sectionOf(doc, to.like)?.story
				const made =
					story && editor.canEdit(story)
						? addMarkdownSection(yDoc, doc, parsed, to.like, to.index)
						: undefined
				if (!made) {
					toast.error(t('Could not import the file'))
					return
				}
				onGo(made.id, made.story)
			} else {
				const done = editor.run((tx, from, end) => {
					deleteRange(tx, from, end)
					return pasteDelta(doc, tx, from, markdownOps(yDoc, doc, parsed))
				})
				if (!done) {
					toast.error(
						editor.sel
							? t('Could not import the file')
							: t('Place the caret in text first')
					)
					return
				}
			}
			undo.mark()
			editor.focus()
			warnImages(parsed)
		} catch (err) {
			console.error('Markdown import failed', err)
			now.current.toast.error(now.current.t('Could not import the file'))
		}
	}

	const picker = useFilePicker({
		accept: '.md,.markdown,text/markdown',
		multiple: false,
		onFiles
	})

	const pick = (to?: { like: string; index: number }) => {
		target.current = to
		picker.open()
	}

	/** Take the held import, if any, write it and tell the shell. `write` false = not written. */
	const takeHeld = (write: (parsed: ParsedMarkdown) => boolean) => {
		const data = held.current
		if (data === undefined) return
		held.current = undefined
		storeHeld()
		setPendingName(undefined)
		const bus = getAppBus()
		const { doc, toast, t } = now.current
		// Held across a reload, or until a template: access may have changed since the push.
		if (refuseImport(bus, 'text/markdown', t, newerEngine(doc))) {
			toast.error(t('Read-only document'))
			return
		}
		try {
			const parsed = parse(decodeImportText(data))
			if (!write(parsed)) throw new Error('No section to import into')
			warnImages(parsed)
			bus.notifyImportComplete(true)
		} catch (err) {
			console.error('Markdown import failed', err)
			const message = t('Could not import the file')
			// The shell only logs the failure: this is what the user gets to see.
			toast.error(message)
			bus.notifyImportComplete(false, message)
		}
	}

	// On mount, not later: the shell pushes once, at `synced`, and does not repeat it.
	React.useEffect(() => {
		const bus = getAppBus()
		const restored = loadHeld()
		if (restored) {
			held.current = restored.data
			setPendingName(restored.fileName)
		}
		return bus.onImportData(({ sourceMimeType: type, fileName, data }) => {
			const { doc, t } = now.current
			// The doc is synced by now, so `newerEngine` is right where `readOnlyReason` may lag.
			if (refuseImport(bus, type, t, newerEngine(doc))) return
			if (held.current !== undefined) {
				bus.notifyImportComplete(false, t('Could not import the file'))
				return
			}
			held.current = data
			storeHeld({ fileName, data })
			setPendingName(fileName)
		})
	}, [])

	// Sections exist (a collaborator's template, or the doc was not new): add one after them.
	// `pendingName` is a dep because on such a doc `empty` never changes: the push fires this.
	React.useEffect(() => {
		if (opts.empty) return
		takeHeld((parsed) => {
			const { yDoc, doc, undo, onGo } = now.current
			// An undone section leaves its id in `secs`.
			const like = doc.secs
				.toArray()
				.filter((id) => sectionOf(doc, id))
				.at(-1)
			undo.mark()
			const made = like && addMarkdownSection(yDoc, doc, parsed, like, doc.secs.length)
			if (!made) return false
			undo.mark()
			onGo(made.id, made.story)
			return true
		})
	}, [opts.empty, pendingName])

	return {
		input: picker.input,
		insertAtCaret: () => pick(),
		importSection: (like, index) => pick({ like, index }),
		pendingName,
		applied: () => {
			const { yDoc, doc } = now.current
			takeHeld((parsed) => fillFirstSection(yDoc, doc, parsed))
		}
	}
}

// vim: ts=4
