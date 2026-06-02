// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

export const HOME_CONTEXT = '~'

// The platform's default community offered during onboarding.
export const DEFAULT_COMMUNITY_ID_TAG = 'cloudillo.net'

// Top-level URL prefixes that carry a context idTag as their first path
// segment. Both `useContextFromRoute` and the sidebar's switcher use this
// list to decide which URLs are context-scoped — keep them in sync.
export const CONTEXT_ROUTE_PREFIXES = [
	'app',
	'idp',
	'settings',
	'users',
	'communities',
	'profile'
] as const

export type ContextRoutePrefix = (typeof CONTEXT_ROUTE_PREFIXES)[number]

// Matches `/<prefix>/<contextIdTag>[/...]` for any prefix in
// CONTEXT_ROUTE_PREFIXES. Capture groups: [1] = prefix, [2] = contextIdTag,
// [3] = trailing path (including leading slash) or undefined.
export const CONTEXT_ROUTE_REGEX = new RegExp(
	`^/(${CONTEXT_ROUTE_PREFIXES.join('|')})/([^/]+)(/.*)?$`
)
