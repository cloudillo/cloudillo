// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/** Sandbox and trust policy for the app iframes. */

import type { TrustLevel } from '../utils.js'

/** Booleans are the legacy spelling of trusted/untrusted; a TrustLevel passes through. */
export function normalizeTrust(trust: TrustLevel | boolean | undefined): TrustLevel {
	if (trust === true) return 'trusted'
	if (trust === false || trust === undefined) return 'untrusted'
	return trust
}

/**
 * The iframe sandbox attribute value. Every trust level gets the same permissions, and never
 * 'allow-same-origin': the opaque origin is what keeps apps away from the shell's
 * serviceWorker API and the SW encryption key (readable via scriptURL).
 *
 * `allow-popups` lets apps open external links with `window.open` / `<a target>`;
 * `allow-popups-to-escape-sandbox` makes those popups normal windows rather than inheriting
 * the app's sandbox, which is what users expect from a link to an external site.
 */
export const APP_SANDBOX =
	'allow-scripts allow-forms allow-downloads allow-popups allow-popups-to-escape-sandbox'
// vim: ts=4
