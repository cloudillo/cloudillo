// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Paragraph / character style operations (`st` map).
 */

import type * as Y from 'yjs'

import { setMeta } from './document'
import { newStyleMap, patchStyle, styleOf, stylesOf } from './entities'
import { newId, type StyleId } from './ids'
import type { StoredStyle, YPagilloDocument } from './stored-types'
import { readMeta } from './type-converters'

export function addStyle(yDoc: Y.Doc, doc: YPagilloDocument, style: StoredStyle): StyleId {
	const id = newId()
	yDoc.transact(() => {
		doc.st.set(id, newStyleMap(style))
	}, yDoc.clientID)
	return id
}

/**
 * Patch a style; only the changed keys are written. `props` is per property: a prop set to
 * `undefined` is removed (falls back to `basedOn`). `basedOn: undefined` detaches the style.
 */
export function updateStyle(
	yDoc: Y.Doc,
	doc: YPagilloDocument,
	id: StyleId,
	patch: Partial<Omit<StoredStyle, 'k'>>
): void {
	const y = doc.st.get(id)
	if (!y) return
	const { props, ...rest } = patch
	yDoc.transact(() => {
		patchStyle(y, { ...rest, ...(props ? { props: { ...props } } : {}) })
	}, yDoc.clientID)
}

/**
 * Delete a style. Styles based on it inherit its parent; `m.styleMap` entries pointing at it
 * are dropped. Paragraphs still using it fall back to the engine defaults until restyled.
 */
export function deleteStyle(yDoc: Y.Doc, doc: YPagilloDocument, id: StyleId): void {
	const cur = styleOf(doc, id)
	if (!cur) return
	yDoc.transact(() => {
		for (const [sid, s] of stylesOf(doc))
			if (s.basedOn === id) patchStyle(doc.st.get(sid), { basedOn: cur.basedOn })
		doc.st.delete(id)
		const drop = Object.entries(readMeta(doc.m).styleMap ?? {}).filter(([, v]) => v === id)
		if (drop.length)
			setMeta(yDoc, doc, { styleMap: Object.fromEntries(drop.map(([k]) => [k, undefined])) })
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
	for (const [id, s] of stylesOf(doc)) byName.set(`${s.k}:${s.name}`, id)
	const ids: Record<string, StyleId> = {}
	for (const [key, s] of Object.entries(set)) ids[key] = byName.get(`${s.k}:${s.name}`) ?? newId()
	yDoc.transact(() => {
		for (const [key, s] of Object.entries(set)) {
			const { basedOn, ...rest } = s
			const target = basedOn === undefined ? undefined : ids[basedOn]
			doc.st.set(ids[key], newStyleMap(target ? { ...rest, basedOn: target } : rest))
		}
	}, yDoc.clientID)
	return ids
}

// vim: ts=4
