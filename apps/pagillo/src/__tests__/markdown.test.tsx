// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import * as Y from 'yjs'

import { deltaOf } from '../crdt/delta-cache.js'
import { openPublication, setMeta } from '../crdt/document.js'
import { newSectionMap, sectionOf, styleOf } from '../crdt/entities.js'
import type { StoredSection } from '../crdt/stored-types.js'
import { addStyle } from '../crdt/style-ops.js'
import { cellOf, type DeltaOp, readMeta } from '../crdt/type-converters.js'
import { htmlToDelta } from '../editor/clipboard.js'
import {
	addMarkdownSection,
	CODE_FONT,
	fillFirstSection,
	fillStory,
	markdownOps,
	parseMarkdown
} from '../editor/markdown.js'

function setup(sec: Partial<StoredSection> = {}) {
	const yDoc = new Y.Doc()
	const doc = openPublication(yDoc)
	const t = new Y.Text()
	doc.s.set('s1', newSectionMap({ story: 'S', ...sec } as StoredSection))
	doc.secs.push(['s1'])
	doc.tx.set('S', t)
	const style = (name: string) => addStyle(yDoc, doc, { k: 'p', name, props: {} })
	const ids = {
		p: style('Body'),
		h1: style('Heading 1'),
		h2: style('Heading 2'),
		h3: style('Heading 3'),
		quote: style('Quote')
	}
	setMeta(yDoc, doc, { styleMap: ids })
	return { yDoc, doc, t, ids }
}

type Setup = ReturnType<typeof setup>

const label = (alt: string) => (alt ? `[Image: ${alt}]` : '[Image]')
const parse = (s: Setup, md: string) => parseMarkdown(s.doc, md, label)

/** Each line's text and line attributes. */
function paragraphs(t: Y.Text) {
	const out: ({ text: string } & Record<string, unknown>)[] = []
	let text = ''
	for (const op of t.toDelta() as DeltaOp[]) {
		if (op.insert === '\n') {
			out.push({ text, ...op.attributes })
			text = ''
		} else text += op.insert as string
	}
	return out
}

const fill = (s: Setup, ops: DeltaOp[]) => {
	s.yDoc.transact(() => {
		fillStory(s.doc, s.t, ops)
	}, s.yDoc.clientID)
}

/** Import `md` into the story `S`. */
function load(s: Setup, md: string) {
	const parsed = parse(s, md)
	s.yDoc.transact(() => {
		fillStory(s.doc, s.t, markdownOps(s.yDoc, s.doc, parsed))
	}, s.yDoc.clientID)
	return { parsed, paras: paragraphs(s.t) }
}

const undoManager = ({ yDoc, doc }: Setup) =>
	new Y.UndoManager([doc.tx, doc.f, doc.st, doc.ms, doc.s], {
		trackedOrigins: new Set([yDoc.clientID])
	})

function section(s: Setup, md: string, index = 1) {
	const r = addMarkdownSection(s.yDoc, s.doc, parse(s, md), 's1', index)
	if (!r) throw new Error('no section')
	return r
}

const styleNamed = (s: Setup, name: string) =>
	[...s.doc.st.values()].filter((y) => y.get('name') === name)

const CODE_BLOCK = '```\nx\n  y\n```\n'

describe('Markdown blocks', () => {
	it('maps headings; H4-H6 fall to H3 unless the publication has that level', () => {
		const s = setup()
		const { paras } = load(s, '# a\n\n## b\n\n### c\n\n#### d\n\n###### e\n\ntext\n')
		expect(paras.map((p) => [p.text, p.ps])).toEqual([
			['a', s.ids.h1],
			['b', s.ids.h2],
			['c', s.ids.h3],
			['d', s.ids.h3],
			['e', s.ids.h3],
			['text', s.ids.p]
		])

		const h4 = addStyle(s.yDoc, s.doc, { k: 'p', name: 'Heading 4', props: {} })
		setMeta(s.yDoc, s.doc, { styleMap: { h4 } })
		expect(load(s, '#### d\n').paras[0].ps).toBe(h4)
	})

	it('keeps bullets on tight, nested and loose lists', () => {
		const s = setup()
		expect(load(s, '- a\n- b\n  - c\n').paras.map((p) => [p.text, p.list, p.indent])).toEqual([
			['a', 'bullet', undefined],
			['b', 'bullet', undefined],
			['c', 'bullet', 1]
		])
		expect(load(s, '- a\n\n- b\n').paras.map((p) => [p.text, p.list, p.ps])).toEqual([
			['a', 'bullet', s.ids.p],
			['b', 'bullet', s.ids.p]
		])
		expect(load(s, '1. a\n2. b\n').paras.map((p) => p.list)).toEqual(['ordered', 'ordered'])
	})

	it('keeps the quote style across paragraphs', () => {
		const s = setup()
		const { paras } = load(s, '> q1\n>\n> q2\n')
		expect(paras.map((p) => [p.text, p.ps])).toEqual([
			['q1', s.ids.quote],
			['q2', s.ids.quote]
		])
	})

	it('turns tables into cell lines', () => {
		const { paras } = load(setup(), '| a | b |\n|---|---|\n| 1 | 2 |\n')
		expect(paras[0]['table-temporary']).toBeDefined()
		// The last line is the paragraph that closes the story.
		const cells = paras.slice(1, -1)
		expect(cells.map((c) => c.text)).toEqual(['a', 'b', '1', '2'])
		expect(cells[0]['table-th-block']).toBeTruthy()
		expect(cells[2]['table-cell-block']).toBeTruthy()
	})

	it('leaves no empty line after a code block', () => {
		const { paras } = load(setup(), '```js\nx\n```\n\nafter\n')
		expect(paras.map((p) => p.text)).toEqual(['x', 'after'])
	})

	it.each([
		['tight', '- [ ] a\n- [x] b\n'],
		['loose', '- [ ] a\n\n- [x] b\n']
	])('leaves no leading space on a %s task list item', (_name, md) => {
		expect(load(setup(), md).paras.map((p) => p.text)).toEqual(['a', 'b'])
	})

	it('gives wrapped lines one paragraph', () => {
		expect(load(setup(), 'a\nb\n').paras.map((p) => p.text)).toEqual(['a b'])
	})

	it('keeps a hard break inside the paragraph', () => {
		expect(load(setup(), 'a  \nb\n').paras.map((p) => p.text)).toEqual(['a\u2028b'])
		expect(load(setup(), 'a\\\nb\n').paras.map((p) => p.text)).toEqual(['a\u2028b'])
	})
})

describe('Markdown inline', () => {
	it('keeps links', () => {
		const s = setup()
		load(s, '[x](https://x.org/a)\n')
		expect((s.t.toDelta() as DeltaOp[])[0]).toEqual({
			insert: 'x',
			attributes: { link: 'https://x.org/a' }
		})
	})

	it('marks inline code with the code font', () => {
		const s = setup()
		load(s, 'a `b` c\n')
		expect((s.t.toDelta() as DeltaOp[]).slice(0, 3)).toEqual([
			{ insert: 'a ' },
			{ insert: 'b', attributes: { font: CODE_FONT } },
			{ insert: ' c' }
		])
	})

	it('replaces images with a placeholder and counts them, raw <img> too', () => {
		const { parsed, paras } = load(
			setup(),
			'![alt](x.png) and <img src="y" alt="raw"> ![](z.png)\n'
		)
		expect(parsed.images).toBe(3)
		expect(parsed.html).not.toContain('<img')
		expect(paras.map((p) => p.text)).toEqual(['[Image: alt] and [Image: raw] [Image]'])
	})
})

describe('Code style', () => {
	it('is created only for a code block', () => {
		const s = setup()
		load(s, 'text `inline`\n')
		expect(readMeta(s.doc.m).styleMap.code).toBeUndefined()
		expect(styleNamed(s, 'Code')).toHaveLength(0)
	})

	it('styles code block lines, based on the body style, without a font mark', () => {
		const s = setup()
		const { paras } = load(s, CODE_BLOCK)
		const id = readMeta(s.doc.m).styleMap.code as string
		expect(paras.map((p) => [p.text, p.ps])).toEqual([
			['x', id],
			['  y', id]
		])
		expect((s.t.toDelta() as DeltaOp[])[0]).toEqual({ insert: 'x' })
		expect(styleOf(s.doc, id)).toMatchObject({
			basedOn: s.ids.p,
			props: { font: CODE_FONT }
		})
	})

	it('is created once', () => {
		const s = setup()
		load(s, CODE_BLOCK)
		load(s, CODE_BLOCK)
		expect(styleNamed(s, 'Code')).toHaveLength(1)
	})

	it('is created again when an undo removed it but left the styleMap entry', () => {
		const s = setup()
		const um = undoManager(s)
		section(s, CODE_BLOCK)
		const old = readMeta(s.doc.m).styleMap.code as string
		um.undo()
		expect(styleOf(s.doc, old)).toBeUndefined()
		expect(readMeta(s.doc.m).styleMap.code).toBe(old)

		const { paras } = load(s, CODE_BLOCK)
		const id = readMeta(s.doc.m).styleMap.code as string
		expect(id).not.toBe(old)
		expect(paras[0].ps).toBe(id)
	})
})

describe('front matter', () => {
	it('is stripped, with or without a BOM', () => {
		for (const bom of ['', '\uFEFF']) {
			const s = setup()
			const { paras } = load(s, `${bom}---\ntitle: x\nauthor: y\n---\n\n# a\n`)
			expect(paras.map((p) => [p.text, p.ps])).toEqual([['a', s.ids.h1]])
		}
	})

	it('leaves a leading horizontal rule alone', () => {
		const { parsed, paras } = load(setup(), '---\n\ntext\n\n---\n')
		expect(parsed.html).toContain('<hr>')
		expect(paras.map((p) => p.text)).toEqual(['text'])
	})
})

describe('fillStory', () => {
	it('replaces the story and leaves no trailing empty paragraph', () => {
		const s = setup()
		s.t.insert(0, 'old\n')
		load(s, 'a\n\nb\n')
		expect(s.t.toString()).toBe('a\nb\n')
	})

	it('ends a story whose ops do not', () => {
		const s = setup()
		fill(s, [{ insert: 'x' }])
		expect(s.t.toString()).toBe('x\n')
		const [p] = paragraphs(s.t)
		expect(p.ps).toBe(s.ids.p)
		expect(p.bid).toBeTruthy()
	})

	it('closes a story that ends in a table with a body paragraph', () => {
		const s = setup()
		load(s, '|a|b|\n|-|-|\n|1|2|\n')
		const last = (s.t.toDelta() as DeltaOp[]).at(-1)
		expect(cellOf(last?.attributes)).toBeUndefined()
		expect(last?.attributes?.ps).toBe(s.ids.p)
	})

	it('leaves one paragraph for empty ops', () => {
		const s = setup()
		s.t.insert(0, 'old\n')
		fill(s, [])
		expect(s.t.toString()).toBe('\n')
		expect(paragraphs(s.t)[0].bid).toBeTruthy()
	})
})

describe('addMarkdownSection', () => {
	it('adds a filled section at index with the page setup of like', () => {
		const s = setup({ first: 'm1', rest: 'm2', start: 'odd' })
		const r = section(s, '# a\n', 0)
		expect(s.doc.secs.toArray()).toEqual([r.id, 's1'])
		expect(sectionOf(s.doc, r.id)).toMatchObject({
			first: 'm1',
			rest: 'm2',
			start: 'odd',
			story: r.story
		})
		expect(s.doc.tx.get(r.story)?.toString()).toBe('a\n')
	})

	it('leaves the new story readable through the delta cache', () => {
		const s = setup()
		const r = section(s, '# a\n', 0)
		const t = s.doc.tx.get(r.story)
		expect(t && deltaOf(t).map((op) => op.insert)).toContain('a')
	})

	it('returns undefined for an unknown like', () => {
		const s = setup()
		expect(addMarkdownSection(s.yDoc, s.doc, parse(s, 'a'), 'nope', 0)).toBeUndefined()
		expect(s.doc.secs.length).toBe(1)
	})

	it('is one undo step, which leaves the id in secs', () => {
		const s = setup()
		const um = undoManager(s)
		const r = section(s, '# a\n')
		um.undo()
		expect(sectionOf(s.doc, r.id)).toBeUndefined()
		expect(s.doc.secs.toArray()).toContain(r.id)
		expect(um.canUndo()).toBe(false)
	})
})

describe('fillFirstSection', () => {
	it('replaces the placeholder story, outside undo', () => {
		const s = setup()
		s.t.insert(0, 'placeholder\n')
		const um = undoManager(s)
		expect(fillFirstSection(s.yDoc, s.doc, parse(s, '# a\n'))).toBe(true)
		expect(paragraphs(s.t).map((p) => [p.text, p.ps])).toEqual([['a', s.ids.h1]])
		expect(um.canUndo()).toBe(false)
	})

	it('leaves the story alone for empty Markdown', () => {
		const s = setup()
		s.t.insert(0, 'placeholder\n')
		expect(fillFirstSection(s.yDoc, s.doc, parse(s, ''))).toBe(true)
		expect(s.t.toString()).toBe('placeholder\n')
	})

	it('returns false for an orphan id in secs', () => {
		const s = setup()
		s.doc.s.delete('s1')
		expect(fillFirstSection(s.yDoc, s.doc, parse(s, 'a'))).toBe(false)
	})
})

describe('htmlToDelta without options (paste)', () => {
	it('ends the paragraph at <br> and adds no font mark', () => {
		const ops = htmlToDelta(setup().doc, '<p>a<br>b <code>c</code></p>')
		expect(ops.filter((op) => op.insert === '\n')).toHaveLength(2)
		expect(ops.some((op) => op.insert === '\u2028')).toBe(false)
		expect(ops.some((op) => op.attributes?.font)).toBe(false)
	})

	it('keeps the quote or bullet of a <p> inside', () => {
		const s = setup()
		const end = (html: string) => htmlToDelta(s.doc, html).at(-1)?.attributes
		expect(end('<blockquote><p>q</p></blockquote>')?.ps).toBe(s.ids.quote)
		expect(end('<ul><li><p>a</p></li></ul>')?.list).toBe('bullet')
	})
})
