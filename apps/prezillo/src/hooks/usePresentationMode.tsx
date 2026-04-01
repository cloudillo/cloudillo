// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Hook for managing presentation mode state
 */

import * as React from 'react'
import type { ToastOptions } from '@cloudillo/react'
import type { PresenterInfo } from '../awareness'
import type { UsePrezilloDocumentResult } from './usePrezilloDocument'

export interface UsePresentationModeOptions {
	prezillo: UsePrezilloDocumentResult
	// Toast function for notifications
	toast: (options: ToastOptions) => string
}

export interface UsePresentationModeResult {
	// State
	isPresentationMode: boolean
	presentationFullscreen: boolean
	isFullscreenFollowing: boolean
	followedPresenter: PresenterInfo | null

	// Handlers
	handleStartPresenting: (fullscreen?: boolean) => void
	handleStopPresenting: () => void
	handleExitFullscreenFollowing: () => void
}

export function usePresentationMode({
	prezillo,
	toast
}: UsePresentationModeOptions): UsePresentationModeResult {
	// Presentation mode state (local user is presenting)
	const [isPresentationMode, setIsPresentationMode] = React.useState(false)
	const [presentationFullscreen, setPresentationFullscreen] = React.useState(false)

	// Fullscreen following mode (when following presenter in fullscreen)
	const [isFullscreenFollowing, setIsFullscreenFollowing] = React.useState(false)

	// Track previous presenters to detect new ones
	const prevPresentersRef = React.useRef<Set<number>>(new Set())

	// Show toast when a new presenter starts
	React.useEffect(() => {
		const currentIds = new Set(prezillo.activePresenters.map((p) => p.clientId))
		const prevIds = prevPresentersRef.current
		const localClientId = prezillo.awareness?.clientID

		// Find new presenters (excluding local client)
		for (const presenter of prezillo.activePresenters) {
			if (!prevIds.has(presenter.clientId) && presenter.clientId !== localClientId) {
				toast({
					variant: 'info',
					title: `${presenter.user.name} started presenting`,
					duration: 4000,
					actions: (
						<button
							className="c-button primary small"
							onClick={() => prezillo.followPresenter(presenter.clientId)}
						>
							Follow
						</button>
					)
				})
			}
		}

		prevPresentersRef.current = currentIds
	}, [prezillo.activePresenters, prezillo.awareness?.clientID, prezillo.followPresenter, toast])

	// Get presenter being followed
	const followedPresenter = React.useMemo(() => {
		if (!prezillo.followingClientId) return null
		return (
			prezillo.activePresenters.find((p) => p.clientId === prezillo.followingClientId) ?? null
		)
	}, [prezillo.followingClientId, prezillo.activePresenters])

	// Auto-enter fullscreen when starting to follow
	React.useEffect(() => {
		if (prezillo.followingClientId && !isFullscreenFollowing) {
			setIsFullscreenFollowing(true)
		} else if (!prezillo.followingClientId && isFullscreenFollowing) {
			setIsFullscreenFollowing(false)
		}
	}, [prezillo.followingClientId, isFullscreenFollowing])

	// Handle exiting fullscreen following mode
	const handleExitFullscreenFollowing = React.useCallback(() => {
		setIsFullscreenFollowing(false)
		prezillo.unfollowPresenter()
	}, [prezillo.unfollowPresenter])

	// Handle starting presentation (windowed by default, fullscreen optional)
	const handleStartPresenting = React.useCallback(
		(fullscreen?: boolean) => {
			prezillo.startPresenting()
			setPresentationFullscreen(fullscreen ?? false)
			setIsPresentationMode(true)
		},
		[prezillo.startPresenting]
	)

	// Handle stopping presentation
	const handleStopPresenting = React.useCallback(() => {
		prezillo.stopPresenting()
		setIsPresentationMode(false)
		setPresentationFullscreen(false)
	}, [prezillo.stopPresenting])

	return {
		isPresentationMode,
		presentationFullscreen,
		isFullscreenFollowing,
		followedPresenter,
		handleStartPresenting,
		handleStopPresenting,
		handleExitFullscreenFollowing
	}
}

// vim: ts=4
