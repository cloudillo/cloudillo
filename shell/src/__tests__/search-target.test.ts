// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { SearchHit } from '@cloudillo/types'

import { searchHitTarget } from '../search-target.js'

function hit(patch: Partial<SearchHit> & Pick<SearchHit, 'objTp' | 'objId'>): SearchHit {
	return { updatedAt: '2026-01-01T00:00:00Z', score: 1, ...patch }
}

const MIME = { 'cloudillo/quillo': '/app/quillo' }

describe('searchHitTarget', () => {
	it('maps a profile hit', () => {
		expect(searchHitTarget(hit({ objTp: 'P', objId: 'alice.tld' }), '~')).toBe(
			'/profile/~/alice.tld'
		)
	})

	it('maps an action hit to the feed permalink', () => {
		expect(searchHitTarget(hit({ objTp: 'A', objId: 'act123' }), '~')).toBe(
			'/app/~/feed/act123'
		)
	})

	it('maps a file hit with an explicit appId', () => {
		const target = searchHitTarget(
			hit({ objTp: 'F', objId: 'f1', appId: 'quillo', ownerTag: 'bob.org' }),
			'~'
		)
		expect(target).toBe('/app/~/quillo/bob.org:f1')
	})

	it('falls back to the mime map when appId is absent', () => {
		const target = searchHitTarget(
			hit({ objTp: 'F', objId: 'f1', contentType: 'cloudillo/quillo', ownerTag: 'bob.org' }),
			'~',
			MIME
		)
		expect(target).toBe('/app/~/quillo/bob.org:f1')
	})

	it('falls back to the built-in viewer when no app claims the type', () => {
		const target = searchHitTarget(
			hit({ objTp: 'F', objId: 'f1', contentType: 'application/zip', ownerTag: 'bob.org' }),
			'~',
			MIME
		)
		expect(target).toBe('/app/~/view/bob.org:f1')
	})

	it('falls back to the viewer when there is no contentType at all', () => {
		// The owner half is the real idTag, never the path's `~`: it is what
		// `mintAppToken` proxies to, and `~` is not a tenant.
		expect(searchHitTarget(hit({ objTp: 'F', objId: 'f1' }), '~', MIME, 'me.tld')).toBe(
			'/app/~/view/me.tld:f1'
		)
	})

	it('appends the nav param for a document part hit', () => {
		const target = searchHitTarget(
			hit({
				objTp: 'D',
				objId: 'f1',
				appId: 'notillo',
				ownerTag: 'bob.org',
				navParam: 'nav',
				partId: 'p3'
			}),
			'~'
		)
		expect(target).toBe('/app/~/notillo/bob.org:f1?nav=p3')
	})

	it('omits the query when a document part hit has no navParam', () => {
		const target = searchHitTarget(
			hit({ objTp: 'D', objId: 'f1', appId: 'notillo', ownerTag: 'bob.org', partId: 'p3' }),
			'~'
		)
		expect(target).toBe('/app/~/notillo/bob.org:f1')
	})

	it('omits the query when a document part hit has no partId', () => {
		const target = searchHitTarget(
			hit({
				objTp: 'D',
				objId: 'f1',
				appId: 'notillo',
				ownerTag: 'bob.org',
				navParam: 'nav'
			}),
			'~'
		)
		expect(target).toBe('/app/~/notillo/bob.org:f1')
	})

	it('defaults ownerTag to the context idTag', () => {
		const h = hit({ objTp: 'F', objId: 'f1', appId: 'quillo' })
		expect(searchHitTarget(h, 'comm.tld', MIME, 'comm.tld')).toBe(
			'/app/comm.tld/quillo/comm.tld:f1'
		)
		// With no context idTag to hand, the url segment is all that is left.
		expect(searchHitTarget(h, 'comm.tld')).toBe('/app/comm.tld/quillo/comm.tld:f1')
	})

	it('keeps a community context instead of rewriting it to home', () => {
		const h = hit({ objTp: 'F', objId: 'f1', appId: 'quillo', ownerTag: 'bob.org' })
		expect(searchHitTarget(h, 'community.tld')).toBe('/app/community.tld/quillo/bob.org:f1')
		expect(searchHitTarget(hit({ objTp: 'P', objId: 'alice.tld' }), 'community.tld')).toBe(
			'/profile/community.tld/alice.tld'
		)
	})

	it('encodes ids while keeping the owner:file colon literal', () => {
		const target = searchHitTarget(
			hit({ objTp: 'F', objId: 'a/b:c', appId: 'quillo', ownerTag: 'x/y' }),
			'~'
		)
		expect(target).toBe('/app/~/quillo/x%2Fy:a%2Fb%3Ac')
	})

	it('encodes the nav param value', () => {
		const target = searchHitTarget(
			hit({
				objTp: 'D',
				objId: 'f1',
				appId: 'notillo',
				ownerTag: 'bob.org',
				navParam: 'nav',
				partId: 'p 3&x'
			}),
			'~'
		)
		expect(target).toBe('/app/~/notillo/bob.org:f1?nav=p+3%26x')
	})

	it('encodes a hostile appId rather than letting it add path segments', () => {
		const target = searchHitTarget(
			hit({ objTp: 'F', objId: 'f1', appId: '../../evil', ownerTag: 'bob.org' }),
			'~'
		)
		expect(target).toBe('/app/~/..%2F..%2Fevil/bob.org:f1')
	})

	it('returns null without an objId or a context', () => {
		expect(searchHitTarget(hit({ objTp: 'F', objId: '' }), '~')).toBeNull()
		expect(searchHitTarget(hit({ objTp: 'F', objId: 'f1' }), '')).toBeNull()
	})
})

// vim: ts=4
