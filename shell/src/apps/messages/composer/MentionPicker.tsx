// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { Avatar, List, ListItem, Panel, ProfilePicture } from '@cloudillo/react'
import type { Profile } from '@cloudillo/types'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

export interface MentionOption {
	idTag: string
	name: string
	profile?: Profile
}

const MAX_OPTIONS = 8

/** The `@query` right before the caret inside `editor` (`''` just after `@`), or undefined. */
export function mentionQuery(editor: HTMLElement | null): string | undefined {
	const sel = window.getSelection()
	const node = sel?.anchorNode
	if (!editor || !sel?.isCollapsed || !node || node.nodeType !== Node.TEXT_NODE) return
	if (!editor.contains(node)) return
	const before = (node.textContent ?? '').slice(0, sel.anchorOffset)
	return before.match(/(?:^|\s)@([^\s@]*)$/)?.[1]
}

/** Selects the `@query` before the caret, so the next insert replaces it. */
export function selectMentionQuery(editor: HTMLElement | null) {
	const query = mentionQuery(editor)
	const sel = window.getSelection()
	if (query === undefined || !sel?.anchorNode) return
	const range = document.createRange()
	range.setStart(sel.anchorNode, sel.anchorOffset - query.length - 1)
	range.setEnd(sel.anchorNode, sel.anchorOffset)
	sel.removeAllRanges()
	sel.addRange(range)
}

/** Members matching `query` by name or idTag (`@all` first, only for moderator+). */
export function mentionOptions(
	members: Profile[],
	query: string,
	canMentionAll: boolean,
	allLabel: string
): MentionOption[] {
	const q = query.toLowerCase()
	const out: MentionOption[] =
		canMentionAll && 'all'.startsWith(q) ? [{ idTag: 'all', name: allLabel }] : []
	for (const p of members) {
		if (out.length >= MAX_OPTIONS) break
		const name = p.name || p.idTag
		if (p.idTag.toLowerCase().startsWith(q) || name.toLowerCase().includes(q)) {
			out.push({ idTag: p.idTag, name, profile: p })
		}
	}
	return out
}

export interface MentionPickerProps {
	/** Listbox id, for the editor's `aria-controls` */
	id: string
	options: MentionOption[]
	activeIndex: number
	onPick: (idTag: string) => void
}

/** Option id for `aria-activedescendant` */
export function mentionOptionId(listId: string, i: number) {
	return `${listId}-${i}`
}

/**
 * The `@` autocomplete above the composer. Focus stays in the editor (keyboard is
 * handled there, `aria-activedescendant` points here); a mouse pick keeps the caret.
 */
export function MentionPicker({ id, options, activeIndex, onPick }: MentionPickerProps) {
	const { t } = useTranslation()
	return (
		<Panel className="mb-1">
			<List id={id} role="listbox" aria-label={t('Mention someone')}>
				{options.map((o, i) => (
					<ListItem
						key={o.idTag}
						id={mentionOptionId(id, i)}
						role="option"
						aria-selected={i === activeIndex}
						selected={i === activeIndex}
						size="sm"
						className="interactive"
						leading={
							o.profile ? (
								<ProfilePicture profile={o.profile} size="sm" />
							) : (
								<Avatar size="sm" fallback="@" />
							)
						}
						title={o.name}
						subtitle={`@${o.idTag}`}
						// Keep the editor's focus and caret
						onMouseDown={(evt) => evt.preventDefault()}
						onPointerUp={() => onPick(o.idTag)}
					/>
				))}
			</List>
		</Panel>
	)
}

// vim: ts=4
