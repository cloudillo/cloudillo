// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * F6 / Shift+F6 landmark cycling: toolbar, pages rail, document, right panel, status bar,
 * in DOM order of the `[data-landmark]` wrappers. Focus outside every landmark (the input
 * adapter, the frame key target) counts as the document.
 */

import * as React from 'react'

const FOCUSABLE = ['button', '[href]', 'input', 'select', 'textarea', '[tabindex]']
	.map((s) => `${s}:not([tabindex="-1"]):not([disabled])`)
	.join(',')

/** `focusDocument` focuses the text (editor input for writers, the a11y mirror for readers). */
export function useLandmarks(focusDocument: () => void): void {
	const focusDoc = React.useRef(focusDocument)
	focusDoc.current = focusDocument
	React.useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key !== 'F6' || e.ctrlKey || e.altKey || e.metaKey) return
			const marks = [...document.querySelectorAll<HTMLElement>('[data-landmark]')]
			if (!marks.length) return
			e.preventDefault()
			const a = document.activeElement
			let i = marks.findIndex((m) => a && m.contains(a))
			if (i < 0) i = marks.findIndex((m) => m.dataset.landmark === 'document')
			const n = marks.length
			for (let s = 1; s <= n; s++) {
				const m = marks[(((i + (e.shiftKey ? -s : s)) % n) + n) % n]
				if (m.dataset.landmark === 'document') {
					focusDoc.current()
					return
				}
				const f = m.querySelector<HTMLElement>(FOCUSABLE)
				if (f) {
					f.focus()
					return
				}
			}
		}
		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
	}, [])
}

// vim: ts=4
