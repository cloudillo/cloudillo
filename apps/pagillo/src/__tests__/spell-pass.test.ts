// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/** The worker's incremental spell pass, with a fake Hunspell (mocked before the dynamic import). */

import { jest } from '@jest/globals'
import type { Paragraph, Story } from '@cloudillo/typeset'

import type { WorkerToMain } from '../worker/protocol.js'

const fake = {
	testSpelling: (w: string) => w !== 'teh',
	addWord: jest.fn(),
	getSpellingSuggestions: (_w: string): string[] => ['the']
}
jest.unstable_mockModule('hunspell-wasm', () => ({
	createHunspellFromStrings: async () => fake
}))
globalThis.fetch = (async () => ({ ok: true, text: async () => '' })) as unknown as typeof fetch

const { spellCheck, spellConfig, spellSuggest } = await import('../worker/spell.js')

const para = (text: string): Paragraph => ({
	bid: 'p',
	style: '',
	overrides: {},
	runs: [{ text, marks: {} }]
})

/** One pass over story `a` holding `p`; resolves with what it posted. */
async function run(p: Paragraph, ignore: string[] = []): Promise<WorkerToMain[]> {
	const posts: WorkerToMain[] = []
	const stories = new Map<string, Story>([['a', { id: 'a', paragraphs: [p] }]])
	spellCheck(
		() => ({ stories, styles: {}, lang: 'en', ignore }),
		(m) => posts.push(m)
	)
	for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0))
	return posts
}

const ranges = (posts: WorkerToMain[]) =>
	posts.map((m) => (m.type === 'spell' ? m.ranges : undefined))

describe('spell pass', () => {
	it('checks changed paragraphs only, and posts each change of state once', async () => {
		spellConfig(true, undefined)
		const bad = para('teh cat')
		expect(ranges(await run(bad))).toEqual([[{ from: 0, to: 3, lang: 'en', word: 'teh' }]])
		expect(await run(bad)).toEqual([])
		// Fixed: the squiggle is cleared once, later clean edits post nothing.
		expect(ranges(await run(para('the cat')))).toEqual([[]])
		expect(await run(para('the dog'))).toEqual([])
	})

	it('re-checks everything when the ignore list changes', async () => {
		const bad = para('teh cat')
		expect(ranges(await run(bad))).toEqual([[{ from: 0, to: 3, lang: 'en', word: 'teh' }]])
		expect(ranges(await run(bad, ['teh']))).toEqual([[]])
	})

	it('clears the squiggles of a deleted paragraph', async () => {
		expect(ranges(await run(para('teh cat')))).toEqual([
			[{ from: 0, to: 3, lang: 'en', word: 'teh' }]
		])
		expect(await run({ ...para('the cat'), bid: 'q' })).toEqual([
			{ type: 'spell', story: 'a', bid: 'p', ranges: [] }
		])
	})

	it('adds user words to loaded dictionaries; off posts nothing', async () => {
		spellConfig(undefined, ['teh'])
		await new Promise((r) => setTimeout(r, 0))
		expect(fake.addWord).toHaveBeenCalledWith('teh')
		spellConfig(false, undefined)
		expect(await run(para('zzz teh'))).toEqual([])
	})

	it('suggest never rejects', async () => {
		expect(await spellSuggest('teh', 'en')).toEqual(['the'])
		expect(await spellSuggest('x'.repeat(65), 'en')).toEqual([])
		fake.getSpellingSuggestions = () => {
			throw new Error('boom')
		}
		const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
		expect(await spellSuggest('teh', 'en')).toEqual([])
		warn.mockRestore()
	})
})

// vim: ts=4
