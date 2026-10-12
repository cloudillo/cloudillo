// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Paragraph / character style operations (`st` map).
 */

import type * as Y from 'yjs'

import { newId, type StyleId } from './ids'
import type { StoredStyle, StyleMap, YPagilloDocument } from './stored-types'

export function addStyle(yDoc: Y.Doc, doc: YPagilloDocument, style: StoredStyle): StyleId {
	const id = newId()
	yDoc.transact(() => {
		doc.st.set(id, style)
	}, yDoc.clientID)
	return id
}

/**
 * Patch a style. `props` is merged into the current props; a prop set to `undefined` is
 * removed (falls back to `basedOn`). `basedOn: undefined` detaches the style.
 */
export function updateStyle(
	yDoc: Y.Doc,
	doc: YPagilloDocument,
	id: StyleId,
	patch: Partial<Omit<StoredStyle, 'k'>>
): void {
	const cur = doc.st.get(id)
	if (!cur) return
	const next: Record<string, unknown> = { ...cur, ...patch }
	if (patch.props) {
		const props: Record<string, unknown> = { ...cur.props, ...patch.props }
		for (const k of Object.keys(props)) if (props[k] === undefined) delete props[k]
		next.props = props
	}
	if ('basedOn' in patch && patch.basedOn === undefined) delete next.basedOn
	yDoc.transact(() => {
		doc.st.set(id, next as StoredStyle)
	}, yDoc.clientID)
}

/**
 * Delete a style. Styles based on it inherit its parent; `m.styleMap` entries pointing at it
 * are dropped. Paragraphs still using it fall back to the engine defaults until restyled.
 */
export function deleteStyle(yDoc: Y.Doc, doc: YPagilloDocument, id: StyleId): void {
	const cur = doc.st.get(id)
	if (!cur) return
	yDoc.transact(() => {
		doc.st.forEach((s, sid) => {
			if (s.basedOn !== id) return
			const { basedOn: _b, ...rest } = s
			doc.st.set(sid, (cur.basedOn ? { ...rest, basedOn: cur.basedOn } : rest) as StoredStyle)
		})
		doc.st.delete(id)
		const map = doc.m.get('styleMap') as StyleMap | undefined
		if (map && Object.values(map).includes(id)) {
			doc.m.set(
				'styleMap',
				Object.fromEntries(Object.entries(map).filter(([, v]) => v !== id))
			)
		}
	}, yDoc.clientID)
}

/**
 * Apply a style set ("Apply style set from template…"): each incoming style replaces
 * the definition of the existing style with the same kind and name (its id, and so every
 * paragraph using it, is kept); unmatched styles are added under fresh ids. `basedOn` refs
 * inside the set are remapped. Returns incoming key → id in this document.
 */
export function applyStyleSet(
	yDoc: Y.Doc,
	doc: YPagilloDocument,
	set: Record<string, StoredStyle>
): Record<string, StyleId> {
	const byName = new Map<string, StyleId>()
	doc.st.forEach((s, id) => {
		byName.set(`${s.k}:${s.name}`, id)
	})
	const ids: Record<string, StyleId> = {}
	for (const [key, s] of Object.entries(set)) ids[key] = byName.get(`${s.k}:${s.name}`) ?? newId()
	yDoc.transact(() => {
		for (const [key, s] of Object.entries(set)) {
			const { basedOn, ...rest } = s
			const target = basedOn === undefined ? undefined : ids[basedOn]
			doc.st.set(ids[key], (target ? { ...rest, basedOn: target } : rest) as StoredStyle)
		}
	}, yDoc.clientID)
	return ids
}

// vim: ts=4
