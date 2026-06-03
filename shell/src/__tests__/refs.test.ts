// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { buildRef, canShareRoute, isIdTag, isRefLike, resolveRef } from '../refs.js'

describe('buildRef / resolveRef round-trips', () => {
	it('round-trips a document route', () => {
		const path = '/app/~/quillo/bob.org:abc123'
		const ref = buildRef(path)
		expect(ref).toBe('cl:quillo/bob.org:abc123')
		expect(resolveRef(ref)).toBe(path)
	})

	it('preserves a nav query param on a document ref', () => {
		const ref = buildRef('/app/~/quillo/bob.org:abc123', '?nav=p3')
		expect(ref).toBe('cl:quillo/bob.org:abc123?nav=p3')
		expect(resolveRef(ref)).toBe('/app/~/quillo/bob.org:abc123?nav=p3')
	})

	it('strips the access query param on a document ref', () => {
		const ref = buildRef('/app/~/quillo/bob.org:abc123', '?access=read')
		expect(ref).toBe('cl:quillo/bob.org:abc123')
		expect(resolveRef(ref)).toBe('/app/~/quillo/bob.org:abc123')
	})

	it('keeps nav while stripping access when both are present', () => {
		const ref = buildRef('/app/~/quillo/bob.org:abc123', '?access=read&nav=p3')
		expect(ref).toBe('cl:quillo/bob.org:abc123?nav=p3')
		expect(resolveRef(ref)).toBe('/app/~/quillo/bob.org:abc123?nav=p3')
	})

	it('round-trips a community page (lossless full form)', () => {
		const path = '/app/community.tld/feed'
		const ref = buildRef(path)
		expect(ref).toBe('cl:/app/community.tld/feed')
		expect(resolveRef(ref)).toBe(path)
	})

	it('round-trips a profile (lossless full form)', () => {
		const path = '/profile/~/alice.tld'
		const ref = buildRef(path)
		expect(ref).toBe('cl:/profile/~/alice.tld')
		expect(resolveRef(ref)).toBe(path)
	})

	it('drops the community context from a community document ref', () => {
		const ref = buildRef('/app/community.tld/quillo/community.tld:f1')
		expect(ref).toBe('cl:quillo/community.tld:f1')
		expect(resolveRef(ref)).toBe('/app/~/quillo/community.tld:f1')
	})
})

describe('resolveRef accepts URLs and bare paths', () => {
	it('extracts the path + search of a full https URL', () => {
		expect(resolveRef('https://other.host/app/~/quillo/bob.org:abc123')).toBe(
			'/app/~/quillo/bob.org:abc123'
		)
		expect(resolveRef('https://other.host/app/~/quillo/bob.org:abc123?nav=p3')).toBe(
			'/app/~/quillo/bob.org:abc123?nav=p3'
		)
	})

	it('passes a bare path through unchanged', () => {
		expect(resolveRef('/app/~/quillo/x:y')).toBe('/app/~/quillo/x:y')
	})

	it('returns null for garbage', () => {
		expect(resolveRef('hello world')).toBeNull()
		expect(resolveRef('')).toBeNull()
		expect(resolveRef('cl:')).toBeNull()
	})

	it('rejects protocol-relative and backslash-escaped paths', () => {
		expect(resolveRef('cl://evil.com')).toBeNull()
		expect(resolveRef('//evil.com')).toBeNull()
		expect(resolveRef('cl:/\\evil.com')).toBeNull()
	})
})

describe('isRefLike', () => {
	it('matches cl: and http(s) URLs', () => {
		expect(isRefLike('cl:quillo/bob.org:abc')).toBe(true)
		expect(isRefLike('https://x/y')).toBe(true)
		expect(isRefLike('http://x/y')).toBe(true)
	})

	it('does not treat a bare path or plain text as a ref', () => {
		expect(isRefLike('/app/~/quillo/x:y')).toBe(false)
		expect(isRefLike('bob.example.com')).toBe(false)
		expect(isRefLike('hello')).toBe(false)
	})
})

describe('isIdTag', () => {
	it('matches dotted identity tags (optional leading @)', () => {
		expect(isIdTag('bob.example.com')).toBe(true)
		expect(isIdTag('@bob.example.com')).toBe(true)
	})

	it('rejects single-label or non-tag input', () => {
		expect(isIdTag('bob')).toBe(false)
		expect(isIdTag('hello world')).toBe(false)
		expect(isIdTag('/files')).toBe(false)
	})
})

describe('canShareRoute', () => {
	it('is true for app and profile routes', () => {
		expect(canShareRoute('/app/~/quillo/x:y')).toBe(true)
		expect(canShareRoute('/profile/~/alice.tld')).toBe(true)
	})

	it('is false for transient routes', () => {
		expect(canShareRoute('/login')).toBe(false)
		expect(canShareRoute('/onboarding/intro')).toBe(false)
		expect(canShareRoute('/settings/~')).toBe(false)
	})
})
