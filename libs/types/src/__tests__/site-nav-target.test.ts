// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

// A nav target is painted into an `href` server-side, on the site owner's own origin,
// before any JS runs. The settings editor checks what an author types, but it is not
// the only writer — `PATCH /api/sites` is reachable by any leader with a token — so
// the *validator* has to be the one that refuses a hostile target. These are the cases
// that must never decode.

import * as T from '@symbion/runtype'

import { tSiteNavChild, tSiteNavItem, tSiteNavList, tSiteNavTarget } from '../types.js'

function decode(target: unknown) {
	return T.decode(tSiteNavTarget, target)
}

describe('tSiteNavTarget', () => {
	it.each([
		['/blog', '/blog'],
		['/blog/hello', '/blog/hello'],
		['#top', '#top'],
		['https://x.tld/', 'https://x.tld/'],
		['http://x.tld/a?b=1', 'http://x.tld/a?b=1'],
		['mailto:a@b.tld', 'mailto:a@b.tld']
	])('should accept %p', (target, expected) => {
		const result = decode(target)
		expect(T.isOk(result) && result.ok).toBe(expected)
	})

	// One hostile scheme stands for the allowlist — enough to prove the decoder
	// actually consults `safeHref`, which is the whole reason `SiteNavTargetType` is a
	// hand-written `T.Type` subclass: `T.string.matches()` registers an *async*
	// validator that `T.decode` never runs, so the obvious spelling would accept every
	// one of these. The hostile inputs themselves — case, leading whitespace, `data:`,
	// protocol-relative and backslash hosts, embedded tab/LF/CR — are exhausted in
	// `libs/core/src/__tests__/site-safety.test.ts`. What is left here is what the
	// decoder adds on top: blankness, a bare non-path string, and non-string input.
	it.each(['javascript:alert(1)', '', '   ', 'blog', 42, null, undefined])(
		'should refuse %p',
		(target) => {
			expect(T.isErr(decode(target))).toBe(true)
		}
	)

	it('should decode to the trimmed value, so only the judged form is stored', () => {
		const result = decode('  /blog  ')
		expect(T.isOk(result) && result.ok).toBe('/blog')
	})
})

describe('tSiteNavItem / tSiteNavChild', () => {
	it('should refuse an item whose target is not allowlisted', () => {
		expect(T.isErr(T.decode(tSiteNavItem, { label: 'x', target: 'javascript:x' }))).toBe(true)
		expect(T.isErr(T.decode(tSiteNavChild, { label: 'x', target: 'javascript:x' }))).toBe(true)
	})

	it('should refuse an item whose *child* target is not allowlisted', () => {
		// A submenu link reaches the same server-rendered nav as its parent.
		const item = {
			label: 'Blog',
			target: '/blog',
			children: [{ label: 'Bad', target: 'javascript:alert(1)' }]
		}
		expect(T.isErr(T.decode(tSiteNavItem, item))).toBe(true)
	})

	it('should accept a well-formed item with children', () => {
		const item = {
			label: 'Blog',
			target: '/blog',
			children: [{ label: 'Hello', target: '/blog/hello' }]
		}
		expect(T.isOk(T.decode(tSiteNavItem, item))).toBe(true)
	})
})

describe('tSiteNavList', () => {
	// The read side of the same rule: `GET /api/sites` is how an owner reaches the
	// settings page that could delete a bad entry, so failing the whole response over
	// one entry locked them out of the only repair.
	it('should drop one unvouchable entry and keep the rest', () => {
		const decoded = T.decode(tSiteNavList, [
			{ label: 'About', target: '/about' },
			{ label: 'Bad', target: 'javascript:alert(1)' },
			{ label: 'Blog', target: '/blog' }
		])
		expect(T.isOk(decoded) && decoded.ok).toEqual([
			{ label: 'About', target: '/about' },
			{ label: 'Blog', target: '/blog' }
		])
	})

	it('should drop only the bad child, not its parent', () => {
		const decoded = T.decode(tSiteNavList, [
			{
				label: 'Blog',
				target: '/blog',
				children: [
					{ label: 'Hello', target: '/blog/hello' },
					{ label: 'Bad', target: 'javascript:alert(1)' }
				]
			}
		])
		expect(T.isOk(decoded) && decoded.ok).toEqual([
			{
				label: 'Blog',
				target: '/blog',
				children: [{ label: 'Hello', target: '/blog/hello' }]
			}
		])
	})

	it('should still refuse a nav that is not a list', () => {
		// Forgiving about entries, not about shape: that is a malformed response.
		expect(T.isErr(T.decode(tSiteNavList, { label: 'x' }))).toBe(true)
	})
})

// vim: ts=4
