// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

// `.test.tsx` rather than `.test.ts`, with no JSX in it: `site/detect.ts` reads the
// document at module load, and this repo's jest split gives only `.test.tsx` a DOM.

import { normalizeNav } from '../site/detect.js'

// A nav target is free text an author typed into Settings → Site → Navigation, rendered as an
// `href` on every published page to anonymous readers on the site owner's own origin. On a
// community site an unchecked target is a stored XSS any leader could plant — the threat model
// `safeHref` (`libs/core/src/site.ts`) exists for. This parser is the first of three layers
// that refuse one; `SiteBar`'s `NavLink` and the settings input are the other two.

describe('normalizeNav', () => {
	it('should keep a site-absolute path', () => {
		expect(normalizeNav([{ label: 'About', target: '/about' }])).toEqual([
			{ label: 'About', target: '/about' }
		])
	})

	it('should keep an http(s) address', () => {
		expect(normalizeNav([{ label: 'Home', target: 'https://example.com/x' }])).toEqual([
			{ label: 'Home', target: 'https://example.com/x' }
		])
	})

	// Two entries, not the whole hostile table: what is under test here is that
	// `normalizeNav` routes its targets through `safeHref` at all. The allowlist itself
	// — case, leading whitespace, control characters, `data:`, protocol-relative and
	// backslash hosts — is exhausted in `libs/core/src/__tests__/site-safety.test.ts`.
	it.each(['javascript:alert(1)', ''])('should drop the entry with target %p', (target) => {
		expect(normalizeNav([{ label: 'Bad', target }])).toEqual([])
	})

	it('should drop a malformed entry without losing its siblings', () => {
		const nav = normalizeNav([
			{ label: 'Good', target: '/good' },
			{ label: 'Bad', target: 'javascript:alert(1)' },
			{ label: 'No target' },
			'nonsense',
			{ label: 'Also good', target: '/also' }
		])
		expect(nav.map((entry) => entry.target)).toEqual(['/good', '/also'])
	})

	it('should filter children by the same allowlist', () => {
		const nav = normalizeNav([
			{
				label: 'Blog',
				target: '/blog',
				children: [
					{ label: 'Bad', target: 'javascript:alert(1)' },
					{ label: 'Post', target: '/blog/post' }
				]
			}
		])
		expect(nav).toEqual([
			{
				label: 'Blog',
				target: '/blog',
				children: [{ label: 'Post', target: '/blog/post' }]
			}
		])
	})

	it('should drop a whole subtree whose parent target is refused', () => {
		const nav = normalizeNav([
			{
				label: 'Bad',
				target: 'javascript:alert(1)',
				children: [{ label: 'Post', target: '/blog/post' }]
			}
		])
		expect(nav).toEqual([])
	})

	it('should keep nesting to one level', () => {
		// The server emits one level by construction, but a stale generation is the
		// case this parser exists for, and an unbounded tree is an unbounded menu.
		const nav = normalizeNav([
			{
				label: 'Blog',
				target: '/blog',
				children: [
					{
						label: 'Post',
						target: '/blog/post',
						children: [{ label: 'Deep', target: '/blog/post/deep' }]
					}
				]
			}
		])
		expect(nav[0].children?.[0]).toEqual({ label: 'Post', target: '/blog/post' })
	})

	it('should omit children entirely when none survive', () => {
		const nav = normalizeNav([
			{ label: 'Blog', target: '/blog', children: [{ label: 'Bad', target: '//evil.host' }] }
		])
		expect(nav).toEqual([{ label: 'Blog', target: '/blog' }])
	})
})
