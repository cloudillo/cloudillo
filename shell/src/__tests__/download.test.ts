// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The `/cl-download` route's two sanitisers.
 *
 * Both take their input straight from a query parameter, and both feed it
 * somewhere it can do damage: the filename lands in a response header (CRLF
 * injection, a trailing backslash escaping the closing quote of the
 * quoted-string, an unbounded length) and the idTag lands in the host of the
 * upstream URL the worker fetches *with a bearer token attached*. They are the
 * only untested sanitisers in the worker.
 */

import { contentDisposition } from '../../sw/download.js'
import { isValidIdTag } from '../../sw/id-tag.js'

/** The RFC 5987 `filename*` parameter, still percent-encoded. */
function utf8Param(header: string): string {
	const m = header.match(/filename\*=UTF-8''(.*)$/)
	if (!m) throw new Error(`no filename* parameter in: ${header}`)
	return m[1]
}

/** The legacy quoted `filename` parameter, unquoted. */
function asciiParam(header: string): string {
	const m = header.match(/filename="([^"]*)"/)
	if (!m) throw new Error(`no filename parameter in: ${header}`)
	return m[1]
}

describe('contentDisposition', () => {
	it('keeps CRLF out of the header', () => {
		const header = contentDisposition('evil\r\nX-Injected: 1')
		expect(header).not.toMatch(/[\r\n]/)
		expect(asciiParam(header)).toBe('evil__X-Injected: 1')
		expect(decodeURIComponent(utf8Param(header))).toBe('evil\r\nX-Injected: 1')
	})

	it('replaces quotes and backslashes in the ASCII fallback', () => {
		const header = contentDisposition('a"b\\c')
		expect(asciiParam(header)).toBe("a'b'c")
	})

	it('does not let a trailing backslash escape the closing quote', () => {
		// `filename="report\"` would swallow the quote and make the rest of the
		// header part of the filename.
		const header = contentDisposition('report\\')
		expect(asciiParam(header)).toBe("report'")
		expect(header.startsWith('attachment; filename="report\'"; ')).toBe(true)
	})

	it('bounds a long name on a code point, not a code unit', () => {
		// 254 ASCII chars then an astral emoji: a 255-code-*unit* cut lands between
		// the surrogate pair and makes encodeURIComponent throw URIError.
		const name = `${'a'.repeat(254)}😀${'b'.repeat(50)}`
		let header = ''
		expect(() => {
			header = contentDisposition(name)
		}).not.toThrow()

		const decoded = decodeURIComponent(utf8Param(header))
		expect(decoded).toBe(`${'a'.repeat(254)}😀`)
		expect([...decoded].length).toBe(255)
	})

	it('percent-encodes characters that are not RFC 8187 attr-chars', () => {
		const header = contentDisposition("Bob's (final)*.pdf")
		expect(utf8Param(header)).toBe('Bob%27s%20%28final%29%2A.pdf')
		expect(decodeURIComponent(utf8Param(header))).toBe("Bob's (final)*.pdf")
	})

	it('keeps non-ASCII in the UTF-8 parameter and out of the fallback', () => {
		const header = contentDisposition('árvíztűrő.txt')
		expect(asciiParam(header)).toBe('_rv_zt_r_.txt')
		expect(decodeURIComponent(utf8Param(header))).toBe('árvíztűrő.txt')
	})
})

describe('isValidIdTag', () => {
	it('accepts a plain host name', () => {
		expect(isValidIdTag('alice.cloudillo.net')).toBe(true)
	})

	it.each([
		['', 'empty'],
		['cloudillo', 'a single label with no dot'],
		['-a.b', 'a label starting with a hyphen'],
		['a-.b', 'a label ending with a hyphen'],
		['a..b', 'an empty label'],
		['a.b/c', 'a path separator'],
		['a_b', 'an underscore'],
		['https://a.b', 'a scheme'],
		[`${'a'.repeat(252)}.b`, '254 characters']
	])('rejects %p (%s)', (tag) => {
		expect(isValidIdTag(tag)).toBe(false)
	})
})

// vim: ts=4
