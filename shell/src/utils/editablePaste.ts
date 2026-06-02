// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type React from 'react'
import type { useEditable } from 'use-editable'

type Editable = ReturnType<typeof useEditable>

/**
 * Paste handler for use-editable contentEditable composers.
 *
 * Works around a use-editable bug: its native paste handler inserts via a DOM Range
 * walked from `editor.firstChild`, which is null on an *empty* editor, so paste silently
 * no-ops until the user has typed at least one character. We take over ONLY that empty
 * case and push the pasted text through `edit.update()` (the React-state path), which
 * works even on an empty editor.
 *
 * For a non-empty editor the native handler already works correctly — including replacing
 * the current selection — so we let it run: we return without stopping the event, and the
 * library's element-level bubble `paste` listener handles it. Re-implementing selection
 * replacement against `update()`'s length-delta caret math is fragile, so we don't.
 *
 * This must be attached as `onPasteCapture`: it runs in the React-root capture phase,
 * before use-editable's native bubble listener. In the empty case we take over,
 * `stopImmediatePropagation` on the native event prevents that listener from also firing
 * and double-inserting.
 */
export function handleEditablePaste(e: React.ClipboardEvent, edit: Editable, content: string) {
	const pasted = e.clipboardData.getData('text/plain')
	if (!pasted) return

	// `getState()` reads the live DOM caret; it throws if there is no selection range.
	let text: string
	try {
		text = edit.getState().text
	} catch {
		// No selection range available — fall back to React state.
		text = content
	}

	// use-editable's `r()` always appends a trailing '\n', so an empty editor reads as ''
	// or '\n'. Only that empty case is broken in the library; delegate everything else.
	const isEmpty = text === '' || text === '\n'
	if (!isEmpty) return

	e.preventDefault()
	e.stopPropagation()
	e.nativeEvent.stopImmediatePropagation()

	// Empty editor: push the pasted text through the React-state path. Append the trailing
	// '\n' so use-editable's update() length-delta caret math lands the caret at the end of
	// the pasted text. Guard update() too: it also needs a selection range and would throw
	// without one (the case the old catch missed).
	try {
		edit.update(pasted + '\n')
	} catch {
		// No selection range even to update — nothing more we can safely do via the public API.
	}
}
