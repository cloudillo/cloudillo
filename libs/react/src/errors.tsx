// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * The error convention: `friendlyError(t, err)` turns any failure into a translated sentence
 * for the user (never the backend `descr`), and `<LoadError>` shows it for a failed first load.
 * Log the raw error with `errorMessage()` from `@cloudillo/core`.
 */

import { FetchError } from '@cloudillo/core'
import {
	AuthError,
	ConnectionError,
	NotFoundError,
	PermissionError,
	TimeoutError,
	ValidationError
} from '@cloudillo/rtdb'
import * as React from 'react'

import { Button } from './components/Button/Button.js'
import { EmptyState } from './components/EmptyState/EmptyState.js'
import { type TFunction, useLibTranslation } from './i18n.js'

/** A translated, user-facing sentence for `err`. Each sentence is a literal `t()` call so the
 *  i18n scanner sees it. */
export function friendlyError(t: TFunction, err: unknown): string {
	const rateLimited = () => t('Too many requests. Wait a moment and try again.')
	const quota = () => t('Not enough storage space.')
	const invalid = () => t('Some of the information is not valid.')
	const unauthorized = () => t('Your session has expired. Sign in again.')
	const forbidden = () => t("You don't have permission to do this.")
	const notFound = () => t('This item no longer exists.')

	if (typeof navigator !== 'undefined' && navigator.onLine === false) {
		return t('You appear to be offline. Check your connection and try again.')
	}
	// FetchError extends Error, not TypeError; a bare TypeError is fetch's network failure.
	if (
		(!(err instanceof FetchError) && err instanceof TypeError) ||
		err instanceof ConnectionError ||
		err instanceof TimeoutError
	) {
		return t("Couldn't reach the server. Check your connection and try again.")
	}
	if (err instanceof FetchError) {
		switch (err.apiErrorCode) {
			case 'E-FILE-QUOTA':
				return quota()
			case 'E-RATE-LIMITED':
			case 'E-RATE-BANNED':
				return rateLimited()
			case 'E-FILE-SRCUNREACH':
			case 'E-NET-TIMEOUT':
			case 'E-NET-ERROR':
				return t("Couldn't reach the other server. Try again later.")
			case 'E-VAL-INVALID':
				return invalid()
		}
		switch (err.httpStatus) {
			case 401:
				return unauthorized()
			case 403:
				return forbidden()
			case 404:
				return notFound()
			case 409:
				return t('This was changed in the meantime. Reload and try again.')
			case 413:
				return t('This is too large to upload.')
			case 429:
				return rateLimited()
			case 507:
				return quota()
		}
		if (err.httpStatus >= 500 && err.httpStatus <= 599) {
			return t('Something went wrong on the server. Try again later.')
		}
	}
	if (err instanceof AuthError) return unauthorized()
	if (err instanceof PermissionError) return forbidden()
	if (err instanceof NotFoundError) return notFound()
	if (err instanceof ValidationError) return invalid()
	return t('Something went wrong. Try again.')
}

export interface LoadErrorProps {
	error: unknown
	onRetry: () => void
	/** Defaults to "Couldn't load this"; name the thing, e.g. "Couldn't load files". */
	title?: React.ReactNode
}

/** A failed first load: render when `error && items.length === 0`, before the empty state. */
export function LoadError({ error, onRetry, title }: LoadErrorProps) {
	const { t } = useLibTranslation()
	return (
		<EmptyState
			color="error"
			title={title ?? t("Couldn't load this")}
			description={friendlyError(t, error)}
			actions={
				<Button immediate onClick={onRetry}>
					{t('Retry')}
				</Button>
			}
		/>
	)
}

// vim: ts=4
