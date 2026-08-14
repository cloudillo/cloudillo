// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The shell's URL grammar, as string *builders* only.
 *
 * Context-first — `/<context>/<section>[/tail][?query]`, the context being `~` at home
 * and `@<idTag>` for a community: `/~/app/quillo/bob.org:abc`, `/@comm.tld/settings/security`.
 * Every section carries a context, `site-admin` and `notifications` included.
 *
 * This is the only module deciding where the context sits and how it is spelled, but it
 * does not know *which* sections exist: that is `ShellRoutes` in `layout.tsx`, where each
 * name appears exactly once, and a second list here could only drift from it.
 *
 * **Route *dispatch* is not this module's job** — React Router owns that, and `context/ctx.tsx`
 * turns the `:contextIdTag` segment into the one React context the shell reads. Recognising a
 * path this module built is grammar, so it stays here: `isContextSegment` set that precedent.
 *
 * The `@` sigil is load-bearing: it makes segment 1 self-describing, so no reserved-word
 * list is needed and `/favicon.ico` can never be mistaken for a context — a false positive
 * there fires `setActiveContext('favicon.ico')` and navigates the user off the page.
 *
 * Pure module — no React, no shell state — so DOM-free consumers (`refs.ts`,
 * `search-target.ts`) stay that way too. `HOME_CONTEXT` comes from the leaf constants
 * module rather than the `context/` barrel, which drags in React components.
 */

import { HOME_CONTEXT } from './context/constants.js'

declare const ctxBaseBrand: unique symbol

/**
 * A context URL prefix: `'/~'` or `'/@comm.tld'`. Branded, so handing a raw idTag to a
 * builder — or a `'~'` to an API call — is a compile error rather than a runtime mystery.
 * Only `HOME_BASE`, `ctxBase()` and `useCtx().base` produce one.
 */
export type CtxBase = string & { readonly [ctxBaseBrand]: true }

/** The home context's prefix. `~` is a URL shorthand; it is never a tenant. */
export const HOME_BASE = '/~' as CtxBase

/** A path tail: either a pre-split list of segments, or a `a/b/c` string. */
export type Tail = string | readonly string[]

/** Query parameters; `null`/`undefined` values are dropped. */
export type QueryInit = Record<string, string | number | boolean | null | undefined>

/**
 * Percent-encode one path segment, leaving `:` literal — the colon is a legal path
 * character and load-bearing in a `<owner>:<fileId>` resId (`ExternalApp` and
 * `FileViewerApp` split on it), so a resId encodes as one segment with both halves
 * escaped and the separator intact.
 */
export function encodeSegment(segment: string): string {
	return encodeURIComponent(segment).replace(/%3A/gi, ':')
}

/**
 * Normalise a tail to `/a/b`, or `''` when empty — `a/b`, `/a/b` and `['a', 'b']` all come
 * out the same. `encode` is off only for `contextPath`'s tail, already-encoded URL text.
 */
function joinTail(tail?: Tail, encode = true): string {
	if (tail == null) return ''
	const segments = typeof tail === 'string' ? tail.split('/') : [...tail]
	const kept = segments.filter((s) => s !== '')
	const out = encode ? kept.map(encodeSegment) : kept
	return out.length ? `/${out.join('/')}` : ''
}

function buildQuery(query?: QueryInit): string {
	if (!query) return ''
	const params = new URLSearchParams()
	for (const [key, value] of Object.entries(query)) {
		if (value != null) params.append(key, String(value))
	}
	const encoded = params.toString()
	return encoded ? `?${encoded}` : ''
}

/**
 * True when a *first* path segment denotes a context: bare `~`, or an `@`-sigilled idTag.
 * `useMatch('/:contextIdTag/*')` matches `/login` and `/favicon.ico` happily, so this test
 * is the only thing keeping them out of the context machinery.
 */
export function isContextSegment(segment: string | undefined): boolean {
	return !!segment && (segment === HOME_CONTEXT || segment.startsWith('@'))
}

/**
 * Read back an app route built by `appPath`: `/~/app/quillo/bob.org:abc` →
 * `{ appId: 'quillo', resId: 'bob.org:abc' }`. Returns undefined for anything else.
 * The resId may be spelled with or without its `<owner>:` half — `ExternalApp`
 * (`apps/index.tsx`) fills the owner in from the context when it is absent.
 */
export function matchAppRoute(pathname: string): { appId: string; resId?: string } | undefined {
	const segments = pathname.split('/').filter((s) => s !== '')
	if (!isContextSegment(segments[0]) || segments[1] !== 'app') return undefined
	if (segments.length < 3 || segments.length > 4) return undefined
	return {
		appId: decodeURIComponent(segments[2]),
		resId: segments[3] == null ? undefined : decodeURIComponent(segments[3])
	}
}

/**
 * Roots that live outside the context grammar and render their own chrome. `/s/<refId>` is
 * deliberately absent — a share link is ordinary guest browsing with a token.
 */
export const BOOTSTRAP_ROOTS = [
	'login',
	'register',
	'reset-password',
	'idp/activate',
	'onboarding'
] as const

/** True for a bootstrap root or anything under it. */
export function isBootstrapPath(pathname: string): boolean {
	return BOOTSTRAP_ROOTS.some((r) => pathname === `/${r}` || pathname.startsWith(`/${r}/`))
}

/** `useMatch` pattern for "any context route": segment 1 plus everything after it. */
export const CTX_MATCH = '/:contextIdTag/*'

/** `useMatch` pattern naming segment 2, the section, plus its tail. */
export const CTX_SECTION_MATCH = '/:contextIdTag/:section/*'

/**
 * `useMatch` pattern for one named section: `sectionMatch('settings', ':page?')`.
 * The section is a literal so the match's params are the section's own, not a `:section`.
 */
export function sectionMatch(section: string, tail?: string): string {
	return `/:contextIdTag/${section}${tail ? `/${tail}` : ''}`
}

/**
 * The URL prefix addressing a tenant: `'/~'` for the home tenant, `'/@<idTag>'` otherwise.
 *
 * @param idTag - the tenant to address; `undefined` falls back to home
 * @param homeIdTag - this node's own idTag, from `apiAtom`; `undefined` until
 *   `/.well-known/cloudillo/id-tag` lands, in which case a real idTag is spelled out in
 *   full rather than collapsed to `~` — which routes identically.
 */
export function ctxBase(idTag: string | undefined, homeIdTag: string | undefined): CtxBase {
	if (!idTag || idTag === HOME_CONTEXT || idTag === homeIdTag) return HOME_BASE
	return `/@${encodeSegment(idTag)}` as CtxBase
}

/**
 * Re-home a context route under another context: `/@a.tld/settings/security` + `/~`
 * becomes `/~/settings/security`. A pathname with no second slash yields the bare base.
 *
 * The tail is carried byte-for-byte, which is why this takes the raw `location.pathname`
 * and not `useMatch`'s splat param — that one is decoded (and `%2F`-flattened) and cannot
 * be used to rebuild a path.
 */
export function rebase(pathname: string, base: CtxBase): string {
	const cut = pathname.indexOf('/', 1)
	return base + (cut < 0 ? '' : pathname.slice(cut))
}

/**
 * Scope a menu template (`app/files`, `communities`, `settings`) to a context. An absolute
 * template passes through untouched, which two items rely on: `site-admin` stays pinned to
 * `/~/site-admin` whatever context is browsed, and the guest-document item carries a whole
 * `/@owner/app/…` route or a `/s/<refId>` share link. Templates are assumed encoded.
 */
export function scopePath(base: CtxBase, template: string): string {
	return template.startsWith('/') ? template : `${base}/${template}`
}

/**
 * The one place the grammar is written down; everything below is a named wrapper.
 *
 * @param base - the context prefix, from `useCtx().base` or `ctxBase()`
 * @param section - the top-level section
 * @param tail - everything after the section, **already percent-encoded**
 * @param query - appended as `?a=1&b=2`
 */
export function contextPath(base: CtxBase, section: string, tail = '', query?: QueryInit): string {
	return `${base}/${section}${joinTail(tail, false)}${buildQuery(query)}`
}

/**
 * An app page or document: `appPath(base, 'quillo', 'bob.org:abc')`. `resId` is a
 * single segment — a `/` inside it is escaped, the `<owner>:<fileId>` colon is not.
 */
export function appPath(base: CtxBase, appId: string, resId?: string, query?: QueryInit): string {
	return contextPath(base, 'app', joinTail(resId == null ? [appId] : [appId, resId]), query)
}

/** The feed, or a single post's permalink. */
export function feedPath(base: CtxBase, actionId?: string, query?: QueryInit): string {
	return appPath(base, 'feed', actionId, query)
}

/** The file manager. */
export function filesPath(base: CtxBase, query?: QueryInit): string {
	return appPath(base, 'files', undefined, query)
}

/** The message list, or one conversation. */
export function messagesPath(base: CtxBase, convId?: string, query?: QueryInit): string {
	return appPath(base, 'messages', convId, query)
}

/** The built-in file viewer — the fallback when no app claims the content type. */
export function viewPath(base: CtxBase, resId: string, query?: QueryInit): string {
	return appPath(base, 'view', resId, query)
}

/**
 * A profile page, or the profile base path when `idTag` is omitted (components that
 * append their own segment take the base).
 *
 * @param tail - a sub-page: `'feed'`, `'about'`, `'connections'`, `'settings'`
 */
export function profilePath(base: CtxBase, idTag?: string, tail?: Tail, query?: QueryInit): string {
	const head = idTag == null ? '' : joinTail([idTag])
	return contextPath(base, 'profile', head + joinTail(tail), query)
}

/**
 * The create-community wizard.
 *
 * @param steps - wizard segments, e.g. `['idp', 'select']` or `['idp', 'name', provider]`
 */
export function communityCreatePath(base: CtxBase, steps?: Tail, query?: QueryInit): string {
	return contextPath(base, 'communities', joinTail('create') + joinTail(steps), query)
}

/** Settings, or one settings page (`'security'`, `'privacy'`, …). */
export function settingsPath(base: CtxBase, tail?: Tail, query?: QueryInit): string {
	return contextPath(base, 'settings', joinTail(tail), query)
}

/** The identity provider pages (`idpPath(base)` = identities, `idpPath(base, 'settings')`). */
export function idpPath(base: CtxBase, tail?: Tail, query?: QueryInit): string {
	return contextPath(base, 'idp', joinTail(tail), query)
}

/**
 * The node administration pages. Takes no context: it administers the node, not a
 * community, so it is always emitted under `~`. The guard in `site-admin/index.tsx`
 * re-pins it on arrival for anyone who types a community in by hand.
 */
export function siteAdminPath(tail?: Tail, query?: QueryInit): string {
	return contextPath(HOME_BASE, 'site-admin', joinTail(tail), query)
}

// vim: ts=4
