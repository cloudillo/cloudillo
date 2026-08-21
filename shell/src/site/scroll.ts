// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Keeping the reader's place across a client-side navigation.
 *
 * Not the browser's own restoration: it runs when the history entry is activated,
 * which on a site route is *before* the fragment has been fetched, so it scrolls
 * the page the reader just left. Offsets are kept by hand instead, under
 * `useLocation().key` — one per history entry, so a page visited twice keeps two.
 *
 * The scroller is `SitePage`'s host div (`.c-site-content-host`), never the
 * viewport, which is why one `scrollTop` is enough.
 *
 * The browser's restoration is only switched off while a site route is on screen and
 * put back when it stands down: nothing else in the shell keeps offsets by hand, so
 * leaving it `'manual'` would cost every other route its place for the rest of the
 * session.
 */

/** Offsets by history key. Bounded: a long session must not grow without limit. */
const offsets = new Map<string, number>()
const LIMIT = 50

/**
 * What the browser had before the site route took over, so a shell route gets its own
 * restoration back. `undefined` means we have not touched it.
 */
let browserRestoration: ScrollRestoration | undefined

/** Stop the browser from restoring scroll itself. Undone by the function below. */
export function enableManualScrollRestoration(): void {
	if (!('scrollRestoration' in window.history)) return
	if (browserRestoration === undefined) browserRestoration = window.history.scrollRestoration
	window.history.scrollRestoration = 'manual'
}

/**
 * Hand restoration back to the browser. Called from `SitePage`'s unmount, which is
 * where the site route ends.
 */
export function restoreBrowserScrollRestoration(): void {
	if (browserRestoration === undefined) return
	window.history.scrollRestoration = browserRestoration
	browserRestoration = undefined
}

/** Remember where a history entry was left. Call it on the way out, not on the way in. */
export function saveScrollOffset(key: string, el: HTMLElement | null): void {
	if (!el) return
	offsets.delete(key)
	offsets.set(key, el.scrollTop)
	if (offsets.size > LIMIT) {
		const oldest = offsets.keys().next()
		if (!oldest.done) offsets.delete(oldest.value)
	}
}

/** Put a history entry back. `false` leaves the caller an anchor or the top. */
export function restoreScrollOffset(key: string, el: HTMLElement | null): boolean {
	const offset = offsets.get(key)
	if (offset === undefined || !el) return false
	el.scrollTop = offset
	return true
}

// vim: ts=4
