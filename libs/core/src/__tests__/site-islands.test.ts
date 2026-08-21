// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

// An island's props cross two untrusted boundaries. `siteBlockProp` walks a dot path
// that comes from an *app manifest*, which is data off the wire; `parseSiteIslandProps`
// reads `data-props` back off a published page. Neither may hand a renderer something
// no block ever carried, and neither may cost a page an island over one bad value.

import type { SiteIslandSpec } from '@cloudillo/types'

import type { SiteSourceBlock } from '../site.js'
import {
	parseSiteIslandProps,
	siteBlockProp,
	siteIslandRegistry,
	siteIslandSpec,
	sitePositiveInt
} from '../site-islands.js'

const BLOCK: SiteSourceBlock = {
	id: 'b1',
	t: 'documentEmbed',
	o: 1,
	pr: { fileId: 'f1', height: 400 }
}

describe('siteBlockProp', () => {
	it('should read a declared prop off the block', () => {
		expect(siteBlockProp(BLOCK, 'pr.fileId')).toBe('f1')
		expect(siteBlockProp(BLOCK, 't')).toBe('documentEmbed')
	})

	it('should answer with nothing for a path the block does not carry', () => {
		expect(siteBlockProp(BLOCK, 'pr.missing')).toBeUndefined()
		expect(siteBlockProp(BLOCK, 'pr.fileId.deeper')).toBeUndefined()
		expect(siteBlockProp(BLOCK, '')).toBeUndefined()
	})

	it.each([
		'pr.constructor.name',
		'constructor.name',
		'pr.toString',
		'pr.__proto__',
		'pr.hasOwnProperty'
	])('should refuse to walk into the prototype chain via %p', (path) => {
		expect(siteBlockProp(BLOCK, path)).toBeUndefined()
	})
})

describe('parseSiteIslandProps', () => {
	it('should keep the scalars beside an entry it drops', () => {
		const props = parseSiteIslandProps('{"src":"/a.png","meta":{"x":1},"width":320}')
		expect(props).toEqual({ src: '/a.png', width: 320 })
	})

	it('should drop every non-scalar spelling', () => {
		const json = '{"arr":[1],"obj":{},"nul":null,"inf":1e999,"ok":true}'
		expect(parseSiteIslandProps(json)).toEqual({ ok: true })
	})

	it('should answer with nothing for anything that is not a JSON object', () => {
		expect(parseSiteIslandProps('[1,2]')).toBeUndefined()
		expect(parseSiteIslandProps('"text"')).toBeUndefined()
		expect(parseSiteIslandProps('null')).toBeUndefined()
		expect(parseSiteIslandProps('{ not json')).toBeUndefined()
		expect(parseSiteIslandProps('')).toBeUndefined()
		expect(parseSiteIslandProps(undefined)).toBeUndefined()
	})
})

// Two lookups over one declaration list. The shell mounts through the registry
// (`shell/src/manifest-registry.ts`) and the publisher serializes through the spec
// (`apps/notillo/src/publish/render/serializer.ts`), so if the two ever answer with
// different specs for one block type, a page is serialized against app A's props and
// then mounted as app B's island — with `appId` naming B's iframe.

describe('siteIslandRegistry / siteIslandSpec — collision policy', () => {
	function spec(over: Partial<SiteIslandSpec>): SiteIslandSpec {
		return { blockType: 'chart', kind: 'replace', shape: 'box', ...over }
	}

	it('should answer with the same declared spec on a duplicated block type', () => {
		const first = spec({ appId: 'a1', props: ['series'] })
		const second = spec({ appId: 'a2', props: ['data'] })
		const declared = [first, second]

		expect(siteIslandRegistry(declared).get('chart')).toBe(first)
		expect(siteIslandSpec('chart', declared)).toBe(first)
		expect(siteIslandRegistry(declared).get('chart')).toBe(siteIslandSpec('chart', declared))
	})

	it('should let a built-in beat a declared spec of the same type', () => {
		// An app that could flip `image` from `enhance` to `replace` would be
		// deciding how the site owner's own page is mounted.
		const declared = [spec({ blockType: 'image', kind: 'replace', appId: 'a1' })]

		expect(siteIslandRegistry(declared).get('image')?.kind).toBe('enhance')
		expect(siteIslandSpec('image', declared)?.kind).toBe('enhance')
		expect(siteIslandRegistry(declared).get('image')).toBe(siteIslandSpec('image', declared))
	})

	it('should ignore a spec with an empty block type in both lookups', () => {
		const declared = [spec({ blockType: '' })]

		expect(siteIslandRegistry(declared).has('')).toBe(false)
		expect(siteIslandSpec('', declared)).toBeUndefined()
	})
})

describe('sitePositiveInt', () => {
	it('should coerce a stored dimension written as a string', () => {
		// The publisher coerced and the shell did not, so a `"320"` published at
		// 320px and then mounted at its intrinsic size — the picture moved.
		expect(sitePositiveInt('320')).toBe(320)
		expect(sitePositiveInt(320.4)).toBe(320)
	})

	it('should refuse everything that is not a positive finite number', () => {
		for (const value of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, '', 'wide', undefined]) {
			expect(sitePositiveInt(value)).toBeUndefined()
		}
	})
})

// vim: ts=4
