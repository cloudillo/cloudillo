// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/** Section helpers shared by the Sections tab, the section popover and the page labels. */

import { useDialog } from '@cloudillo/react'
import type { TFunction } from 'i18next'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import type * as Y from 'yjs'

import { deltaOf } from '../crdt/delta-cache'
import { sectionNumber, sectionOf } from '../crdt/entities'
import { deleteSection } from '../crdt/section-ops'
import type { YPagilloDocument } from '../crdt/stored-types'
import { storyText } from '../editor/caret'
import { inheritedProps, paragraphsIn } from '../editor/commands'

/** Story delta (`deltaOf`, identity per content) → title; reset on any style change. */
let titles = new WeakMap<object, string | null>()
const watched = new WeakSet<YPagilloDocument>()

/** Text of the first heading (`tocLevel`) paragraph of `tx`, or null. */
function storyTitle(doc: YPagilloDocument, tx: Y.Text): string | null {
	if (!watched.has(doc)) {
		watched.add(doc)
		// `tocLevel` lives in the style chain, which the delta key does not see.
		doc.st.observeDeep(() => {
			titles = new WeakMap()
		})
	}
	const key = deltaOf(tx)
	const hit = titles.get(key)
	if (hit !== undefined) return hit
	let title: string | null = null
	const txt = storyText(tx)
	let start = 0
	for (const p of paragraphsIn(tx, 0, Math.max(0, tx.length - 1))) {
		const s = txt.slice(start, p.index).replace(/￼/g, '').trim()
		if (s && inheritedProps(doc, p.attrs.ps).tocLevel) {
			title = s
			break
		}
		start = p.index + 1
	}
	titles.set(key, title)
	return title
}

/** Section `id`'s name: its `name`, else its title (first heading paragraph), else "Section n". */
export function sectionDisplayName(doc: YPagilloDocument, id: string, t: TFunction): string {
	const sec = sectionOf(doc, id)
	if (sec?.name) return sec.name
	const tx = sec && doc.tx.get(sec.story)
	return (tx && storyTitle(doc, tx)) || t('Section {{n}}', { n: sectionNumber(doc, id) })
}

/**
 * `snap()`, re-read on any change incl. story text (which `useDocVersion` skips); re-renders only
 * when the string changes.
 */
export function useDocSnapshot(doc: YPagilloDocument, snap: () => string): string {
	const subscribe = React.useCallback(
		(cb: () => void) => {
			const roots: Pick<Y.AbstractType<unknown>, 'observeDeep' | 'unobserveDeep'>[] = [
				doc.tx,
				doc.s,
				doc.secs,
				doc.st
			]
			for (const r of roots) r.observeDeep(cb)
			return () => {
				for (const r of roots) r.unobserveDeep(cb)
			}
		},
		[doc]
	)
	return React.useSyncExternalStore(subscribe, snap)
}

/** "n · name" above a section's first page (page chrome: `PageList` `pageLabel`). */
export function SectionPageLabel({ doc, id }: { doc: YPagilloDocument; id: string }) {
	const { t } = useTranslation()
	return useDocSnapshot(
		doc,
		() => `${sectionNumber(doc, id)} · ${sectionDisplayName(doc, id, t)}`
	)
}

/** Confirm, then remove a section. Resolves true when removed. */
export function useRemoveSection(
	yDoc: Y.Doc,
	doc: YPagilloDocument
): (id: string) => Promise<boolean> {
	const { t } = useTranslation()
	const dialog = useDialog()
	return async (id) => {
		const ok = await dialog.confirm(
			t('Remove section'),
			t('The section and all its text and images are removed.')
		)
		if (ok) deleteSection(yDoc, doc, id)
		return !!ok
	}
}

// vim: ts=4
