// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Is a published page on screen *right now*? Set by `SitePage` while mounted.
 *
 * Not `isSiteDocument` (`./detect.js`), which asks whether the document was served
 * by the site wrapper and stays true for the whole session.
 */

import { atom } from 'jotai'

import { type SiteBootSeed, siteSeed } from './detect.js'

export const siteRouteActiveAtom = atom(false)

/**
 * Which site the page on screen belongs to.
 *
 * `siteSeed` on a document the wrapper served; filled from the fragment response's
 * headers on a page fetched from a shell route, where there is no seed at all — see
 * `loadSiteFragment`. `SiteBar` and `useSiteManifest` read this rather than the
 * module constant, so a `<Link>` out of a search hit still gets its chrome.
 */
export const siteContextAtom = atom<SiteBootSeed | null>(siteSeed)

// vim: ts=4
