// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { appBundleUrl, getDocWsUrl, getFileUrl, getInstanceUrl, resolveAppUrl } from '../urls'

describe('getInstanceUrl', () => {
	it('should leave a plain idTag byte-identical', () => {
		expect(getInstanceUrl('alice.example')).toBe('https://cl-o.alice.example')
	})

	// An `@` in the tag would otherwise make `cl-o.foo` userinfo and `evil.example` the
	// host — an origin escape reachable from owner tags lifted out of federated posts.
	it('should keep an idTag containing @ inside our own namespace', () => {
		expect(getInstanceUrl('foo@evil.example')).toBe('https://cl-o.foo%40evil.example')
	})

	// The guard escapes only `/ ? # \ @ :`, so `%` and space survive into the result. That
	// is fine — neither yields a *host*: `%` is a forbidden domain code point, so the URL
	// parser rejects the whole string. Callers that re-parse must therefore guard.
	it.each(['foo@evil.example', 'foo%40evil.example', 'foo evil'])(
		'should yield a URL the parser rejects for %p',
		(tag) => {
			expect(() => new URL(getInstanceUrl(tag))).toThrow()
		}
	)

	// Tab (like CR/LF) is the one that does NOT throw: the parser strips it *before* host
	// parsing. Still no escape — the leftovers land inside our own `cl-o.` namespace.
	it('should keep a tab-bearing idTag inside our own namespace', () => {
		expect(new URL(getInstanceUrl('foo\tevil.example')).origin).toBe(
			'https://cl-o.fooevil.example'
		)
	})
})

describe('getDocWsUrl', () => {
	it('should use the owner tag when the document is remote', () => {
		expect(getDocWsUrl('alice.example', 'bob.example')).toBe('wss://cl-o.alice.example')
	})

	// Regression: an ownerless document must resolve to the viewer's own
	// instance, NOT to `window.location.host` — inside an app iframe that is the
	// bundle's host (`cl-o.<home idTag>`), which need not be the node the
	// *document* lives on.
	it('should use our own identity when the document has no owner tag', () => {
		expect(getDocWsUrl(undefined, 'bob.example')).toBe('wss://cl-o.bob.example')
	})

	it('should return undefined when no identity is known yet', () => {
		expect(getDocWsUrl(undefined, undefined)).toBeUndefined()
	})

	it('should treat an empty owner tag as absent', () => {
		expect(getDocWsUrl('', 'bob.example')).toBe('wss://cl-o.bob.example')
	})
})

describe('resolveAppUrl', () => {
	it('should absolutise a root-relative manifest path against the node', () => {
		expect(resolveAppUrl('alice.example', '/apps/quillo/')).toBe(
			'https://cl-o.alice.example/apps/quillo/'
		)
	})

	it('should pass an already-absolute URL through, for externally hosted apps', () => {
		expect(resolveAppUrl('alice.example', 'https://apps.example/quillo/')).toBe(
			'https://apps.example/quillo/'
		)
	})

	// A protocol-relative URL must stay a *path* on the node, not a jump to another
	// host. This is what the `startsWith('/')` test gives; pinning it stops a future
	// "simplification" from turning it into an origin escape.
	it('should keep a protocol-relative path on the node', () => {
		expect(resolveAppUrl('alice.example', '//evil.example/x')).toBe(
			'https://cl-o.alice.example//evil.example/x'
		)
	})

	// A path with no leading slash is still a path on the node — never something that
	// resolves against the *document's* origin.
	it('should absolutise a slashless relative path against the node too', () => {
		expect(resolveAppUrl('alice.example', 'apps/quillo/')).toBe(
			'https://cl-o.alice.example/apps/quillo/'
		)
	})

	// Schemes are case-insensitive. Without the `i` flag this fell through to the path
	// branch and became `https://cl-o.alice.example/HTTPS://apps.example/x`.
	it('should pass an uppercase-scheme absolute URL through too', () => {
		expect(resolveAppUrl('alice.example', 'HTTPS://apps.example/quillo/')).toBe(
			'HTTPS://apps.example/quillo/'
		)
	})
})

describe('appBundleUrl', () => {
	// `/index.html`, never the trailing-slash form: two shapes for one document are two
	// HTTP cache keys, and this is the only cache bundles get.
	it('should name the bundle entry point explicitly', () => {
		expect(appBundleUrl('alice.example', 'quillo')).toBe(
			'https://cl-o.alice.example/apps/quillo/index.html'
		)
	})
})

describe('getFileUrl', () => {
	// The regression guard: validation must not rewrite a real, opaque fileId.
	it('should leave an ordinary fileId byte-identical', () => {
		expect(getFileUrl('alice.example', 'f1', 'vis.sd')).toBe(
			'https://cl-o.alice.example/api/files/f1?variant=vis.sd'
		)
	})

	// The shapes `shell/src/__tests__/live-doc.test.ts` already pins as legal — a fileId
	// may carry dots, tildes and colons, and none of them may cost it its URL.
	it.each(['f1~abc', 'f1.v2', 'abc:123', 'f1~a:b'])('should accept the fileId %s', (id) => {
		expect(getFileUrl('alice.example', id)).toBe(`https://cl-o.alice.example/api/files/${id}`)
	})

	// `fileId` arrives from the same federated sources as `idTag` — a feed post's
	// `docRef.fileId`, an object out of a peer-written Yjs doc. A raw `../` would be
	// normalized by the browser into an arbitrary path on the owner's API host, with the
	// viewer's scoped token still appended. No URL at all is the only safe answer.
	it('should refuse a traversing fileId', () => {
		expect(getFileUrl('alice.example', '../../secret')).toBeUndefined()
	})

	// A raw `?` would end the path and make the appended `?variant=…` a second query
	// separator — silently dropping the variant.
	it('should refuse a fileId that opens the query string', () => {
		expect(getFileUrl('alice.example', 'f1?token=x', 'vis.sd')).toBeUndefined()
	})

	// The owner tag arrives from the same places, and `getInstanceUrl` only ESCAPES it —
	// the escaped form is a string the URL parser rejects, not a refusal. This is the one
	// entry point whose `undefined` contract every caller already handles, so it validates.
	//
	// `localhost` and the 254-character tag are the two rules that keep this in step with
	// the service worker's `isValidIdTag`: an idTag is a multi-label DNS name within the
	// 253-byte cap, never a bare label.
	it.each(['foo@evil.example', '../x', '-a.tld', '', 'localhost', 'a'.repeat(254)])(
		'should refuse the idTag %p',
		(idTag) => {
			expect(getFileUrl(idTag, 'f1', 'vis.sd')).toBeUndefined()
		}
	)

	// A refusal that says nothing is indistinguishable from a missing file: if `FILE_ID_RE`
	// ever drifts from the backend's id generator (a separate repo), this warning is the
	// only trace. Once per key, so a bad thumbnail in a grid does not flood the console.
	it('should warn once per refused key', () => {
		// Hand-rolled rather than jest.spyOn: the `jest` global is not injected under ESM
		// and @jest/globals is not a dependency of this package.
		const origWarn = console.warn
		const warnings: string[] = []
		console.warn = (msg: string) => {
			warnings.push(msg)
		}
		try {
			expect(getFileUrl('alice.example', 'warn-once/1')).toBeUndefined()
			expect(getFileUrl('alice.example', 'warn-once/1')).toBeUndefined()
			expect(warnings).toHaveLength(1)
			expect(warnings[0]).toContain('alice.example:warn-once/1')

			expect(getFileUrl('alice.example', 'warn-once/2')).toBeUndefined()
			expect(warnings).toHaveLength(2)
		} finally {
			console.warn = origWarn
		}
	})
})

// vim: ts=4
