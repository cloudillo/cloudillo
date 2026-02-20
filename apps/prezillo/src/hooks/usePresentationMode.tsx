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
	isFullscreenFollowing: boolean
	followedPresenter: PresenterInfo | null

	// Handlers
	handleStartPresenting: () => void
	handleStopPresenting: () => void
	handleExitFullscreenFollowing: () => void
}

export function usePresentationMode({
	prezillo,
	toast
}: UsePresentationModeOptions): UsePresentationModeResult {
	// Presentation mode state (local user is presenting in fullscreen)
	const [isPresentationMode, setIsPresentationMode] = React.useState(false)

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

	// Handle starting presentation (with fullscreen)
	const handleStartPresenting = React.useCallback(() => {
		prezillo.startPresenting()
		setIsPresentationMode(true)
	}, [prezillo.startPresenting])

	// Handle stopping presentation
	const handleStopPresenting = React.useCallback(() => {
		prezillo.stopPresenting()
		setIsPresentationMode(false)
	}, [prezillo.stopPresenting])

	return {
		isPresentationMode,
		isFullscreenFollowing,
		followedPresenter,
		handleStartPresenting,
		handleStopPresenting,
		handleExitFullscreenFollowing
	}
}

// vim: ts=4
