// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The hatted re-handshake, as a process-wide slot. `useContextTokenRenewal`
 * registers its renewer here; the auth-error handler (`auth/useTokenRenewal.ts`)
 * and `mintAppToken` (`message-bus/shell-bus-config.ts`) call it from outside any
 * hook. A leaf module (no React) so node test suites can import it.
 */

import { type AuthRecovery, contextKey, FetchError } from '@cloudillo/core'
import type { TFunction } from 'i18next'

type Recovery = (key: string) => Promise<string | undefined>

let hattedRecovery: Recovery | undefined

/** Install `fn` as the re-handshake; returns the matching unregister. */
export function registerHattedRecovery(fn: Recovery): () => void {
	hattedRecovery = fn
	return () => {
		if (hattedRecovery === fn) hattedRecovery = undefined
	}
}

/**
 * 401 recovery for a hatted client: one re-handshake, never an access-token
 * refresh. `undefined` = not recoverable (hat revoked, or the hook not mounted).
 */
export async function recoverHattedAuth(
	idTag: string,
	hat: string
): Promise<AuthRecovery | undefined> {
	const token = await hattedRecovery?.(contextKey(idTag, hat))
	return token ? { token } : undefined
}

/** B refused the hat (403/404): no partnership, or the hat's membership is gone. */
export function isRefusal(err: unknown): boolean {
	return err instanceof FetchError && (err.httpStatus === 403 || err.httpStatus === 404)
}

/** The toast for a refused hat; callers pass display names. */
export const hatRefusedText = (t: TFunction, hat: string, community: string) =>
	t('{{hat}} has no agreement with {{community}}', { hat, community })

// vim: ts=4
