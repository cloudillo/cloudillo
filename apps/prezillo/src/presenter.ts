// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * Presenter view helpers: timer format, touch zones, second-screen detection and the
 * same-origin presenter popup (rendered into by `PresenterWindow` via a portal).
 */

/** `m:ss`, or `h:mm:ss` from one hour on */
export function formatElapsed(ms: number): string {
	const total = Math.max(0, Math.floor(ms / 1000))
	const h = Math.floor(total / 3600)
	const m = Math.floor((total % 3600) / 60)
	const s = String(total % 60).padStart(2, '0')
	return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}

export type TapZone = 'prev' | 'toggle' | 'next'

/** Where a tap at `x` (0..width) lands: halves for a mouse, thirds (middle toggles) on touch */
export function tapZone(x: number, width: number, coarse: boolean): TapZone {
	if (!coarse) return x > width / 2 ? 'next' : 'prev'
	if (x < width / 3) return 'prev'
	if (x > (width * 2) / 3) return 'next'
	return 'toggle'
}

export const SWIPE_MIN_PX = 50

/** A mostly horizontal drag of more than SWIPE_MIN_PX: swipe left = next, right = prev */
export function isSwipe(dx: number, dy: number): 'prev' | 'next' | null {
	if (Math.abs(dx) <= SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy) * 1.5) return null
	return dx < 0 ? 'next' : 'prev'
}

// Not in lib.dom yet: Window Management and Presentation API surfaces we feature-detect
interface ScreenDetailed extends Screen {
	isPrimary?: boolean
}
interface ScreenDetails {
	screens: ScreenDetailed[]
	currentScreen: ScreenDetailed
}
type WindowWithScreens = Window & {
	getScreenDetails?: () => Promise<ScreenDetails>
}

function screenExtended(): boolean {
	return (window.screen as Screen & { isExtended?: boolean }).isExtended === true
}

/**
 * Is a second display attached and usable? Called on an explicit user action (opening the view
 * picker), so the window-management permission prompt lands there. Cast displays are offered
 * separately ("Present on…").
 */
export async function detectExternalDisplay(): Promise<boolean> {
	const w = window as WindowWithScreens
	if (!screenExtended() || !w.getScreenDetails) return false
	try {
		await w.getScreenDetails()
		return true
	} catch {
		return false
	}
}

/**
 * A screen other than the current one, for `requestFullscreen({ screen })`. Never prompts: only
 * uses window-management when already granted, so the caller's user activation survives for
 * `requestFullscreen`.
 */
export async function getExternalScreen(): Promise<Screen | null> {
	const w = window as WindowWithScreens
	if (!screenExtended() || !w.getScreenDetails) return null
	const st = (
		await navigator.permissions
			?.query({ name: 'window-management' as PermissionName })
			.catch(() => null)
	)?.state
	if (st !== 'granted') return null
	try {
		const details = await w.getScreenDetails()
		return (
			details.screens.find((s) => s !== details.currentScreen && s.isPrimary === false) ??
			details.screens.find((s) => s !== details.currentScreen) ??
			null
		)
	} catch {
		return null
	}
}

/**
 * Open the presenter popup as `about:blank` (same origin and JS realm as this document), with
 * this document's stylesheets and theme. Must run synchronously inside the user's click.
 */
export function openPresenterWindow(title: string): Window | null {
	let win: Window | null = null
	try {
		win = window.open('', 'prezillo-presenter', 'popup,width=1000,height=700')
	} catch {
		return null
	}
	if (!win) return null
	try {
		const pdoc = win.document
		// A window of this name may survive from an earlier session: start clean
		pdoc.head.replaceChildren()
		pdoc.body.replaceChildren()
		const meta = pdoc.createElement('meta')
		meta.setAttribute('charset', 'utf-8')
		pdoc.head.append(meta)
		for (const el of document.head.querySelectorAll<HTMLElement>(
			'link[rel="stylesheet"], style'
		)) {
			const copy = el.cloneNode(true) as HTMLElement
			if (copy instanceof HTMLLinkElement) copy.href = (el as HTMLLinkElement).href
			pdoc.head.append(copy)
		}
		pdoc.title = title
		for (const { name, value } of document.documentElement.attributes) {
			pdoc.documentElement.setAttribute(name, value)
		}
		pdoc.body.className = document.body.className
	} catch {
		win.close()
		return null
	}
	return win
}

// vim: ts=4
