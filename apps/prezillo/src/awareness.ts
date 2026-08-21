// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Awareness/presence types and helpers for Prezillo
 *
 * Used for broadcasting temporary editing states (drag/resize) to other clients
 * without creating CRDT history entries.
 */

import { presenceColor } from '@cloudillo/core'
import type { Awareness } from 'y-protocols/awareness'

import type { ViewId } from './crdt/index.js'

/** Awareness state type - y-protocols getStates() returns untyped records */
type AwarenessState = Record<string, unknown>

export interface PrezilloPresence {
	/**
	 * What goes ON THE WIRE. No colour: the viewer derives it from `idTag` via
	 * {@link presenceColor}, and the relay stamps `idTag` itself from the sender's
	 * token — so a peer cannot assert someone else's identity.
	 */
	user: {
		name: string
		/** Absent for anonymous guests. */
		idTag?: string
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
		idTag?: string
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

	;(states as Map<number, AwarenessState | null>).forEach((state, clientId) => {
		if (clientId !== localClientId && state) {
			result.set(clientId, state as unknown as PrezilloPresence)
		}
	})

	return result
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

	;(states as Map<number, AwarenessState | null>).forEach((state, clientId) => {
		const s = state as PrezilloPresence | null
		if (s?.presenting && s?.user) {
			presenters.push({
				clientId,
				user: s.user,
				viewId: s.presenting.viewId,
				viewIndex: s.presenting.viewIndex,
				isOwner: s.presenting.isOwner,
				startedAt: s.presenting.startedAt
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
 * Get follower count for a specific presenter (by client ID)
 * Counts users who have `following.presenterClientId` matching the presenter
 */
export function getFollowerCount(awareness: Awareness, presenterClientId: number): number {
	const states = awareness.getStates()
	let count = 0

	;(states as Map<number, AwarenessState | null>).forEach((state) => {
		const s = state as PrezilloPresence | null
		if (s?.following?.presenterClientId === presenterClientId) {
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
 * Get vote counts for all poll frames on a view
 */
export function getVoteCounts(awareness: Awareness, viewId: string): Map<string, number> {
	const states = awareness.getStates()
	const counts = new Map<string, number>()

	;(states as Map<number, AwarenessState | null>).forEach((state) => {
		const s = state as PrezilloPresence | null
		if (s?.vote?.viewId === viewId) {
			const frameId = s.vote.frameId
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
