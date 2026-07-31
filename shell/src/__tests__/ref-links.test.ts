// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The share-link (ref) rules in `shell/src/utils/refs.ts`, shared by ShareDialog, DetailsPanel and
 * ShareCreate.
 *
 * The property under test is REDACTION: the backend replaces a ref's `refId` with an opaque `r1~…`
 * digest for a share reader who is not a manager (`RefResponse::redact`, cloudillo-rs
 * crates/cloudillo-ref/src/handler.rs). Nothing addressed BY that refId works - not a URL, not a QR,
 * not `PATCH /refs/:refId`, not `DELETE /refs/:refId` - so the withholding has to outrank every
 * local predicate, at all three surfaces.
 */

import { FetchError, type Ref } from '@cloudillo/core'

import {
	canUseRefCredential,
	isRefRedacted,
	isRefReusable,
	refLifecycle,
	shareLinkErrorMessage
} from '../utils/refs.js'

const NOW = new Date('2026-07-31T12:00:00Z')

function ref(over: Partial<Ref> = {}): Ref {
	return {
		refId: 'r1abcdef',
		type: 'share.file',
		createdAt: '2026-01-01T00:00:00Z',
		...over
	}
}

/** What a share READER gets back: the digest in place of the credential. */
function redacted(over: Partial<Ref> = {}): Ref {
	return ref({ refId: 'r1~9f8e7d', redacted: true, ...over })
}

describe('isRefRedacted', () => {
	it('reads only an explicit true as withheld', () => {
		expect(isRefRedacted(redacted())).toBe(true)
		expect(isRefRedacted(ref())).toBe(false)
		expect(isRefRedacted(ref({ redacted: false }))).toBe(false)
	})
})

describe('canUseRefCredential', () => {
	it('lets a manager use a real refId', () => {
		expect(canUseRefCredential(ref(), true)).toBe(true)
	})

	// The server withholding the credential outranks the local predicate: `canShare` may be true
	// from an 'A' grant the list call could not see, and the digest still builds nothing that works.
	it('refuses a manager a redacted one', () => {
		expect(canUseRefCredential(redacted(), true)).toBe(false)
	})

	// Handing out the refId IS an act of re-sharing, so reading the list is not enough.
	it('refuses a reader even a real refId', () => {
		expect(canUseRefCredential(ref(), false)).toBe(false)
		expect(canUseRefCredential(redacted(), false)).toBe(false)
	})
})

describe('isRefReusable', () => {
	it('accepts a plain ref', () => {
		expect(isRefReusable(ref())).toBe(true)
		expect(isRefReusable(ref({ params: 'mode=present' }))).toBe(true)
	})

	// A ref pinned to one page cannot stand in for a link to another
	it('rejects one carrying a nav param', () => {
		expect(isRefReusable(ref({ params: 'nav=1' }))).toBe(false)
		expect(isRefReusable(ref({ params: 'mode=present&nav=page2' }))).toBe(false)
	})

	/*
	 * THE regression: ShareCreate's old `isCompatibleRef` checked only the nav param, so a reader's
	 * digest was auto-selected, copied to the clipboard and returned to the requesting app as a
	 * working link. It is permanently dead.
	 */
	it('rejects a redacted ref whatever its params', () => {
		expect(isRefReusable(redacted())).toBe(false)
		expect(isRefReusable(redacted({ params: 'nav=1' }))).toBe(false)
	})
})

/*
 * Mirrors the filter arms in adapters/meta-adapter-sqlite/src/reference.rs, which is also what the
 * server's default `filter: 'active'` hides.
 */
describe('refLifecycle', () => {
	it('is active with no expiry and no use limit', () => {
		expect(refLifecycle({}, NOW)).toBe('active')
		expect(refLifecycle({ count: undefined }, NOW)).toBe('active')
		expect(refLifecycle({ count: 3 }, NOW)).toBe('active')
	})

	it('is active while the expiry is still ahead', () => {
		expect(refLifecycle({ expiresAt: '2026-12-01T00:00:00Z' }, NOW)).toBe('active')
	})

	it('is expired once the deadline has passed', () => {
		expect(refLifecycle({ expiresAt: '2026-01-01T00:00:00Z' }, NOW)).toBe('expired')
	})

	it('is used at count 0', () => {
		expect(refLifecycle({ count: 0 }, NOW)).toBe('used')
	})

	// 'used' wins: a consumed ref is irrecoverable (`update_ref` refuses to resurrect count === 0)
	// while an expiry can still be pushed forward by PATCH, so the label has to name the fixable
	// problem last.
	it('reports used ahead of expired when both hold', () => {
		expect(refLifecycle({ count: 0, expiresAt: '2026-01-01T00:00:00Z' }, NOW)).toBe('used')
	})
})

/*
 * `E-FILE-ACCESS_LEVEL_FORBIDDEN`, which ShareDialog used to branch on, exists nowhere in
 * cloudillo-rs. These are the codes that actually arrive (crates/cloudillo-types/src/error.rs).
 */
describe('shareLinkErrorMessage', () => {
	const t = (key: string) => key

	function apiError(apiErrorCode: string, httpStatus: number): FetchError {
		return new FetchError(apiErrorCode, 'denied', httpStatus, apiErrorCode)
	}

	it('explains the grant ceiling on a 403', () => {
		expect(shareLinkErrorMessage(apiError('E-AUTH-NOPERM', 403), t)).toBe(
			'You cannot create a link with more access than you hold on this file.'
		)
	})

	it('blames the settings on a validation refusal', () => {
		expect(shareLinkErrorMessage(apiError('E-VAL-INVALID', 400), t)).toBe(
			'The server rejected these link settings.'
		)
	})

	it('falls back to the generic message for anything else', () => {
		expect(shareLinkErrorMessage(apiError('E-SRV-INTERNAL', 500), t)).toBe(
			'Failed to create share link'
		)
		expect(shareLinkErrorMessage(new Error('network down'), t)).toBe(
			'Failed to create share link'
		)
		expect(shareLinkErrorMessage(undefined, t)).toBe('Failed to create share link')
	})
})

// vim: ts=4
