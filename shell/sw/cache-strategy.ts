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
	//
	// No `/apps/<name>/…` here on purpose: bundles live on the API domain and `index.ts`
	// only calls us for same-origin GETs, so no bundle request reaches this function.
	// Their only cache is now `asset_cache_control` in cloudillo-rs
	// (`crates/cloudillo/src/routes/static_files.rs`). Offline app loading went with it:
	// an app iframe is sandboxed without `allow-same-origin` (`APP_SANDBOX`), so its
	// document has an opaque origin and is never a ServiceWorker client. Restoring it
	// would mean relaxing that sandbox — the one thing it exists to prevent.
	if (
		/^\/assets-[^/]+\//.test(pathname) || // /assets-1.2.3/*
		pathname.startsWith('/fonts/') ||
		pathname.startsWith('/sounds/') ||
		/^\/favicon\./.test(pathname) // /favicon.svg, /favicon.ico
	)
		return 'cache-first'

	// HTML and everything else unclassified: network first so updates land quickly
	return 'network-first'
}
// vim: ts=4
