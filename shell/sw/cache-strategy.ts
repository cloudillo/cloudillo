// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/** Which caching policy the shell's own static assets get, by path. */

export const PRECACHE_URLS: string[] = [
	'/',
	'/index.html',
	'/manifest.json',
	'/icon-192.png',
	'/offline.html'
]

export type CacheStrategy = 'cache-first' | 'network-first' | 'network-only'

export function shouldCache(response: Response): boolean {
	const cc = response.headers.get('Cache-Control') || ''
	return !cc.includes('no-store') && !cc.includes('no-cache')
}

export function getCacheStrategy(pathname: string): CacheStrategy {
	// API and WebSocket endpoints: never cache
	if (pathname.startsWith('/api/') || pathname.startsWith('/ws/')) return 'network-only'

	// Versioned assets, fonts, sounds, icons, favicons: immutable / long-lived
	if (
		/^\/assets-[^/]+\//.test(pathname) || // /assets-1.2.3/*
		/^\/apps\/[^/]+\/assets-[^/]+\//.test(pathname) || // /apps/quillo/assets-1.0.0/*
		pathname.startsWith('/fonts/') ||
		pathname.startsWith('/sounds/') ||
		/^\/icon-[^/]+\.png$/.test(pathname) || // /icon-192.png, /icon-512.png
		/^\/favicon\./.test(pathname) // /favicon.svg, /favicon.ico
	)
		return 'cache-first'

	// HTML and manifest: try network first so updates land quickly
	if (
		pathname === '/' ||
		pathname === '/index.html' ||
		pathname === '/manifest.json' ||
		/^\/apps\/[^/]+\/index\.html$/.test(pathname)
	)
		return 'network-first'

	// Everything else: network-first as a safe default
	return 'network-first'
}
// vim: ts=4
