// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * App Loading Indicator Component
 *
 * A UX-optimized loading indicator for microfrontend apps that:
 * - Shows after a 300ms delay (fast loads show nothing)
 * - Displays loading stage text
 * - Fades out smoothly when ready
 * - Shows error state with retry button
 * - Respects reduced motion preferences
 */

import { Button, EmptyState, LoadingSpinner, mergeClasses, VBox } from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuCircleAlert as IcError } from 'react-icons/lu'

export type LoadingStage = 'connecting' | 'syncing' | 'ready' | 'error'

interface AppLoadingIndicatorProps {
	/** Current loading stage */
	stage: LoadingStage
	/** Callback when retry button is clicked (only shown in error state) */
	onRetry?: () => void
	/** Custom error message (fallback text) */
	errorMessage?: string
	/** Error code from CRDT/backend (used for localized error messages) */
	errorCode?: number
	/** Overlay a mounted document without hiding it — a small corner spinner, not a full box. */
	subtle?: boolean
}

// Delay before showing the loading indicator (300ms per UX best practices)
const SHOW_DELAY_MS = 300
// Must match `transition: opacity 200ms` on `.c-app-loading` in shell/src/ui/app-shell.css
const FADE_MS = 200

function getErrorText(
	code: number | undefined,
	fallback: string | undefined,
	t: ReturnType<typeof useTranslation>['t']
): string {
	switch (code) {
		case 4401:
			return t('Authentication failed')
		case 4403:
			return t('Access denied')
		case 4404:
			return t('Document not found')
		default:
			return fallback || t('app.loading.error', 'Failed to load app')
	}
}

/**
 * App loading indicator with progressive stages and error handling
 */
export function AppLoadingIndicator({
	stage,
	onRetry,
	errorMessage,
	errorCode,
	subtle
}: AppLoadingIndicatorProps) {
	const { t } = useTranslation()
	const [visible, setVisible] = React.useState(false)
	const [fadingOut, setFadingOut] = React.useState(false)

	// Delay showing the indicator for fast loads
	React.useEffect(() => {
		if (stage === 'ready') {
			// Fade out if currently visible
			if (!visible) return
			setFadingOut(true)
			const timer = setTimeout(() => {
				setVisible(false)
				setFadingOut(false)
			}, FADE_MS)
			return () => clearTimeout(timer)
		}

		// A stage leaving 'ready' — the app reports `notifyReady('auth')` and only then
		// fails — aborts the fade timer above via this effect's own cleanup, so the reset
		// has to happen here too. Without it the overlay stays mounted at opacity 0 and
		// the reader gets a blank box instead of the error.
		setFadingOut(false)

		// Show after delay for non-ready states
		const timer = setTimeout(() => {
			setVisible(true)
		}, SHOW_DELAY_MS)

		return () => clearTimeout(timer)
	}, [stage, visible])

	// Don't render anything if not visible
	if (!visible) return null

	// Get stage text
	const getStageText = () => {
		switch (stage) {
			case 'connecting':
				return t('app.loading.connecting', 'Connecting...')
			case 'syncing':
				return t('app.loading.syncing', 'Syncing...')
			case 'error':
				return getErrorText(errorCode, errorMessage, t)
			case 'ready':
				return null
		}
	}

	const stageText = getStageText()
	const isError = stage === 'error'
	// An error is never a corner hint: it keeps the full box even in subtle mode.
	const isSubtle = !!subtle && !isError

	return (
		<VBox
			// A live region whose role is swapped on a MOUNTED node is not reliably
			// re-registered, so the error would go unannounced. A changing key remounts it as
			// a fresh region. The loading states need no role here: LoadingSpinner is itself
			// `role="status"`, labelled with the stage text.
			key={isError ? 'error' : 'status'}
			className={mergeClasses(
				'c-app-loading pos-absolute z-2',
				isSubtle
					? 'c-app-loading--subtle top-0 right-0 p-1 m-1'
					: 'top-0 left-0 right-0 bottom-0',
				fadingOut && 'c-app-loading--fade-out'
			)}
			role={isError ? 'alert' : undefined}
		>
			{isError ? (
				<EmptyState
					fill
					color="error"
					icon={<IcError />}
					title={stageText}
					actions={
						onRetry && (
							<Button onClick={onRetry}>{t('app.loading.retry', 'Retry')}</Button>
						)
					}
				/>
			) : (
				<LoadingSpinner
					fill={!isSubtle}
					size={isSubtle ? 'sm' : 'xl'}
					label={stageText ?? undefined}
				/>
			)}
		</VBox>
	)
}

// vim: ts=4
