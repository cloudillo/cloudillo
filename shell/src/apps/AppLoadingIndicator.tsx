// This file is part of the Cloudillo Platform.
// Copyright (C) 2024  Szilárd Hajba
//
// Cloudillo is free software: you can redistribute it and/or modify
// it under the terms of the GNU Lesser General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Lesser General Public License for more details.
//
// You should have received a copy of the GNU Lesser General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

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

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuRefreshCw as IcLoading, LuCircleAlert as IcError } from 'react-icons/lu'
import { mergeClasses, Button } from '@cloudillo/react'

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
}

// Delay before showing the loading indicator (300ms per UX best practices)
const SHOW_DELAY_MS = 300

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
	errorCode
}: AppLoadingIndicatorProps) {
	const { t } = useTranslation()
	const [visible, setVisible] = React.useState(false)
	const [fadingOut, setFadingOut] = React.useState(false)

	// Delay showing the indicator for fast loads
	React.useEffect(() => {
		if (stage === 'ready') {
			// Fade out if currently visible
			if (visible) {
				setFadingOut(true)
				// Hide after fade animation completes
				const timer = setTimeout(() => {
					setVisible(false)
					setFadingOut(false)
				}, 200)
				return () => clearTimeout(timer)
			}
			return
		}

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

	return (
		<div
			className={mergeClasses(
				'c-app-loading pos-absolute top-0 left-0 right-0 bottom-0 d-flex flex-column align-items-center justify-content-center z-2',
				fadingOut && 'c-app-loading--fade-out'
			)}
			role="status"
			aria-live="polite"
		>
			{isError ? (
				<>
					<IcError
						size="3rem"
						className="c-app-loading__icon c-app-loading__icon--error mb-3"
					/>
					<p className="c-app-loading__text c-app-loading__text--error mb-4">
						{stageText}
					</p>
					{onRetry && (
						<Button onClick={onRetry} className="c-app-loading__retry">
							{t('app.loading.retry', 'Retry')}
						</Button>
					)}
				</>
			) : (
				<>
					<IcLoading
						size="3rem"
						className="c-app-loading__icon c-app-loading__icon--spinner mb-3"
					/>
					{stageText && <p className="c-app-loading__text">{stageText}</p>}
				</>
			)}
		</div>
	)
}

// vim: ts=4
