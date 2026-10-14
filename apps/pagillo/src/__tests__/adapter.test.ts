// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type {
	Engine,
	ParagraphPatch,
	Publication,
	Run,
	Story,
	TextFrameData
} from '@cloudillo/typeset'
import * as Y from 'yjs'

import { openPublication } from '../crdt/document.js'
import {
	addFrame,
	breakThreadAfter,
	canLinkTarget,
	chainOf,
	chainOfStory,
	deleteFrame,
	linkFrame,
	linkTargets,
	threadAnnouncements,
	threadStates
} from '../crdt/frame-ops.js'
import { deleteSection } from '../crdt/section-ops.js'
import type {
	StoredFrame,
	StoredMaster,
	StoredSection,
	StoredTextFrameData,
	YPagilloDocument
} from '../crdt/stored-types.js'
import { textChains, toEnginePublication } from '../crdt/type-converters.js'
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

describe('text chains', () => {
	const box = {
		x: 0,
		y: 0,
		w: 100,
		h: 100,
		rot: 0,
		z: 1,
		wrap: { mode: 'none' as const, off: 0 }
	}
	function setup() {
		const yDoc = new Y.Doc()
		const doc = openPublication(yDoc)
		doc.secs.push(['s1'])
		const txt = (page: number, text?: string, sec = 's1') => {
			const id = addFrame(
				yDoc,
				doc,
				{ t: 'txt', anchor: { sec, page }, ...box, data: {} },
				{ paras: [{}] }
			)
			if (text) doc.tx.get(storyOf(doc, id) ?? '')?.insert(0, text)
			return id
		}
		return { yDoc, doc, txt }
	}
	const storyOf = (doc: YPagilloDocument, id: string) =>
		(doc.f.get(id)?.data as StoredTextFrameData | undefined)?.story

	it('links empty unchained text frames and refuses the rest', () => {
		const { yDoc, doc, txt } = setup()
		const a = txt(0, 'hello')
		const b = txt(2)
		const c = txt(1)
		const full = txt(0, 'own')
		const img = addFrame(yDoc, doc, {
			t: 'img',
			anchor: { sec: 's1', page: 0 },
			...box,
			data: {}
		} as StoredFrame)
		const bStory = storyOf(doc, b) ?? ''
		expect(linkTargets(doc, a)).toEqual([c, b])
		expect(linkFrame(yDoc, doc, a, b)).toBe(true)
		expect(doc.f.get(b)?.data).toEqual({})
		expect(doc.tx.has(bStory)).toBe(false)
		expect(linkFrame(yDoc, doc, b, c)).toBe(true)
		expect(chainOf(doc, c)).toEqual({ head: a, frames: [a, b, c] })
		expect(canLinkTarget(doc, a, b)).toBe('inThread')
		expect(canLinkTarget(doc, a, full)).toBe('hasText')
		expect(canLinkTarget(doc, a, img)).toBe('notText')
		expect(linkFrame(yDoc, doc, a, full)).toBe(false)
		const m = addFrame(
			yDoc,
			doc,
			{ t: 'txt', anchor: { sec: '', page: 0 }, ...box, data: {} },
			{
				paras: [{}]
			}
		)
		doc.ms.set('M', { items: [m] } as unknown as StoredMaster)
		expect(canLinkTarget(doc, a, m)).toBe('layoutItem')
	})

	it('caches textChains until frames or masters change', () => {
		const { yDoc, doc, txt } = setup()
		const a = txt(0, 'hello')
		const b = txt(1)
		const c = txt(2)
		const first = textChains(doc)
		expect(textChains(doc)).toBe(first)
		linkFrame(yDoc, doc, a, b)
		linkFrame(yDoc, doc, a, c)
		const linked = textChains(doc)
		expect(linked).not.toBe(first)
		expect(linked).toEqual(new Map([[a, [b, c]]]))
		expect(textChains(doc)).toBe(linked)
		breakThreadAfter(yDoc, doc, b)
		const broken = textChains(doc)
		expect(broken).toEqual(new Map([[a, [b]]]))
		doc.ms.set('M', { items: [b] } as unknown as StoredMaster)
		expect(textChains(doc)).not.toBe(broken)
		expect(textChains(doc)).toEqual(new Map())
	})

	it('deleting a follower removes it from the chain', () => {
		const { yDoc, doc, txt } = setup()
		const [a, b, c] = [txt(0, 'x'), txt(0), txt(0)]
		linkFrame(yDoc, doc, a, b)
		linkFrame(yDoc, doc, a, c)
		deleteFrame(yDoc, doc, b)
		expect(chainOf(doc, a)?.frames).toEqual([a, c])
	})

	it('deleting a head promotes the next frame with the story intact', () => {
		const { yDoc, doc, txt } = setup()
		const [a, b, c] = [txt(0, 'keep'), txt(0), txt(1)]
		const story = storyOf(doc, a) ?? ''
		linkFrame(yDoc, doc, a, b)
		linkFrame(yDoc, doc, a, c)
		deleteFrame(yDoc, doc, a)
		expect(doc.f.get(b)?.data).toEqual({ story, chain: [c] })
		expect(doc.tx.get(story)?.toString()).toContain('keep')
		deleteFrame(yDoc, doc, b)
		expect(doc.f.get(c)?.data).toEqual({ story })
		deleteFrame(yDoc, doc, c)
		expect(doc.tx.has(story)).toBe(false)
	})

	it('break thread gives dropped frames fresh empty stories', () => {
		const { yDoc, doc, txt } = setup()
		const [a, b, c] = [txt(0, 'x'), txt(0), txt(0)]
		linkFrame(yDoc, doc, a, b)
		linkFrame(yDoc, doc, a, c)
		breakThreadAfter(yDoc, doc, a)
		expect(chainOf(doc, a)).toBeUndefined()
		expect(doc.f.get(a)?.data).toEqual({ story: storyOf(doc, a) })
		for (const id of [b, c]) {
			const s = storyOf(doc, id) ?? ''
			expect(s).not.toBe(storyOf(doc, a))
			expect(doc.tx.get(s)?.toString()).toBe('\n')
		}
	})

	it('the converter drops invalid chain ids and emits followers as {}', () => {
		const { yDoc, doc, txt } = setup()
		const [a, b, full] = [txt(0, 'x'), txt(0), txt(0, 'y')]
		linkFrame(yDoc, doc, a, b)
		const story = storyOf(doc, a)
		const raw = { story, chain: [b, 'missing', full, b] }
		doc.f.set(a, { ...(doc.f.get(a) as StoredFrame), data: raw })
		const frames = toEnginePublication(doc).frames
		expect((frames[a].data as TextFrameData).chain).toEqual([b])
		expect(frames[b].data).toEqual({})
	})

	it('a doubly claimed follower goes to the lowest head id, whatever the insertion order', () => {
		for (const order of [
			['h2', 'h1'],
			['h1', 'h2']
		]) {
			const { doc, txt } = setup()
			const tmpl = doc.f.get(txt(0)) as StoredFrame
			const b = 'f'
			doc.f.set(b, { ...tmpl, data: {} })
			for (const id of order)
				doc.f.set(id, { ...tmpl, data: { story: `st-${id}`, chain: [b] } })
			const frames = toEnginePublication(doc).frames
			expect((frames.h1.data as TextFrameData).chain).toEqual([b])
			expect((frames.h2.data as TextFrameData).chain).toBeUndefined()
		}
	})

	it('link and break keep box styling', () => {
		const { yDoc, doc, txt } = setup()
		const [a, b] = [txt(0, 'x'), txt(0)]
		const style = (id: string, inset: number, fill: string) => {
			const f = doc.f.get(id) as StoredFrame
			doc.f.set(id, { ...f, data: { ...f.data, inset, fill } })
		}
		style(a, 5, 'red')
		style(b, 7, 'blue')
		linkFrame(yDoc, doc, a, b)
		expect(doc.f.get(a)?.data).toMatchObject({ inset: 5, fill: 'red', chain: [b] })
		expect(doc.f.get(b)?.data).toEqual({ inset: 7, fill: 'blue' })
		breakThreadAfter(yDoc, doc, a)
		expect(doc.f.get(a)?.data).toEqual({ story: storyOf(doc, a), inset: 5, fill: 'red' })
		expect(doc.f.get(b)?.data).toMatchObject({ inset: 7, fill: 'blue' })
	})

	it('deleting a section hands a thread running on into another section its text', () => {
		const { yDoc, doc, txt } = setup()
		doc.secs.push(['s2'])
		const [a, b] = [txt(0, 'keep'), txt(0, undefined, 's2')]
		const story = storyOf(doc, a) ?? ''
		linkFrame(yDoc, doc, a, b)
		deleteSection(yDoc, doc, 's1')
		expect(doc.f.has(a)).toBe(false)
		expect(doc.f.get(b)?.data).toEqual({ story })
		expect(doc.tx.get(story)?.toString()).toContain('keep')
	})

	it('threadStates, threadAnnouncements and chainOfStory follow the chain', () => {
		const { yDoc, doc, txt } = setup()
		const [a, b] = [txt(0, 'x'), txt(1)]
		const story = storyOf(doc, a) ?? ''
		expect(chainOfStory(doc, story)).toEqual({ head: a, frames: [a] })
		const before = threadStates(doc, [])
		linkFrame(yDoc, doc, a, b)
		expect(chainOfStory(doc, story)).toEqual({ head: a, frames: [a, b] })
		const linked = threadStates(doc, [{ frame: b }])
		expect(linked.get(story)).toEqual({ m: 2, over: true })
		expect(threadAnnouncements(before, linked)).toEqual([{ kind: 'linked', m: 2 }])
		expect(threadAnnouncements(linked, linked)).toEqual([])
		const fits = new Map([[story, { m: 2, over: false }]])
		const unlinked = new Map([[story, { m: 1, over: true }]])
		expect(threadAnnouncements(fits, unlinked)).toEqual([{ kind: 'overset' }])
		expect(threadAnnouncements(linked, unlinked)).toEqual([])
	})
})

// vim: ts=4
