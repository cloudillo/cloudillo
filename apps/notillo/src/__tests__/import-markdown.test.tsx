// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { TextDecoder, TextEncoder } from 'node:util'
import { BlockNoteEditor } from '@blocknote/core'
import { describe, expect, it, jest } from '@jest/globals'

import type { NotilloEditor } from '../editor/schema.js'

// jsdom lacks these, and react-router, under `@cloudillo/react`, reads them on import.
Object.assign(globalThis, { TextDecoder, TextEncoder })

const { notilloSchema } = await import('../editor/schema.js')
const { importMarkdown } = await import('../export/markdown.js')

const editor = BlockNoteEditor.create({ schema: notilloSchema }) as unknown as NotilloEditor
editor.mount(document.createElement('div'))

const label = (name: string) => `[${name}]`

async function load(
	md: string,
	pages?: Map<string, { id: string; title: string }>
	// biome-ignore lint/suspicious/noExplicitAny: blocks are schema-dependent, the cases read a few fields
): Promise<any[]> {
	await importMarkdown(editor, md, pages, label)
	return editor.document
}

describe('importMarkdown', () => {
	it('joins a hard-wrapped paragraph with a space', async () => {
		const blocks = await load('First line\nsecond line\n\nNext')
		expect(blocks.map((b) => b.content[0].text)).toEqual(['First line second line', 'Next'])
	})

	it('keeps two-space and backslash hard breaks', async () => {
		const [block] = await load('a  \nb\\\nc\nd')
		expect(block.content[0].text).toBe('a\nb\nc d')
	})

	it.each([
		['tight', '- [ ] a\n- [x] b\n'],
		['loose', '- [ ] a\n\n- [x] b\n']
	])('reads a %s task list as check list items', async (_name, md) => {
		const blocks = await load(md)
		expect(blocks.map((b) => [b.type, b.props.checked, b.content[0].text])).toEqual([
			['checkListItem', false, 'a'],
			['checkListItem', true, 'b']
		])
	})

	it('nests a list inside a list', async () => {
		const [block] = await load('1. x\n   - y\n')
		expect(block.type).toBe('numberedListItem')
		expect(block.children[0].type).toBe('bulletListItem')
		expect(block.children[0].content[0].text).toBe('y')
	})

	it('reads a table', async () => {
		const [block] = await load('|a|b|\n|-|-|\n|1|2|\n')
		expect(block.type).toBe('table')
		expect(block.content.rows[1].cells[1].content[0].text).toBe('2')
	})

	it('reads a video link as a video block, escaping its name', async () => {
		const blocks = await load('![a "b" <c>](https://x.y/z.mp4)\n\nafter')
		expect(blocks[0].type).toBe('video')
		expect(blocks[0].props).toMatchObject({ name: 'a "b" <c>', url: 'https://x.y/z.mp4' })
		expect(blocks[1].content[0].text).toBe('after')
	})

	it('leaves an image an image', async () => {
		const [block] = await load('![i](https://x.y/z.png)')
		expect(block.type).toBe('image')
	})

	it.each([
		['a javascript: video', '![x](javascript:alert(1).mp4)'],
		['a raw data: image', '<img src="data:image/png;base64,AAAA">'],
		['a nested javascript: image', '- a\n\n  ![x](javascript:alert(1).png)\n']
	])('drops %s', async (_name, md) => {
		const blocks = await load(md)
		expect(JSON.stringify(blocks)).not.toMatch(/javascript:|data:image/)
		expect(blocks.filter((b) => ['image', 'video', 'audio'].includes(b.type))).toEqual([])
	})

	it('leaves a labelled paragraph for a refused image, and counts it', async () => {
		const { refusedMedia } = await importMarkdown(
			editor,
			'![Diagram](./img/a.png)',
			undefined,
			label
		)
		const [block] = editor.document as unknown as {
			type: string
			content: { text: string }[]
		}[]
		expect(refusedMedia).toBe(1)
		expect(block.type).toBe('paragraph')
		expect(block.content[0].text).toContain('Diagram')
	})

	it('never puts a refused address in the label', async () => {
		const [block] = await load('![](javascript:alert(1).mp4)')
		expect(block.content[0].text).toBe('[]')
	})

	it('refuses a file block by its address, and counts it', async () => {
		const { refusedMedia } = await importMarkdown(
			editor,
			'<embed src="javascript:alert(1)">',
			undefined,
			label
		)
		const blocks = editor.document as unknown as { type: string }[]
		expect(refusedMedia).toBe(1)
		expect(blocks.map((b) => b.type)).toEqual(['paragraph'])
		expect(JSON.stringify(blocks)).not.toContain('javascript:')
	})

	it('never takes a document embed from an import', async () => {
		const blocks = await load(
			'<div data-content-type="documentEmbed" data-file-id="x" data-editable="true"></div>'
		)
		expect(blocks.map((b) => b.type)).not.toContain('documentEmbed')
	})

	it('keeps the children of a refused block', async () => {
		const child = { type: 'paragraph', content: 'kept', children: [] }
		const replaceBlocks = jest.fn()
		const stub = {
			document: [],
			replaceBlocks,
			tryParseHTMLToBlocks: () => [
				{ type: 'image', props: { url: './a.png', name: 'a' }, children: [child] }
			]
		} as unknown as NotilloEditor

		await importMarkdown(stub, '', undefined, label)

		expect(replaceBlocks).toHaveBeenCalledWith(
			[],
			[{ type: 'paragraph', content: '[a]', children: [child] }]
		)
	})

	it('strips front matter', async () => {
		const blocks = await load('---\ntitle: x\n---\n\nbody\n')
		expect(blocks.map((b) => b.content[0].text)).toEqual(['body'])
	})

	it('keeps a cl-file: image', async () => {
		const [block] = await load('![i](cl-file:img:abc)')
		expect(block.type).toBe('image')
		expect(block.props.url).toBe('cl-file:img:abc')
	})

	it('keeps the language of a code block and adds no trailing newline', async () => {
		const [block] = await load('```js\nfoo\n  <bar>\n```\n')
		expect(block.type).toBe('codeBlock')
		expect(block.props.language).toBe('js')
		expect(block.content[0].text).toBe('foo\n  <bar>')
	})

	it('resolves a wiki link', async () => {
		const [block] = await load('see [[Home]]', new Map([['p1', { id: 'p1', title: 'Home' }]]))
		expect(block.content[1]).toMatchObject({
			type: 'wikiLink',
			props: { pageId: 'p1', pageTitle: 'Home' }
		})
	})

	it('survives an export and re-import', async () => {
		const before = await load(
			'![v](https://x.y/z.mp4)\n\n- [x] done\n\none  \ntwo\n\n```js\nfoo\n```\n'
		)
		const md = await editor.blocksToMarkdownLossy(editor.document)
		const after = await load(md)
		const shape = (blocks: typeof before) =>
			blocks.map((b) => [b.type, b.props.url, b.props.checked, b.content?.[0]?.text])
		expect(shape(after)).toEqual(shape(before))
	})
})

// vim: ts=4
