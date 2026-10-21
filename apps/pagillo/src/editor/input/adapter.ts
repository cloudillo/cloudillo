// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * The one input adapter interface. EditContext where the browser has it (Chromium), otherwise
 * the hidden-textarea baseline; readers get a focus target for key commands only (no input).
 */

import { editContextAdapter, hasEditContext } from './edit-context'
import { hiddenInput, textareaAdapter } from './textarea'

export type ComposePhase = 'start' | 'update' | 'commit' | 'cancel'

/** Implemented by the editor; adapters drive it. */
export interface InputSink {
	/** Typed text; '\n' = paragraph break. Replaces the selection. */
	insert(text: string): void
	delete(dir: -1 | 1, unit: 'char' | 'word'): void
	/** IME composition: `update` carries the whole provisional text, `commit` the final text. */
	compose(phase: ComposePhase, text: string): void
	/** Key commands (navigation, Enter, Backspace, …); true = handled, default prevented. */
	key(e: KeyboardEvent): boolean
}

export interface InputAdapter {
	focus(): void
	/** Caret box in client px: where the IME window opens. */
	setCaretRect(r: DOMRect): void
	dispose(): void
}

export function createInputAdapter(
	sink: InputSink,
	{ label, editable }: { label: string; editable: boolean }
): InputAdapter {
	if (editable)
		return hasEditContext() ? editContextAdapter(sink, label) : textareaAdapter(sink, label)
	const el = hiddenInput(document.createElement('div'), label)
	el.tabIndex = -1
	const onKey = (e: KeyboardEvent) => {
		if (sink.key(e)) e.preventDefault()
	}
	el.addEventListener('keydown', onKey)
	return {
		focus: () => el.focus({ preventScroll: true }),
		setCaretRect: () => {},
		dispose: () => {
			el.removeEventListener('keydown', onKey)
			el.remove()
		}
	}
}

// vim: ts=4
