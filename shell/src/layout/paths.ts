// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/** Path predicates for the shell's guest/auth routing, plus one label helper. */

// From the defining module rather than the `context/` barrel: the barrel drags
// in React components, which this DOM-free module (and its tests) has no use for.
import { HOME_CONTEXT } from '../context/constants.js'

/** Truncate a filename while preserving its extension. */
export function truncateFileName(name: string, maxLen: number = 12): string {
	if (name.length <= maxLen) return name
	const extIdx = name.lastIndexOf('.')
	if (extIdx > 0 && name.length - extIdx <= 6) {
		const baseName = name.substring(0, extIdx)
		const extension = name.substring(extIdx)
		const available = maxLen - extension.length - 1 // -1 for "…"
		if (available > 0) {
			return baseName.substring(0, available) + '…' + extension
		}
	}
	return name.substring(0, maxLen - 1) + '…'
}

/** Is this path accessible to guests (unauthenticated users)? */
export function isGuestPath(pathname: string): boolean {
	return (
		pathname === '/' ||
		pathname.startsWith('/app/') ||
		pathname.startsWith('/profile/') ||
		pathname.startsWith('/s/') || // Shared resource links
		pathname.startsWith('/login') ||
		pathname.startsWith('/register/') ||
		pathname.startsWith('/onboarding/') ||
		pathname.startsWith('/reset-password/') || // Password reset links
		pathname.startsWith('/idp/activate/') // IDP activation links
	)
}

/**
 * Where a guest on `pathname` should be sent, or undefined when they may stay.
 */
export function getGuestRedirect(pathname: string): string | undefined {
	if (pathname === '/') {
		return `/app/${HOME_CONTEXT}/feed`
	}
	if (!isGuestPath(pathname)) {
		return '/login'
	}
	return undefined
}

// vim: ts=4
