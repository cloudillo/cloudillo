// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * Baseline input: a transparent `<textarea>` kept at the caret so IME windows open there.
 * It stays empty — text goes to the sink via `beforeinput` / composition events.
 */

import type { InputAdapter, InputSink } from './adapter'

/** An invisible fixed-position element appended to `<body>`, moved by `placeAt`. */
export function hiddenInput<T extends HTMLElement>(el: T, label: string): T {
	el.setAttribute('aria-label', label)
	Object.assign(el.style, {
		position: 'fixed',
		left: '0',
		top: '0',
		width: '1px',
		height: '1em',
		padding: '0',
		border: '0',
		margin: '0',
		opacity: '0',
		resize: 'none',
		overflow: 'hidden',
		outline: 'none',
		whiteSpace: 'pre'
	})
	document.body.append(el)
	return el
}

export function placeAt(el: HTMLElement, r: DOMRect): void {
	el.style.left = `${r.left}px`
	el.style.top = `${r.top}px`
	el.style.height = `${Math.max(1, r.height)}px`
}

const DELETES: Record<string, [-1 | 1, 'char' | 'word']> = {
	deleteContentBackward: [-1, 'char'],
	deleteContentForward: [1, 'char'],
	deleteWordBackward: [-1, 'word'],
	deleteWordForward: [1, 'word']
}

export function textareaAdapter(sink: InputSink, label: string): InputAdapter {
	const ta = hiddenInput(document.createElement('textarea'), label)
	ta.spellcheck = false
	ta.setAttribute('autocomplete', 'off')
	ta.setAttribute('autocorrect', 'off')
	ta.setAttribute('autocapitalize', 'off')
	let composing = false

	const onKey = (e: KeyboardEvent) => {
		if (composing || e.isComposing || e.keyCode === 229) return
		if (sink.key(e)) e.preventDefault()
	}
	const onBefore = (e: InputEvent) => {
		if (composing || e.isComposing) return
		const del = DELETES[e.inputType]
		if (del) sink.delete(...del)
		else if (e.inputType === 'insertText') sink.insert(e.data ?? '')
		else if (e.inputType === 'insertLineBreak' || e.inputType === 'insertParagraph')
			sink.insert('\n')
		// Paste: `useClipboard`'s document listener; the textarea is emptied on `input`.
		else return
		e.preventDefault()
	}
	const onStart = () => {
		composing = true
		sink.compose('start', '')
	}
	const onUpdate = (e: CompositionEvent) => sink.compose('update', e.data)
	const onEnd = (e: CompositionEvent) => {
		composing = false
		sink.compose(e.data ? 'commit' : 'cancel', e.data)
		ta.value = ''
	}
	const onInput = () => {
		if (!composing) ta.value = ''
	}

	ta.addEventListener('keydown', onKey)
	ta.addEventListener('beforeinput', onBefore)
	ta.addEventListener('compositionstart', onStart)
	ta.addEventListener('compositionupdate', onUpdate)
	ta.addEventListener('compositionend', onEnd)
	ta.addEventListener('input', onInput)

	return {
		focus: () => ta.focus({ preventScroll: true }),
		setCaretRect: (r) => placeAt(ta, r),
		dispose: () => {
			ta.removeEventListener('keydown', onKey)
			ta.removeEventListener('beforeinput', onBefore)
			ta.removeEventListener('compositionstart', onStart)
			ta.removeEventListener('compositionupdate', onUpdate)
			ta.removeEventListener('compositionend', onEnd)
			ta.removeEventListener('input', onInput)
			ta.remove()
		}
	}
}

// vim: ts=4
