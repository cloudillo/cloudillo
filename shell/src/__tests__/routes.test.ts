// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import {
	appPath,
	CTX_MATCH,
	CTX_SECTION_MATCH,
	communityCreatePath,
	contextPath,
	ctxBase,
	encodeSegment,
	feedPath,
	filesPath,
	HOME_BASE,
	idpPath,
	isBootstrapPath,
	isContextSegment,
	matchAppRoute,
	messagesPath,
	profilePath,
	rebase,
	scopePath,
	sectionMatch,
	settingsPath,
	siteAdminPath,
	viewPath
} from '../routes.js'

const HOME = 'home.tld'
const COMM = ctxBase('comm.tld', HOME)

// The grammar is `/<context>/<section>[/tail]`, the context being `~` at home and
// `@<idTag>` for a community.
describe('builders', () => {
	it('builds app routes', () => {
		expect(appPath(HOME_BASE, 'quillo')).toBe('/~/app/quillo')
		expect(appPath(HOME_BASE, 'quillo', 'bob.org:abc')).toBe('/~/app/quillo/bob.org:abc')
		expect(appPath(COMM, 'quillo', 'bob.org:abc')).toBe('/@comm.tld/app/quillo/bob.org:abc')
	})

	it('builds the built-in app routes', () => {
		expect(feedPath(HOME_BASE)).toBe('/~/app/feed')
		expect(feedPath(COMM, 'act123')).toBe('/@comm.tld/app/feed/act123')
		expect(filesPath(HOME_BASE)).toBe('/~/app/files')
		expect(messagesPath(HOME_BASE)).toBe('/~/app/messages')
		expect(messagesPath(COMM, 'conv1')).toBe('/@comm.tld/app/messages/conv1')
		expect(viewPath(HOME_BASE, 'bob.org:abc')).toBe('/~/app/view/bob.org:abc')
	})

	it('builds profile routes, with and without a sub-page', () => {
		expect(profilePath(HOME_BASE)).toBe('/~/profile')
		expect(profilePath(HOME_BASE, 'bob.org')).toBe('/~/profile/bob.org')
		expect(profilePath(HOME_BASE, 'bob.org', 'about')).toBe('/~/profile/bob.org/about')
		expect(profilePath(COMM, 'bob.org', ['connections'])).toBe(
			'/@comm.tld/profile/bob.org/connections'
		)
	})

	it('builds the section routes', () => {
		expect(settingsPath(HOME_BASE)).toBe('/~/settings')
		expect(settingsPath(COMM, 'security')).toBe('/@comm.tld/settings/security')
		expect(idpPath(HOME_BASE)).toBe('/~/idp')
		expect(idpPath(HOME_BASE, 'settings')).toBe('/~/idp/settings')
		expect(communityCreatePath(HOME_BASE)).toBe('/~/communities/create')
		expect(communityCreatePath(HOME_BASE, ['idp', 'select'])).toBe(
			'/~/communities/create/idp/select'
		)
	})

	// site-admin administers the node, not a community, so it is pinned to `~`
	// whatever context is active — it takes no base at all.
	it('pins site-admin to home', () => {
		expect(siteAdminPath()).toBe('/~/site-admin')
		expect(siteAdminPath('tenants')).toBe('/~/site-admin/tenants')
	})

	it('appends query parameters and drops null ones', () => {
		expect(filesPath(HOME_BASE, { path: '/docs' })).toBe('/~/app/files?path=%2Fdocs')
		expect(appPath(HOME_BASE, 'quillo', undefined, { a: 1, b: true, c: null })).toBe(
			'/~/app/quillo?a=1&b=true'
		)
		expect(contextPath(HOME_BASE, 'search', '', {})).toBe('/~/search')
	})

	// `a/b`, `/a/b` and ['a','b'] must all normalise the same way, and empty
	// segments must not leave a double slash behind.
	it('normalises tails', () => {
		expect(settingsPath(HOME_BASE, 'a/b')).toBe('/~/settings/a/b')
		expect(settingsPath(HOME_BASE, '/a/b')).toBe('/~/settings/a/b')
		expect(settingsPath(HOME_BASE, ['a', 'b'])).toBe('/~/settings/a/b')
		expect(settingsPath(HOME_BASE, '')).toBe('/~/settings')
		expect(settingsPath(HOME_BASE, ['a', '', 'b'])).toBe('/~/settings/a/b')
	})
})

describe('encodeSegment', () => {
	// The `<owner>:<fileId>` colon is load-bearing — ExternalApp and FileViewerApp
	// split the resId on it — so it stays literal while everything else escapes.
	it('keeps the colon literal and escapes the rest', () => {
		expect(encodeSegment('bob.org:abc')).toBe('bob.org:abc')
		expect(encodeSegment('a/b')).toBe('a%2Fb')
		expect(encodeSegment('a b')).toBe('a%20b')
		expect(encodeSegment('a?b#c')).toBe('a%3Fb%23c')
	})

	it('escapes both resId halves without losing the separator', () => {
		expect(appPath(HOME_BASE, 'quillo', 'bob.org:a/b')).toBe('/~/app/quillo/bob.org:a%2Fb')
	})

	it('escapes an idTag in the context prefix', () => {
		expect(ctxBase('a b.tld', HOME)).toBe('/@a%20b.tld')
	})
})

describe('ctxBase', () => {
	it('collapses the home tenant to ~', () => {
		expect(ctxBase(HOME, HOME)).toBe(HOME_BASE)
		expect(ctxBase('~', HOME)).toBe(HOME_BASE)
		expect(ctxBase(undefined, HOME)).toBe(HOME_BASE)
	})

	it('spells out a community', () => {
		expect(ctxBase('comm.tld', HOME)).toBe('/@comm.tld')
	})

	// Before `/.well-known/cloudillo/id-tag` lands there is nothing to compare
	// against, so a real idTag is spelled out in full — which routes identically.
	it('spells out an idTag when the home idTag is not known yet', () => {
		expect(ctxBase('comm.tld', undefined)).toBe('/@comm.tld')
		expect(ctxBase(undefined, undefined)).toBe(HOME_BASE)
	})
})

describe('isContextSegment', () => {
	// The sigil is what makes a reserved-word list unnecessary: no context-free
	// route is `~` or starts with `@`, so a static file can never be mistaken for
	// a context and fire setActiveContext().
	it('accepts ~ and @-sigilled idTags', () => {
		expect(isContextSegment('~')).toBe(true)
		expect(isContextSegment('@comm.tld')).toBe(true)
	})

	it('rejects context-free first segments', () => {
		expect(isContextSegment('login')).toBe(false)
		expect(isContextSegment('favicon.ico')).toBe(false)
		expect(isContextSegment('sw-0.8.6.js')).toBe(false)
		expect(isContextSegment('s')).toBe(false)
		expect(isContextSegment('')).toBe(false)
		expect(isContextSegment(undefined)).toBe(false)
	})
})

describe('isBootstrapPath', () => {
	it('accepts each bootstrap root and anything under it', () => {
		expect(isBootstrapPath('/login')).toBe(true)
		expect(isBootstrapPath('/register/tok123')).toBe(true)
		expect(isBootstrapPath('/reset-password/ref1')).toBe(true)
		expect(isBootstrapPath('/idp/activate/ref1')).toBe(true)
		expect(isBootstrapPath('/onboarding/welcome/ref1')).toBe(true)
	})

	// `/s/<refId>` is deliberately not a bootstrap root: a share link is ordinary
	// guest browsing, and the owner strip belongs there.
	it('rejects everything else', () => {
		expect(isBootstrapPath('/')).toBe(false)
		expect(isBootstrapPath('/logins')).toBe(false)
		expect(isBootstrapPath('/~/settings')).toBe(false)
		expect(isBootstrapPath('/s/abc')).toBe(false)
		expect(isBootstrapPath('/idp')).toBe(false)
	})
})

// The read-back half of `appPath`: same grammar, opposite direction.
describe('matchAppRoute', () => {
	it('reads an app route in either context', () => {
		expect(matchAppRoute('/~/app/quillo')).toEqual({ appId: 'quillo', resId: undefined })
		expect(matchAppRoute('/~/app/quillo/bob.org:abc')).toEqual({
			appId: 'quillo',
			resId: 'bob.org:abc'
		})
		expect(matchAppRoute('/@comm.tld/app/quillo/bob.org:abc')).toEqual({
			appId: 'quillo',
			resId: 'bob.org:abc'
		})
	})

	it('decodes the segments it built', () => {
		expect(matchAppRoute(appPath(HOME_BASE, 'quillo', 'bob.org:a/b'))).toEqual({
			appId: 'quillo',
			resId: 'bob.org:a/b'
		})
	})

	it('rejects anything that is not an app route', () => {
		expect(matchAppRoute('/~/settings')).toBeUndefined()
		expect(matchAppRoute('/login')).toBeUndefined()
		expect(matchAppRoute('/s/abc')).toBeUndefined()
		expect(matchAppRoute('/~/app')).toBeUndefined()
		expect(matchAppRoute('/~/app/quillo/bob.org:abc/extra')).toBeUndefined()
	})
})

describe('rebase', () => {
	it('swaps the context and carries the tail', () => {
		expect(rebase('/@a.tld/settings/security', HOME_BASE)).toBe('/~/settings/security')
		expect(rebase('/~/settings/security', COMM)).toBe('/@comm.tld/settings/security')
	})

	// Byte-for-byte, which is why this takes location.pathname and not useMatch's
	// splat param — that one is decoded and cannot be used to rebuild a path.
	it('carries a percent-encoded tail unchanged', () => {
		expect(rebase('/@a.tld/app/quillo/bob.org:a%2Fb', HOME_BASE)).toBe(
			'/~/app/quillo/bob.org:a%2Fb'
		)
	})

	it('yields the bare base when there is no second slash', () => {
		expect(rebase('/~', COMM)).toBe('/@comm.tld')
		expect(rebase('/login', HOME_BASE)).toBe('/~')
	})

	it('keeps the query string, which is part of the tail', () => {
		expect(rebase('/~/app/files?path=%2Fdocs', COMM)).toBe('/@comm.tld/app/files?path=%2Fdocs')
	})
})

describe('scopePath', () => {
	it('scopes a relative menu template', () => {
		expect(scopePath(HOME_BASE, 'app/files')).toBe('/~/app/files')
		expect(scopePath(COMM, 'communities')).toBe('/@comm.tld/communities')
	})

	// site-admin and the guest-document item carry absolute templates on purpose.
	it('passes an absolute template through untouched', () => {
		expect(scopePath(COMM, '/~/site-admin')).toBe('/~/site-admin')
		expect(scopePath(COMM, '/s/abc123')).toBe('/s/abc123')
	})
})

// The `useMatch` half of the grammar. Five files read the URL apart; pinning the
// patterns next to the builders is what keeps the two halves spelling it the same way.
describe('match patterns', () => {
	it('names the context segment and the tail', () => {
		expect(CTX_MATCH).toBe('/:contextIdTag/*')
		expect(CTX_SECTION_MATCH).toBe('/:contextIdTag/:section/*')
	})

	it('spells a named section as a literal', () => {
		expect(sectionMatch('settings', ':page?')).toBe('/:contextIdTag/settings/:page?')
		expect(sectionMatch('site-admin', ':page?/:id?')).toBe(
			'/:contextIdTag/site-admin/:page?/:id?'
		)
		expect(sectionMatch('app', ':appId/*')).toBe('/:contextIdTag/app/:appId/*')
	})

	it('takes no tail', () => {
		expect(sectionMatch('search')).toBe('/:contextIdTag/search')
	})
})

// vim: ts=4
