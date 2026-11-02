// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import type { TFunction } from 'i18next'
import * as Y from 'yjs'

import { openPublication } from '../crdt/document.js'
import { newSectionMap, newStyleMap, sectionOf } from '../crdt/entities.js'
import { duplicateSection } from '../crdt/section-ops.js'
import type { StoredSection, StoredStyle } from '../crdt/stored-types.js'
import { sectionDisplayName } from '../view/section-utils.js'

/** Stub `t`: interpolates `{{key}}`. */
const t = ((s: string, o?: Record<string, unknown>) =>
	s.replace(/\{\{(\w+)\}\}/g, (_, k) => String(o?.[k]))) as unknown as TFunction

/** Sections s1 (story S1: body "Intro", heading "Title") and s2 (story S2: body only). */
function setup() {
	const yDoc = new Y.Doc()
	const doc = openPublication(yDoc)
	doc.st.set('h', newStyleMap({ k: 'p', name: 'H', props: { tocLevel: 1 } } as StoredStyle))
	doc.st.set('b', newStyleMap({ k: 'p', name: 'Body', props: {} } as StoredStyle))
	const s1 = new Y.Text()
	const s2 = new Y.Text()
	doc.tx.set('S1', s1)
	doc.tx.set('S2', s2)
	s1.applyDelta([
		{ insert: 'Intro' },
		{ insert: '\n', attributes: { ps: 'b' } },
		{ insert: 'Title' },
		{ insert: '\n', attributes: { ps: 'h' } }
	])
	s2.applyDelta([{ insert: 'Body' }, { insert: '\n', attributes: { ps: 'b' } }])
	doc.s.set('s1', newSectionMap({ story: 'S1' } as StoredSection))
	doc.s.set('s2', newSectionMap({ story: 'S2' } as StoredSection))
	doc.secs.push(['s1', 's2'])
	return { yDoc, doc, s1 }
}

describe('sectionDisplayName', () => {
	it('name, else first heading, else "Section n"', () => {
		const { doc } = setup()
		expect(sectionDisplayName(doc, 's1', t)).toBe('Title')
		expect(sectionDisplayName(doc, 's2', t)).toBe('Section 2')
		;(doc.s.get('s1') as Y.Map<unknown>).set('name', 'Named')
		expect(sectionDisplayName(doc, 's1', t)).toBe('Named')
	})

	it('follows story edits and heading style changes', () => {
		const { doc, s1 } = setup()
		expect(sectionDisplayName(doc, 's1', t)).toBe('Title')
		s1.insert(6, 'New ')
		expect(sectionDisplayName(doc, 's1', t)).toBe('New Title')
		;(doc.st.get('b') as Y.Map<unknown>).set('p/tocLevel', 2)
		expect(sectionDisplayName(doc, 's1', t)).toBe('Intro')
	})
})

it('duplicateSection appends the suffix, kept within the length cap', () => {
	const { yDoc, doc } = setup()
	const y = doc.s.get('s1') as Y.Map<unknown>
	y.set('name', 'A')
	const copy = duplicateSection(yDoc, doc, 's1', ' (copy)')
	expect(copy && sectionOf(doc, copy)?.name).toBe('A (copy)')
	y.set('name', 'x'.repeat(80))
	const name = sectionOf(doc, duplicateSection(yDoc, doc, 's1', ' (copy)') ?? '')?.name ?? ''
	expect(name.length).toBeLessThanOrEqual(80)
	expect(name.endsWith(' (copy)')).toBe(true)
})

// vim: ts=4
