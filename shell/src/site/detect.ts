// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Is this document a published site page?
 *
 * The backend's site wrapper (`crates/cloudillo-site/src/wrapper.rs`, `render_page`)
 * emits the server-rendered article into a `#cl-site-content` div placed *before* the
 * empty `#app` the shell mounts into. A shell page never carries that element, so its
 * presence at boot is the whole predicate — available synchronously, before React and
 * before the auth waterfall in `auth/boot.ts` runs.
 *
 * **Captured once, at module load, deliberately.** `SitePage` re-parents the node into
 * the React tree and a navigation to a shell route unmounts it again, so a live
 * `getElementById` would start answering "no" while the fact it stands for — *this
 * document was served by the site wrapper* — has not changed.
 */

import { tAnyValue } from '@cloudillo/core'
import { normalizeSiteNav, type SiteNavItem } from '@cloudillo/types'
import * as T from '@symbion/runtype'

/**
 * The entries of one nav level that survive, in order.
 *
 * The rule itself lives in `@cloudillo/types`, beside `tSiteNavList` — the forgiving
 * type `GET /api/sites` reads its nav through — so the boot seed and the API response
 * cannot drift apart on what a target has to be. This is the name the shell has
 * always called it.
 */
export const normalizeNav = normalizeSiteNav

/**
 * Mirror of `CONTENT_ELEMENT_ID` in `crates/cloudillo-site/src/wrapper.rs`. The two
 * repositories have no shared build step; if this drifts, every published page falls
 * back to the shell's 404 with its content stranded outside the React tree.
 */
export const SITE_CONTENT_ID = 'cl-site-content'

/** True when the site wrapper served this document. Never recomputed — see above. */
export const isSiteDocument = document.getElementById(SITE_CONTENT_ID) !== null

/**
 * Mirror of `CHROME_ELEMENT_ID` in `wrapper.rs`: the wrapper's own header and site
 * bar, painted inert so a cold load does not start with an unstyled article and
 * then push it down. `SitePage` removes the whole element in the layout effect
 * that mounts React's chrome, so the two never coexist in a painted frame.
 */
export const SITE_CHROME_ID = 'cl-site-chrome'

/**
 * Mirror of `PREBOOT_BODY_CLASS` in `wrapper.rs`. It is what reserves the chrome's
 * height above the content while React's own layout is not there yet
 * (`shell/src/ui/site-bar.css`), and it comes off in the same commit as the element
 * above.
 */
export const SITE_PREBOOT_CLASS = 'cl-site-preboot'

/** Mirror of `SITE_SEED_TYPE` in `wrapper.rs`. Non-executable, and parsed below. */
export const SITE_SEED_TYPE = 'application/cloudillo-site+json'

/**
 * One entry of the site's navigation, as `nav_seed` in `wrapper.rs` spells it.
 *
 * `target` is **site-absolute** (`/blog/hello`) or an absolute external URL — the
 * server resolves it once, so neither this parser nor the bar has to know which
 * mount a link came from. `children` is omitted rather than sent empty, and
 * nesting is one level deep by construction.
 */
export type SiteSeedNavEntry = SiteNavItem

/**
 * What the wrapper knows and the shell would otherwise have to fetch.
 *
 * Written by `push_boot_seed` in `wrapper.rs`. The **normalized** result, not the
 * wire shape — `host` has fallen back and every nav target has been through
 * `safeHref` by the time anything holds one of these. The wire shape is
 * `tSiteBootSeed` below.
 */
export interface SiteBootSeed {
	owner: { idTag: string; name: string; profilePic?: string }
	/** `docFileId` is the Notillo document behind the mount serving this page. */
	site: { host: string; mountPath: string; docFileId: string }
	nav: SiteSeedNavEntry[]
}

/**
 * The seed as it arrives. Required = no sensible fallback; everything else gets
 * one applied after the decode. `host` in particular must not be a `T.withDefault`:
 * `window.location.host` has to be read when the seed is parsed, not when this
 * module is evaluated. `nav` stays undecoded so `normalizeNav` can refuse entries
 * one at a time.
 */
const tSiteBootSeed = T.struct({
	owner: T.struct({
		idTag: T.string,
		name: T.optional(T.string),
		// `null` on the wire when the owner has no picture.
		profilePic: T.optional(T.nullable(T.string))
	}),
	site: T.struct({
		host: T.optional(T.string),
		mountPath: T.string,
		docFileId: T.optional(T.string)
	}),
	nav: T.optional(T.array(tAnyValue))
})

/**
 * `'drop'` everywhere below: a field a newer wrapper added must not cost this one
 * the entry carrying it.
 *
 * Declared above `siteSeed` on purpose — that constant runs `readSiteSeed()` during
 * module evaluation, so anything the parser reads must already be initialised.
 */
const DECODE_OPTS = { unknownFields: 'drop' } as const

/**
 * The boot seed, read once at module load like `isSiteDocument` above.
 *
 * `null` on any shell document, and on a site page served by a server that predates
 * the seed. Decoded rather than trusted: it is our own same-origin markup, but a
 * stale generation may be missing a field, and that must not cost the page its
 * runtime.
 */
export const siteSeed: SiteBootSeed | null = readSiteSeed()

/**
 * Does this node serve a site at all?
 *
 * Both halves are the module-load constants above, so this is a plain expression and
 * never state — a function only so a suite can substitute the answer.
 *
 * Its **only** job is choosing which 404 an unknown top-level path renders: "This
 * address is not part of this site" is nonsense on a node with no site. It must
 * **not** gate the fragment fetch — see the `followRoute` note in `SitePage.tsx`,
 * which spells out why.
 */
export function nodeHasSite(): boolean {
	return isSiteDocument || siteSeed !== null
}

function readSiteSeed(): SiteBootSeed | null {
	const el = document.querySelector(`script[type="${SITE_SEED_TYPE}"]`)
	if (!el?.textContent) return null
	try {
		const seed = T.decode(tSiteBootSeed, JSON.parse(el.textContent), DECODE_OPTS)
		if (!T.isOk(seed)) {
			console.error(
				'[site] Malformed boot seed:',
				seed.err.map((e) => `${e.path.join('.')}: ${e.error}`).join(', ')
			)
			return null
		}
		const { owner, site, nav } = seed.ok
		return {
			owner: {
				idTag: owner.idTag,
				name: owner.name ?? owner.idTag,
				profilePic: owner.profilePic ?? undefined
			},
			site: {
				host: site.host ?? window.location.host,
				mountPath: site.mountPath,
				docFileId: site.docFileId ?? ''
			},
			nav: normalizeNav(nav ?? [])
		}
	} catch (err) {
		console.error('[site] Malformed boot seed:', err)
		return null
	}
}

// vim: ts=4
