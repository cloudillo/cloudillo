// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * EditContext input (Chromium): a focusable hidden element owns an `EditContext` used as a
 * scratch buffer — committed text goes to the sink and the buffer is emptied; during an IME
 * composition the buffer is the provisional text. Keys (Enter, Backspace, arrows) via keydown.
 */

import type { InputAdapter, InputSink } from './adapter'
import { hiddenInput, placeAt } from './textarea'

/** The part of the EditContext API used here (not in TypeScript's DOM lib yet). */
interface EditContextLike extends EventTarget {
	readonly text: string
	updateText(start: number, end: number, text: string): void
	updateSelection(start: number, end: number): void
	updateControlBounds(r: DOMRect): void
	updateSelectionBounds(r: DOMRect): void
	updateCharacterBounds(start: number, rects: DOMRect[]): void
}

const EditContextCtor = (globalThis as unknown as { EditContext?: new () => EditContextLike })
	.EditContext

export const hasEditContext = () => !!EditContextCtor

export function editContextAdapter(sink: InputSink, label: string): InputAdapter {
	if (!EditContextCtor) throw new Error('EditContext unavailable')
	const ec = new EditContextCtor()
	const el = hiddenInput(document.createElement('div'), label)
	el.tabIndex = -1
	el.setAttribute('role', 'textbox')
	;(el as unknown as { editContext: EditContextLike | null }).editContext = ec
	let composing = false
	let caret = new DOMRect()

	const clear = () => {
		ec.updateText(0, ec.text.length, '')
		ec.updateSelection(0, 0)
	}
	const onText = () => {
		if (composing) {
			sink.compose('update', ec.text)
			return
		}
		const t = ec.text
		clear()
		if (t) sink.insert(t)
	}
	const onStart = () => {
		composing = true
		sink.compose('start', '')
	}
	const onEnd = () => {
		composing = false
		const t = ec.text
		clear()
		sink.compose(t ? 'commit' : 'cancel', t)
	}
	const onBounds = (e: Event) => {
		const { rangeStart, rangeEnd } = e as unknown as { rangeStart: number; rangeEnd: number }
		ec.updateCharacterBounds(
			rangeStart,
			Array.from({ length: Math.max(0, rangeEnd - rangeStart) }, () => caret)
		)
	}
	const onKey = (e: KeyboardEvent) => {
		if (composing || e.isComposing) return
		if (sink.key(e)) e.preventDefault()
	}

	ec.addEventListener('textupdate', onText)
	ec.addEventListener('compositionstart', onStart)
	ec.addEventListener('compositionend', onEnd)
	ec.addEventListener('characterboundsupdate', onBounds)
	el.addEventListener('keydown', onKey)

	return {
		focus: () => el.focus({ preventScroll: true }),
		setCaretRect: (r) => {
			caret = r
			placeAt(el, r)
			ec.updateControlBounds(r)
			ec.updateSelectionBounds(r)
		},
		dispose: () => {
			ec.removeEventListener('textupdate', onText)
			ec.removeEventListener('compositionstart', onStart)
			ec.removeEventListener('compositionend', onEnd)
			ec.removeEventListener('characterboundsupdate', onBounds)
			el.removeEventListener('keydown', onKey)
			;(el as unknown as { editContext: EditContextLike | null }).editContext = null
			el.remove()
		}
	}
}

// vim: ts=4
