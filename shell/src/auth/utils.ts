// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { FetchError, type RateLimitErrorDetails } from '@cloudillo/core'
import type { TFunction } from 'i18next'

/**
 * Maps a caught error to a friendly message for rate-limiting responses:
 * a hard ban (403 `E-RATE-BANNED`, with `remainingSecs`) or a soft throttle
 * (429 `E-RATE-LIMITED`). Returns undefined for anything else.
 *
 * A failed-login auto-ban applies globally across endpoints, so account
 * recovery pages can hit it too — surface a clear retry message instead of a
 * misleading "invalid link" / generic error.
 */
export function rateLimitMessage(err: unknown, t: TFunction): string | undefined {
	if (!(err instanceof FetchError)) return undefined
	if (err.is('E-RATE-BANNED')) {
		const secs = (err.details as RateLimitErrorDetails | undefined)?.remainingSecs
		if (typeof secs === 'number' && secs > 0) {
			const mins = Math.ceil(secs / 60)
			return t('Too many attempts. Please try again in about {{count}} minute', {
				count: mins
			})
		}
		return t('Too many attempts. Please try again later.')
	}
	if (err.is('E-RATE-LIMITED')) {
		return t('Too many requests. Please slow down and try again shortly.')
	}
	return undefined
}

export function validIdTag(idTag: string) {
	return idTag.match(/^[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)*$/)
}
