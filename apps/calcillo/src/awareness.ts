import { WorkbookInstance } from '@fortune-sheet/react'
// @ts-ignore - y-protocols types may not be available
import { Awareness } from 'y-protocols/awareness'
import { str2color } from '@cloudillo/core'
import type { SheetId } from './yjs-types'
import {
	CURSOR_POLL_INTERVAL_MS,
	CURSOR_DEBOUNCE_DELAY_MS,
	CURSOR_THROTTLE_DELAY_MS
} from './constants'

export interface UserPresence {
	user: {
		name: string
		color: string
	}
	cursor?: {
		sheetId: SheetId
		row: number
		column: number
	}
}

/**
 * Initialize user presence
 */
export async function initAwareness(
	awareness: Awareness,
	userId: string,
	displayName?: string
): Promise<void> {
	awareness.setLocalStateField('user', {
		name: displayName || userId || 'Anonymous',
		color: await str2color(userId)
	})
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
	evt: { added: number[]; updated: number[]; removed: number[] }
): void {
	// Remove departed users
	if (evt.removed.length > 0) {
		workbook.removePresences(evt.removed.map((id) => ({ userId: String(id), username: '' })))
	}

	// Add/update active users
	if (evt.added.length + evt.updated.length > 0) {
		const states = awareness.getStates()
		const presences = [...evt.added, ...evt.updated]
			.map((id) => {
				const state = states.get(id) as UserPresence | undefined
				if (!state?.cursor) return null

				return {
					userId: String(id),
					username: state.user?.name || '',
					sheetId: state.cursor.sheetId,
					color: state.user?.color || '#ff0000',
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
	userId: string,
	displayName?: string
): () => void {
	// Initialize
	initAwareness(awareness, userId, displayName)

	// Listen to awareness changes
	const awarenessHandler = (evt: { added: number[]; updated: number[]; removed: number[] }) => {
		handleAwarenessChange(awareness, workbook, evt)
	}
	awareness.on('change', awarenessHandler)

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
