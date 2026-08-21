// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/** Which caching policy the shell's own static assets get, by path. */

/**
 * The versioned asset directory. `manifest.json`, `offline.html` and the PWA icons all
 * live under it, so the dist root only has to serve `sw.js` itself. One definition here
 * for the whole worker — `index.ts` and `push.ts` compose their paths from it.
 */
export const ASSET_BASE = `/assets-${process.env.CLOUDILLO_VERSION || 'unknown'}`

export const PRECACHE_URLS: string[] = [
	'/',
	'/index.html',
	`${ASSET_BASE}/manifest.json`,
	`${ASSET_BASE}/icon-192.png`,
	`${ASSET_BASE}/offline.html`
]

export type CacheStrategy = 'cache-first' | 'network-first' | 'network-only'

export function shouldCache(response: Response): boolean {
	const cc = response.headers.get('Cache-Control') || ''
	return !cc.includes('no-store') && !cc.includes('no-cache')
}

export function getCacheStrategy(pathname: string): CacheStrategy {
	// API and WebSocket endpoints: never cache
	if (pathname.startsWith('/api/') || pathname.startsWith('/ws/')) return 'network-only'

	// Versioned assets, fonts, sounds, favicons: immutable / long-lived. The manifest
	// and the icons match the first pattern now that they are versioned too.
	if (
		/^\/assets-[^/]+\//.test(pathname) || // /assets-1.2.3/*
		/^\/apps\/[^/]+\/assets-[^/]+\//.test(pathname) || // /apps/quillo/assets-1.0.0/*
		pathname.startsWith('/fonts/') ||
		pathname.startsWith('/sounds/') ||
		/^\/favicon\./.test(pathname) // /favicon.svg, /favicon.ico
	)
		return 'cache-first'

	// HTML: try network first so updates land quickly
	if (
		pathname === '/' ||
		pathname === '/index.html' ||
		/^\/apps\/[^/]+\/index\.html$/.test(pathname)
	)
		return 'network-first'

	// Everything else: network-first as a safe default
	return 'network-first'
}
// vim: ts=4
