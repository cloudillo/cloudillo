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
 * Awareness/presence types and helpers for Prezillo
 *
 * Used for broadcasting temporary editing states (drag/resize) to other clients
 * without creating CRDT history entries.
 */

import type { Awareness } from 'y-protocols/awareness'
import type { ViewId } from './crdt/index.js'

export interface PrezilloPresence {
	user: {
		name: string
		color: string
	}
	// Temporary editing state (not persisted to CRDT)
	editing?: {
		objectId: string
		action: 'drag' | 'resize' | 'rotate'
		x: number
		y: number
		width?: number
		height?: number
		rotation?: number
	}
	// Presentation state - broadcasted when user is presenting
	presenting?: {
		viewId: ViewId
		viewIndex: number
		isOwner: boolean
		startedAt: number // timestamp for ordering multiple presenters
	}
	// Following state - broadcasted when user is following a presentation
	following?: {
		presenterClientId: number // Client ID of the presenter being followed
		startedAt: number
	}
	// Poll vote state - broadcasted when user votes on a poll frame
	vote?: {
		frameId: string // ObjectId of the poll frame
		viewId: string // ViewId where the vote was cast
		timestamp: number // For ordering/display purposes
	}
}

/**
 * Presenter info with client ID for tracking who to follow
 */
export interface PresenterInfo {
	clientId: number
	user: {
		name: string
		color: string
	}
	viewId: ViewId
	viewIndex: number
	isOwner: boolean
	startedAt: number
}

/**
 * Set the local editing state (during drag/resize/rotate)
 */
export function setEditingState(
	awareness: Awareness,
	objectId: string,
	action: 'drag' | 'resize' | 'rotate',
	x: number,
	y: number,
	width?: number,
	height?: number,
	rotation?: number
): void {
	awareness.setLocalStateField('editing', {
		objectId,
		action,
		x,
		y,
		width,
		height,
		rotation
	})
}

/**
 * Clear the local editing state (when drag/resize ends)
 */
export function clearEditingState(awareness: Awareness): void {
	awareness.setLocalStateField('editing', undefined)
}

/**
 * Get all remote clients' presence states (excluding local client)
 */
export function getRemotePresenceStates(awareness: Awareness): Map<number, PrezilloPresence> {
	const states = awareness.getStates()
	const localClientId = awareness.clientID
	const result = new Map<number, PrezilloPresence>()

	states.forEach((state: { [x: string]: any } | null, clientId: number) => {
		if (clientId !== localClientId && state) {
			result.set(clientId, state as PrezilloPresence)
		}
	})

	return result
}

/**
 * Generate a consistent color from a string (user ID)
 */
export async function str2color(str: string): Promise<string> {
	const encoder = new TextEncoder()
	const data = encoder.encode(str)
	const hashBuffer = await crypto.subtle.digest('SHA-256', data)
	const hashArray = new Uint8Array(hashBuffer)

	// Use first 3 bytes for RGB, but ensure colors are not too dark
	const r = Math.floor(hashArray[0] * 0.6 + 100)
	const g = Math.floor(hashArray[1] * 0.6 + 100)
	const b = Math.floor(hashArray[2] * 0.6 + 100)

	return `rgb(${r}, ${g}, ${b})`
}

/**
 * Start presenting - broadcast current view to other clients
 */
export function setPresenting(
	awareness: Awareness,
	viewId: ViewId,
	viewIndex: number,
	isOwner: boolean
): void {
	awareness.setLocalStateField('presenting', {
		viewId,
		viewIndex,
		isOwner,
		startedAt: Date.now()
	})
}

/**
 * Stop presenting
 */
export function clearPresenting(awareness: Awareness): void {
	awareness.setLocalStateField('presenting', undefined)
}

/**
 * Update the current view while presenting (when navigating slides)
 */
export function updatePresentingView(
	awareness: Awareness,
	viewId: ViewId,
	viewIndex: number
): void {
	const currentState = awareness.getLocalState()
	if (currentState?.presenting) {
		awareness.setLocalStateField('presenting', {
			...currentState.presenting,
			viewId,
			viewIndex
		})
	}
}

/**
 * Get all active presenters, sorted by owner first, then by startedAt
 */
export function getActivePresenters(awareness: Awareness): PresenterInfo[] {
	const states = awareness.getStates()
	const presenters: PresenterInfo[] = []

	states.forEach((state: any, clientId: number) => {
		if (state?.presenting && state?.user) {
			presenters.push({
				clientId,
				user: state.user,
				viewId: state.presenting.viewId,
				viewIndex: state.presenting.viewIndex,
				isOwner: state.presenting.isOwner,
				startedAt: state.presenting.startedAt
			})
		}
	})

	// Sort: owners first, then by startedAt (earliest first)
	return presenters.sort((a, b) => {
		if (a.isOwner !== b.isOwner) {
			return a.isOwner ? -1 : 1
		}
		return a.startedAt - b.startedAt
	})
}

/**
 * Check if the local client is currently presenting
 */
export function isLocalPresenting(awareness: Awareness): boolean {
	const state = awareness.getLocalState()
	return !!state?.presenting
}

/**
 * Start following a presenter
 */
export function setFollowing(awareness: Awareness, presenterClientId: number): void {
	awareness.setLocalStateField('following', {
		presenterClientId,
		startedAt: Date.now()
	})
}

/**
 * Stop following
 */
export function clearFollowing(awareness: Awareness): void {
	awareness.setLocalStateField('following', undefined)
}

/**
 * Check if the local client is currently following
 */
export function isLocalFollowing(awareness: Awareness): boolean {
	const state = awareness.getLocalState()
	return !!state?.following
}

/**
 * Get follower count for a specific presenter (by client ID)
 * Counts users who have `following.presenterClientId` matching the presenter
 */
export function getFollowerCount(awareness: Awareness, presenterClientId: number): number {
	const states = awareness.getStates()
	let count = 0

	states.forEach((state: any) => {
		if (state?.following?.presenterClientId === presenterClientId) {
			count++
		}
	})

	return count
}

/**
 * Get total follower count for the local presenter
 * Returns 0 if not presenting
 */
export function getLocalPresenterFollowerCount(awareness: Awareness): number {
	const localState = awareness.getLocalState()
	if (!localState?.presenting) return 0

	return getFollowerCount(awareness, awareness.clientID)
}

// ============================================================================
// Poll Voting Functions
// ============================================================================

/**
 * Cast a vote on a poll frame
 */
export function setVote(awareness: Awareness, frameId: string, viewId: string): void {
	awareness.setLocalStateField('vote', {
		frameId,
		viewId,
		timestamp: Date.now()
	})
}

/**
 * Clear current vote
 */
export function clearVote(awareness: Awareness): void {
	awareness.setLocalStateField('vote', undefined)
}

/**
 * Get the local client's current vote
 */
export function getLocalVote(awareness: Awareness): { frameId: string; viewId: string } | null {
	const state = awareness.getLocalState()
	return state?.vote ?? null
}

/**
 * Get all votes for a specific poll frame on a specific view
 */
export function getVotesForFrame(
	awareness: Awareness,
	frameId: string,
	viewId: string
): Array<{ clientId: number; user: { name: string; color: string } }> {
	const states = awareness.getStates()
	const votes: Array<{ clientId: number; user: { name: string; color: string } }> = []

	states.forEach((state: any, clientId: number) => {
		if (state?.vote?.frameId === frameId && state?.vote?.viewId === viewId && state?.user) {
			votes.push({
				clientId,
				user: state.user
			})
		}
	})

	return votes
}

/**
 * Get vote counts for all poll frames on a view
 */
export function getVoteCounts(awareness: Awareness, viewId: string): Map<string, number> {
	const states = awareness.getStates()
	const counts = new Map<string, number>()

	states.forEach((state: any) => {
		if (state?.vote?.viewId === viewId) {
			const frameId = state.vote.frameId
			counts.set(frameId, (counts.get(frameId) || 0) + 1)
		}
	})

	return counts
}

/**
 * Get the winning frame ID(s) for a view (may be multiple if tie)
 */
export function getWinningFrames(awareness: Awareness, viewId: string): string[] {
	const counts = getVoteCounts(awareness, viewId)
	let maxCount = 0
	let winners: string[] = []

	counts.forEach((count, frameId) => {
		if (count > maxCount) {
			maxCount = count
			winners = [frameId]
		} else if (count === maxCount && count > 0) {
			winners.push(frameId)
		}
	})

	return winners
}

/**
 * Get total number of votes across all poll frames on a view
 */
export function getTotalVotes(awareness: Awareness, viewId: string): number {
	const counts = getVoteCounts(awareness, viewId)
	let total = 0
	counts.forEach((count) => {
		total += count
	})
	return total
}

// vim: ts=4
