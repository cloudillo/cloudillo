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

export interface UsePresentationModeOptions {
	// From prezillo document
	activePresenters: PresenterInfo[]
	followingClientId: number | null
	localClientId: number | undefined
	startPresenting: () => void
	stopPresenting: () => void
	followPresenter: (clientId: number) => void
	unfollowPresenter: () => void
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
	activePresenters,
	followingClientId,
	localClientId,
	startPresenting,
	stopPresenting,
	followPresenter,
	unfollowPresenter,
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
		const currentIds = new Set(activePresenters.map((p) => p.clientId))
		const prevIds = prevPresentersRef.current

		// Find new presenters (excluding local client)
		for (const presenter of activePresenters) {
			if (!prevIds.has(presenter.clientId) && presenter.clientId !== localClientId) {
				toast({
					variant: 'info',
					title: `${presenter.user.name} started presenting`,
					duration: 4000,
					actions: (
						<button
							className="c-button primary small"
							onClick={() => followPresenter(presenter.clientId)}
						>
							Follow
						</button>
					)
				})
			}
		}

		prevPresentersRef.current = currentIds
	}, [activePresenters, localClientId, followPresenter, toast])

	// Get presenter being followed
	const followedPresenter = React.useMemo(() => {
		if (!followingClientId) return null
		return activePresenters.find((p) => p.clientId === followingClientId) ?? null
	}, [followingClientId, activePresenters])

	// Auto-enter fullscreen when starting to follow
	React.useEffect(() => {
		if (followingClientId && !isFullscreenFollowing) {
			setIsFullscreenFollowing(true)
		} else if (!followingClientId && isFullscreenFollowing) {
			setIsFullscreenFollowing(false)
		}
	}, [followingClientId, isFullscreenFollowing])

	// Handle exiting fullscreen following mode
	const handleExitFullscreenFollowing = React.useCallback(() => {
		setIsFullscreenFollowing(false)
		unfollowPresenter()
	}, [unfollowPresenter])

	// Handle starting presentation (with fullscreen)
	const handleStartPresenting = React.useCallback(() => {
		startPresenting()
		setIsPresentationMode(true)
	}, [startPresenting])

	// Handle stopping presentation
	const handleStopPresenting = React.useCallback(() => {
		stopPresenting()
		setIsPresentationMode(false)
	}, [stopPresenting])

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
