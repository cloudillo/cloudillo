// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Share-link (ref) rules shared by ShareDialog, DetailsPanel and ShareCreate. Pure and React-free so
 * the three surfaces cannot drift and so they can be tested without a renderer (`shell` has no
 * `@testing-library/react`).
 */

import { FetchError, type Ref } from '@cloudillo/core'

/**
 * Whether the server replaced this ref's `refId` with an opaque `r1~…` digest, which it does for a
 * share READER who is not a manager (`RefResponse::redact` in cloudillo-rs
 * crates/cloudillo-ref/src/handler.rs).
 */
export function isRefRedacted(ref: Pick<Ref, 'redacted'>): boolean {
	return ref.redacted === true
}

/**
 * Copy / QR / edit / delete all address the ref BY its refId. A redacted digest is not one — it
 * builds no working URL, no valid QR, and both `PATCH /refs/:refId` and `DELETE /refs/:refId` 404 on
 * it — and the server withholding the credential outranks any local predicate.
 */
export function canUseRefCredential(ref: Pick<Ref, 'redacted'>, canManage: boolean): boolean {
	return canManage && !isRefRedacted(ref)
}

/**
 * Reuse candidate for ShareCreate: not redacted, and carrying no `nav` param (a ref pinned to one
 * page cannot stand in for a link to another).
 */
export function isRefReusable(ref: Ref): boolean {
	if (isRefRedacted(ref)) return false
	if (!ref.params) return true
	return !new URLSearchParams(ref.params).has('nav')
}

export type RefLifecycle = 'active' | 'expired' | 'used'

/**
 * Mirrors the filter arms in adapters/meta-adapter-sqlite/src/reference.rs.
 *
 * `'used'` is reported ahead of `'expired'` when both hold: a consumed ref is irrecoverable
 * (`update_ref` refuses to resurrect `count === 0`) while an expiry can still be extended by PATCH.
 */
export function refLifecycle(ref: Pick<Ref, 'expiresAt' | 'count'>, now: Date): RefLifecycle {
	if (ref.count === 0) return 'used'
	if (ref.expiresAt != null) {
		const exp = new Date(ref.expiresAt).getTime()
		if (!Number.isNaN(exp) && exp <= now.getTime()) return 'expired'
	}
	return 'active'
}

/**
 * The user-facing message for a failed ref mutation.
 *
 * The codes that actually arrive are the generic ones in cloudillo-rs
 * crates/cloudillo-types/src/error.rs — there is no ref-specific error code, so branching on one
 * (as this UI once did on `E-FILE-ACCESS_LEVEL_FORBIDDEN`) never fires.
 *
 * Takes a `t`-like lookup rather than a TFunction so it needs no i18n runtime to test.
 */
export function shareLinkErrorMessage(err: unknown, t: (key: string) => string): string {
	if (err instanceof FetchError) {
		// The grant ceiling: `ensure_grant_within` caps every mint and widen at the caller's own
		// access level.
		if (err.apiErrorCode === 'E-AUTH-NOPERM') {
			return t('You cannot create a link with more access than you hold on this file.')
		}
		if (err.apiErrorCode === 'E-VAL-INVALID') {
			console.error('Share link rejected', err.descr)
			return t('The server rejected these link settings.')
		}
	}
	return t('Failed to create share link')
}

// vim: ts=4
