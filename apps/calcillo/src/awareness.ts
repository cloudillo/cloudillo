// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { idAccent } from '@cloudillo/core'
import { initPresence, type PresenceSource } from '@cloudillo/crdt'
import type { WorkbookInstance } from '@fortune-sheet/react'
// @ts-expect-error - y-protocols types may not be available
import type { Awareness } from 'y-protocols/awareness'

import {
	CURSOR_DEBOUNCE_DELAY_MS,
	CURSOR_POLL_INTERVAL_MS,
	CURSOR_THROTTLE_DELAY_MS
} from './constants'
import type { SheetId } from './yjs-types'

export interface UserPresence {
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
	cursor?: {
		sheetId: SheetId
		row: number
		column: number
	}
}

/**
 * The colour to draw a collaborator's cursor and selection in.
 *
 * Derived by the VIEWER from the peer's idTag rather than read off the wire, so
 * a peer cannot assert an arbitrary colour; and the idTag it derives from is
 * stamped by the `/ws/crdt` relay from the sender's own token (see
 * `cloudillo-rs/crates/cloudillo-crdt/src/websocket.rs`). FortuneSheet wants a
 * literal colour string, so the `.c-id-color` CSS route is not available here;
 * the caller passes the theme, because a hidden bus read cannot appear in a
 * memo's prop comparison or a `useEffect` dep array.
 */
export function presenceColor(idTag: string | undefined, clientId: number, dark: boolean): string {
	return idAccent(idTag ?? String(clientId), dark)
}

/**
 * Initialize user presence
 *
 * `authenticated` is a parameter, not a `getAppBus()` read: `idTag` is the
 * document owner's for a share-link guest, so publishing on it alone would put
 * the owner's name and face on every visitor — and a hidden input cannot appear
 * in the caller's React dep array, which is how it went stale in the first place.
 */
export function initAwareness(awareness: Awareness, user: PresenceSource): void {
	initPresence(awareness, user)
}

/**
 * Update cursor position
 */
export function updateCursorPosition(awareness: Awareness, workbook: WorkbookInstance): void {
	const selection = workbook.getSelection()
	const sheet = workbook.getSheet()

	if (!selection?.[0]) return

	awareness.setLocalStateField('cursor', {
		sheetId: sheet.id,
		row: selection[0].row[0],
		column: selection[0].column[0]
	})
}

/**
 * Handle awareness changes
 */
export function handleAwarenessChange(
	awareness: Awareness,
	workbook: WorkbookInstance,
	evt: { added: number[]; updated: number[]; removed: number[] },
	dark: boolean
): void {
	// Remove departed users (exclude local client)
	const removed = evt.removed.filter((id) => id !== awareness.clientID)
	if (removed.length > 0) {
		workbook.removePresences(removed.map((id) => ({ userId: String(id), username: '' })))
	}

	// Add/update active users (exclude local client)
	if (evt.added.length + evt.updated.length > 0) {
		const states = awareness.getStates()
		const presences = [...evt.added, ...evt.updated]
			.filter((id) => id !== awareness.clientID)
			.map((id) => {
				const state = states.get(id) as UserPresence | undefined
				if (!state?.cursor) return null

				return {
					userId: String(id),
					username: state.user?.name || '',
					sheetId: state.cursor.sheetId,
					color: presenceColor(state.user?.idTag, id, dark),
					selection: {
						r: state.cursor.row,
						c: state.cursor.column
					}
				}
			})
			.filter((p): p is NonNullable<typeof p> => p !== null)

		if (presences.length > 0) {
			workbook.addPresences(presences)
		}
	}
}

/**
 * Debounced cursor update to prevent flooding the network
 * Only updates after cursor movement stops for CURSOR_DEBOUNCE_DELAY_MS
 */

function createDebouncedCursorUpdate(
	awareness: Awareness,
	workbook: WorkbookInstance
): {
	update: () => void
	cancel: () => void
} {
	let debounceTimeoutId: number | null = null
	let throttleTimeoutId: number | null = null
	let lastUpdateTime = 0

	const update = () => {
		// Clear debounce timer
		if (debounceTimeoutId !== null) {
			clearTimeout(debounceTimeoutId)
			debounceTimeoutId = null
		}

		const now = Date.now()
		const timeSinceLastUpdate = now - lastUpdateTime

		// If enough time has passed, update immediately (throttle)
		if (timeSinceLastUpdate >= CURSOR_THROTTLE_DELAY_MS) {
			updateCursorPosition(awareness, workbook)
			lastUpdateTime = now
			return
		}

		// Otherwise, debounce the update
		debounceTimeoutId = window.setTimeout(() => {
			updateCursorPosition(awareness, workbook)
			lastUpdateTime = Date.now()
			debounceTimeoutId = null
		}, CURSOR_DEBOUNCE_DELAY_MS)
	}

	const cancel = () => {
		if (debounceTimeoutId !== null) {
			clearTimeout(debounceTimeoutId)
			debounceTimeoutId = null
		}
		if (throttleTimeoutId !== null) {
			clearTimeout(throttleTimeoutId)
			throttleTimeoutId = null
		}
	}

	return { update, cancel }
}

/**
 * Setup awareness with optimized cursor tracking
 * Uses debouncing to prevent network flooding during rapid cursor movement
 */
export function setupAwareness(
	awareness: Awareness,
	workbook: WorkbookInstance,
	user: PresenceSource,
	dark: boolean
): () => void {
	// Initialize
	initAwareness(awareness, user)

	// Listen to awareness changes
	const awarenessHandler = (evt: { added: number[]; updated: number[]; removed: number[] }) => {
		handleAwarenessChange(awareness, workbook, evt, dark)
	}
	awareness.on('change', awarenessHandler)

	// Seed from the current roster: FortuneSheet only learns about a peer through
	// `addPresences`, and a peer that was already here fires no `change` event.
	// This is also what re-colours everyone when the effect re-runs on a theme flip.
	const present = [...awareness.getStates().keys()].filter((id) => id !== awareness.clientID)
	handleAwarenessChange(awareness, workbook, { added: present, updated: [], removed: [] }, dark)

	// Create debounced cursor updater
	const debouncedUpdate = createDebouncedCursorUpdate(awareness, workbook)

	// Poll for cursor updates, but trigger debounced update
	// TODO: Replace with FortuneSheet event hooks when available
	let prevState: { sheetId: string; row: number; column: number } | null = null
	const pollInterval = setInterval(() => {
		const selection = workbook.getSelection()
		const sheet = workbook.getSheet()

		if (!selection?.[0]) return

		const current = {
			sheetId: sheet.id,
			row: selection[0].row[0],
			column: selection[0].column[0]
		}

		if (
			!prevState ||
			prevState.sheetId !== current.sheetId ||
			prevState.row !== current.row ||
			prevState.column !== current.column
		) {
			// Trigger debounced update instead of immediate update
			debouncedUpdate.update()
			prevState = { ...current, sheetId: current.sheetId || '' }
		}
	}, CURSOR_POLL_INTERVAL_MS)

	// Cleanup
	return () => {
		awareness.off('change', awarenessHandler)
		clearInterval(pollInterval)
		debouncedUpdate.cancel()
	}
}

// vim: ts=4
