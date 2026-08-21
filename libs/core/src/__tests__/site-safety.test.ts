// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { escapeHtml, reservedSlugReason, safeHref } from '../site'

// `safeHref` no longer guards published markup — `cloudillo-file`'s `site_html`
// does, at upload, and it carries its own mirror of these cases. What is left here
// are its remaining consumers: site nav records (`tSiteNavTarget`, painted into an
// `href` server-side by `wrapper::push_nav_item`) and the shell's island components,
// where a `data-props` value becomes a `<video src>`. The rule under test is that a
// value which does not fit is DROPPED, never escaped into place: an escaped
// `javascript:` href is still a `javascript:` href once the browser decodes the
// attribute.

describe('safeHref', () => {
	it('should pass the three allowed schemes through unchanged', () => {
		expect(safeHref('https://example.com/x?a=1')).toBe('https://example.com/x?a=1')
		expect(safeHref('http://example.com')).toBe('http://example.com')
		expect(safeHref('mailto:bob@example.com')).toBe('mailto:bob@example.com')
		expect(safeHref('HTTPS://EXAMPLE.COM')).toBe('HTTPS://EXAMPLE.COM')
	})

	it('should pass relative and same-page targets through', () => {
		expect(safeHref('/blog/hello')).toBe('/blog/hello')
		expect(safeHref('#section-2')).toBe('#section-2')
	})

	it('should drop javascript: rather than escape it', () => {
		expect(safeHref('javascript:alert(1)')).toBeUndefined()
		expect(safeHref('JaVaScRiPt:alert(1)')).toBeUndefined()
		// Leading whitespace is stripped before the scheme is read, so it cannot
		// be used to slip past the prefix match.
		expect(safeHref('  javascript:alert(1)')).toBeUndefined()
		expect(safeHref('\n\tjavascript:alert(1)')).toBeUndefined()
	})

	it('should drop data: URLs', () => {
		expect(safeHref('data:text/html,<script>alert(1)</script>')).toBeUndefined()
		expect(safeHref('data:image/svg+xml;base64,AAAA')).toBeUndefined()
	})

	it('should drop protocol-relative hrefs even though they start with a slash', () => {
		// `//evil.example` reads like a path and leaves the site. An author who
		// means another origin can write `https:` and be explicit about it.
		expect(safeHref('//evil.example/x')).toBeUndefined()
		// Browsers normalise a backslash after the first slash into a second
		// slash, so `/\` is protocol-relative too.
		expect(safeHref('/\\evil.example/x')).toBeUndefined()
	})

	it('should drop an href holding a control character anywhere in it', () => {
		// Browsers strip tab, LF and CR from *anywhere* in a URL, so trimming the
		// edges is not enough: each of these walks past the protocol-relative guard
		// and then resolves off-site — `new URL('/\t/evil.example/x', base)` is
		// `https://evil.example/x`.
		expect(safeHref('/\t/evil.example/x')).toBeUndefined()
		expect(safeHref('/\n/evil.example/x')).toBeUndefined()
		expect(safeHref('/\r\\evil.example/x')).toBeUndefined()
		// The same trick against the scheme allowlist.
		expect(safeHref('htt\tps://ok.example/')).toBeUndefined()
		expect(safeHref('java\nscript:alert(1)')).toBeUndefined()
	})

	it('should drop anything that is not a string, or is empty', () => {
		expect(safeHref(undefined)).toBeUndefined()
		expect(safeHref(null)).toBeUndefined()
		expect(safeHref(42)).toBeUndefined()
		expect(safeHref({ toString: () => 'https://example.com' })).toBeUndefined()
		expect(safeHref('')).toBeUndefined()
		expect(safeHref('   ')).toBeUndefined()
	})

	it('should drop schemes nobody has thought about', () => {
		expect(safeHref('vbscript:msgbox(1)')).toBeUndefined()
		expect(safeHref('file:///etc/passwd')).toBeUndefined()
		expect(safeHref('cl-file:img:f1~abc')).toBeUndefined()
	})
})

describe('escapeHtml', () => {
	it('should escape all five characters that matter in both contexts', () => {
		expect(escapeHtml(`<a href="x" title='y'>&</a>`)).toBe(
			'&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;'
		)
	})

	it('should leave text with nothing to escape untouched', () => {
		expect(escapeHtml('Grüße, Világ')).toBe('Grüße, Világ')
	})
})

// The two root flags answer different questions, and conflating them let a page
// called "Tags" in a document mounted at `/blog` publish over the tag listings the
// same container generates at `tags/…`. Container-root names are reserved wherever
// the document is mounted; site-root names only where the document owns `/`.

describe('reservedSlugReason', () => {
	it('should reserve a container name at the document root, mounted anywhere', () => {
		expect(reservedSlugReason('tags', { atRoot: false, atContainerRoot: true })).toBe(
			'container'
		)
		expect(reservedSlugReason('index', { atRoot: false, atContainerRoot: true })).toBe(
			'container'
		)
		expect(reservedSlugReason('_site', { atRoot: false, atContainerRoot: true })).toBe(
			'container'
		)
	})

	it('should reserve the not-found fragment, which is generated like the rest', () => {
		expect(reservedSlugReason('404', { atRoot: false, atContainerRoot: true })).toBe(
			'container'
		)
		expect(reservedSlugReason('404', { atRoot: true, atContainerRoot: true })).toBe('container')
	})

	it('should let a nested page use a container name', () => {
		// `/blog/notes/tags` collides with nothing: the listings live at the top of
		// the container, not under an arbitrary page.
		expect(
			reservedSlugReason('tags', { atRoot: false, atContainerRoot: false })
		).toBeUndefined()
		expect(reservedSlugReason('404', { atRoot: true, atContainerRoot: false })).toBeUndefined()
	})

	it('should reserve a site name only where the document owns the site root', () => {
		expect(reservedSlugReason('login', { atRoot: true, atContainerRoot: true })).toBe('site')
		expect(
			reservedSlugReason('login', { atRoot: false, atContainerRoot: true })
		).toBeUndefined()
		// Prefix-reserved roots go the same way.
		expect(reservedSlugReason('assets-1', { atRoot: true, atContainerRoot: true })).toBe('site')
		expect(
			reservedSlugReason('assets-1', { atRoot: false, atContainerRoot: true })
		).toBeUndefined()
	})

	it('should no longer reserve “page” below the container root', () => {
		// It was reserved under an `index` page for a pagination feature that does
		// not exist, and the archetype that triggered it is gone — a listing is an
		// `index` block now, and a block has no children to reserve a slug under.
		expect(
			reservedSlugReason('page', { atRoot: false, atContainerRoot: false })
		).toBeUndefined()
	})

	it('should pass an ordinary slug', () => {
		expect(reservedSlugReason('hello', { atRoot: true, atContainerRoot: true })).toBeUndefined()
	})
})

// vim: ts=4
