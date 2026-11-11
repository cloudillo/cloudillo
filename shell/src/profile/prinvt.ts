// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import type { ActionView } from '@cloudillo/types'

/** A PRINVT is live until its ISO expiry. No expiry, or one that does not parse, counts as live. */
export function isLiveInvite(expiresAt: string | undefined, nowMs: number): boolean {
	if (expiresAt === undefined) return true
	return !(Date.parse(expiresAt) <= nowMs)
}

/** The invite ref carried by a PRINVT action, if it has a usable one. */
export function prinvtRefId(action: ActionView): string | undefined {
	const refId = (action.content as { refId?: unknown } | undefined)?.refId
	return typeof refId === 'string' && refId ? refId : undefined
}
