// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * The text context menu (right-click on text, Shift+F10, the Menu key): Cut · Copy · Paste
 * (readers: Copy), then on a misspelled word its suggestions, Add to dictionary (per user,
 * IndexedDB `pagillo-spell`) and Ignore in this publication (`m.spellIgnore`). `children` is the
 * extension slot: further items after the clipboard group.
 */

import { Menu, MenuDivider, MenuItem } from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { setMeta } from '../crdt/document'
import type { LayoutState } from '../layout/useLayout'
import { selFrom, selTo, storyText } from './caret'
import type { CommandCtx } from './commands'
import { deleteRange, insertText } from './text-edit'
import { addUserWord, userWords } from './user-words'

export interface TextMenuProps {
	/** Viewport position (client px). */
	at: { x: number; y: number }
	ctx: CommandCtx
	layout: LayoutState
	/** Writer: Cut / Paste and the spelling items. */
	canEdit: boolean
	/** Spelling items shown (`ViewPrefs.spell`). */
	spell: boolean
	onClose(): void
	/** Extension slot: `MenuItem`s placed after the clipboard group. */
	children?: React.ReactNode
}

/** The misspelling at the selection head: story range, word and language. */
function misspelling(ctx: CommandCtx, layout: LayoutState) {
	const s = ctx.editor.sel
	if (!s) return
	const off = selFrom(s)
	const pl = ctx.editor.index.stories.get(s.story)?.find((p) => p.from <= off && off <= p.to)
	if (!pl) return
	const start = pl.from - pl.line.from
	const rel = off - start
	const r = layout.spell
		.get(s.story)
		?.get(pl.line.bid)
		?.find((x) => x.from <= rel && rel <= x.to)
	const t = ctx.doc.tx.get(s.story)
	if (!r || !t || selTo(s) > start + r.to) return
	const from = start + r.from
	const to = start + r.to
	// The ranges lag the text by a spell pass: a stale one no longer covers its word.
	if (storyText(t).slice(from, to) !== r.word) return
	return { story: s.story, from, to, word: r.word, lang: r.lang }
}

export function TextMenu({ at, ctx, layout, canEdit, spell, onClose, children }: TextMenuProps) {
	const { t } = useTranslation()
	const { editor } = ctx
	// Snapshot at open: computed once per opening.
	const [miss] = React.useState(() => (canEdit && spell ? misspelling(ctx, layout) : undefined))
	const [suggestions, setSuggestions] = React.useState<string[]>()
	React.useEffect(() => {
		if (!miss) return
		let live = true
		layout.suggest(miss.word, miss.lang).then((s) => {
			if (live) setSuggestions(s)
		})
		return () => {
			live = false
		}
	}, [miss, layout.suggest])

	const close = () => {
		onClose()
		editor.focus()
	}
	// The document `copy` / `cut` listeners of `useClipboard` do the work.
	const clip = (c: 'copy' | 'cut') => {
		editor.focus()
		document.execCommand(c)
	}
	const replaceSel = (text: string) =>
		editor.run((tx, from, to) => {
			deleteRange(tx, from, to)
			return insertText(tx, from, text)
		})
	const paste = async () => {
		const text = await navigator.clipboard.readText().catch((err) => {
			console.warn('pagillo paste:', err)
		})
		if (text === undefined) return
		// Plain text only; Ctrl+V keeps the rich paste.
		replaceSel(text)
	}
	const replace = (word: string) => {
		// A peer edit may have moved the word since the menu opened.
		const tx = miss && ctx.doc.tx.get(miss.story)
		if (!miss || !tx || storyText(tx).slice(miss.from, miss.to) !== miss.word) return
		editor.select({ story: miss.story, anchor: miss.from, head: miss.to })
		replaceSel(word)
	}

	return (
		<Menu position={at} onClose={close}>
			{miss && (
				<>
					{suggestions === undefined ? null : suggestions.length ? (
						suggestions.map((w) => (
							<MenuItem key={w} label={w} onClick={() => replace(w)} />
						))
					) : (
						<MenuItem label={t('No suggestions')} disabled />
					)}
					<MenuItem
						label={t('Add to dictionary')}
						onClick={() => {
							void addUserWord(miss.word)
								.then(userWords)
								.then((w) => layout.setSpell(undefined, w))
								.catch((err) => console.warn('pagillo spell:', err))
						}}
					/>
					<MenuItem
						label={t('Ignore in this publication')}
						onClick={() => setMeta(ctx.yDoc, ctx.doc, { spellIgnore: [miss.word] })}
					/>
					<MenuDivider />
				</>
			)}
			{canEdit && <MenuItem label={t('Cut')} onClick={() => clip('cut')} />}
			<MenuItem label={t('Copy')} onClick={() => clip('copy')} />
			{canEdit && <MenuItem label={t('Paste')} onClick={() => void paste()} />}
			{children}
		</Menu>
	)
}

// vim: ts=4
