// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/** Command keys for keys `useEditor`'s own switch does not handle. */

import type { StyleMapKey } from '../crdt/stored-types'
import * as Cmd from './commands'
import type { Undo } from './undo'

export const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform)

/** Mod+Z → undo; Shift+Mod+Z, or Ctrl+Y off Mac → redo. */
export function undoRedoKey(e: KeyboardEvent): 'undo' | 'redo' | undefined {
	if (!(IS_MAC ? e.metaKey : e.ctrlKey) || e.altKey) return
	const k = e.key.toLowerCase()
	if (k === 'z') return e.shiftKey ? 'redo' : 'undo'
	if (k === 'y' && !IS_MAC) return 'redo'
}

export interface KeymapCtx extends Cmd.CommandCtx {
	undo: Undo
	/** Write access (and no read-only reason): editing keys apply. */
	canEdit: boolean
}

const HEADING_KEYS: Record<string, StyleMapKey> = {
	Digit0: 'p',
	Digit1: 'h1',
	Digit2: 'h2',
	Digit3: 'h3'
}

export function handleKey(e: KeyboardEvent, ctx: KeymapCtx): boolean {
	if (!ctx.canEdit) return false
	const ur = undoRedoKey(e)
	if (ur) {
		ctx.undo[ur]()
		return true
	}
	const mod = IS_MAC ? e.metaKey : e.ctrlKey
	if (mod && e.altKey && !e.getModifierState?.('AltGraph')) {
		const key = HEADING_KEYS[e.code]
		return key ? Cmd.applyStyleKey(ctx, key) : false
	}
	if (mod && !e.altKey) {
		switch (e.key.toLowerCase()) {
			case 'b':
				Cmd.toggleMark(ctx, 'bold')
				return true
			case 'i':
				Cmd.toggleMark(ctx, 'italic')
				return true
			case 'u':
				Cmd.toggleMark(ctx, 'underline')
				return true
		}
		return false
	}
	if (e.key === 'Tab' && !e.altKey && !e.ctrlKey && !e.metaKey) {
		if (Cmd.tableCellMove(ctx, e.shiftKey ? -1 : 1)) return true
		if (Cmd.indentList(ctx, e.shiftKey ? -1 : 1)) return true
		// Shift+Tab outside a list keeps the browser's focus move (keyboard escape from text).
		if (e.shiftKey) return false
		Cmd.insertTab(ctx)
		return true
	}
	return false
}

// vim: ts=4
