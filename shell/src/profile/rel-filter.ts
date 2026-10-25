// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

export type RelFilter = 'connected' | 'followed' | 'followers' | 'all'

/**
 * People defaults to Connected (`?filter=all` for everyone); Communities defaults to All.
 * Legacy `?connected=1` still means Connected.
 */
export function parseRelFilter(
	qs: Record<string, string>,
	variant: 'person' | 'community'
): RelFilter {
	if (qs.connected === '1') return 'connected'
	if (qs.filter === 'followed' || qs.filter === 'all') return qs.filter
	if (qs.filter === 'followers' && variant === 'person') return 'followers'
	return variant === 'person' ? 'connected' : 'all'
}

// vim: ts=4
