// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The iframe sandbox attribute value. Every trust level gets the same permissions, and never
 * 'allow-same-origin': the opaque origin it forces is what stands between an app and the API
 * origin its bundle is served from — shared with every other app and with installed apkg
 * apps — so relaxing it is its own decision.
 *
 * `allow-popups` lets apps open external links; `allow-popups-to-escape-sandbox` makes those
 * popups normal windows instead of sandbox inheritors, as users expect from an external link.
 */
export const APP_SANDBOX =
	'allow-scripts allow-forms allow-downloads allow-popups allow-popups-to-escape-sandbox'

// vim: ts=4
