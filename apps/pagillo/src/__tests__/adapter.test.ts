// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { Engine, ParagraphPatch, Publication, Run, Story } from '@cloudillo/typeset'
import * as Y from 'yjs'

import { openPublication } from '../crdt/document.js'
import type { StoredSection } from '../crdt/stored-types.js'
import { PublicationAdapter } from '../worker/adapter.js'

describe('PublicationAdapter', () => {
	it('rebuilds when a composition patch throws', () => {
		const yDoc = new Y.Doc()
		const doc = openPublication(yDoc)
		const t = new Y.Text()
		doc.tx.set('S', t)
		t.insert(0, 'ab\n', { bid: 'A' })
		doc.s.set('s1', { story: 'S' } as StoredSection)
		doc.secs.push(['s1'])

		const calls = { pub: 0, patch: 0 }
		let last: Publication | undefined
		const engine = {
			setPublication: (pub: Publication) => {
				calls.pub++
				last = pub
			},
			patch: () => {
				calls.patch++
				throw new Error('drift')
			}
		}
		const warn = console.warn
		console.warn = () => {}
		try {
			const adapter = new PublicationAdapter(yDoc, engine as unknown as Engine)
			expect(calls.pub).toBe(1)
			adapter.compose({ story: 'S', offset: 1, text: 'x' })
			expect(calls).toEqual({ pub: 2, patch: 1 })
			// The rebuild keeps the composition in the story it hands the engine.
			const runs = last?.sections[0].story.paragraphs[0].runs as Run[]
			expect(runs.find((r) => r.text === 'x')?.marks.underline).toBe(true)
		} finally {
			console.warn = warn
		}
	})

	it('keeps unchanged paragraphs and hands only the edited one to drainFresh', () => {
		const yDoc = new Y.Doc()
		const doc = openPublication(yDoc)
		const t = new Y.Text()
		doc.tx.set('S', t)
		t.insert(0, 'aa\n', { bid: 'A' })
		t.insert(3, 'bb\n', { bid: 'B' })
		doc.s.set('s1', { story: 'S' } as StoredSection)
		doc.secs.push(['s1'])

		const patches: ParagraphPatch[] = []
		const engine = {
			setPublication: () => {},
			patch: (ps: ParagraphPatch[]) => {
				patches.push(...ps)
			}
		}
		const adapter = new PublicationAdapter(yDoc, engine as unknown as Engine)
		expect(adapter.drainFresh().map((q) => q.bid)).toEqual(['A', 'B'])
		expect(adapter.drainFresh()).toEqual([])
		const stories = (adapter as unknown as { stories: Map<string, Story> }).stories
		const [a0] = stories.get('S')?.paragraphs ?? []

		t.insert(4, 'x')
		expect(patches.map(({ bid, op }) => ({ bid, op }))).toEqual([{ bid: 'B', op: 'set' }])
		const [a1, b1] = stories.get('S')?.paragraphs ?? []
		expect(a1).toBe(a0)
		expect(adapter.drainFresh()).toEqual([b1])
		expect(b1).toBe(patches[0].paragraph)
	})
})

// vim: ts=4
