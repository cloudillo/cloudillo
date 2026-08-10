// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { SearchMatch } from '@cloudillo/types'
import * as React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

import { Highlight } from '../components/Highlight/Highlight.js'

// `createElement` rather than JSX: the shared Jest base only matches `*.test.ts`.
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function render(text: string, matches?: SearchMatch[]): HTMLElement {
	const container = document.createElement('div')
	const root = createRoot(container)
	act(() => {
		root.render(React.createElement(Highlight, { text, matches }))
	})
	return container
}

/** The emphasised substrings, in document order. */
function marks(container: HTMLElement): string[] {
	return [...container.querySelectorAll('mark')].map((m) => m.textContent ?? '')
}

describe('Highlight', () => {
	it('renders plain text when there is nothing to emphasise', () => {
		for (const matches of [undefined, []]) {
			const container = render('nothing to see', matches)
			expect(container.textContent).toBe('nothing to see')
			expect(marks(container)).toEqual([])
		}
	})

	it('emphasises one range without disturbing the text around it', () => {
		const container = render('the quick fox', [{ start: 4, end: 9 }])
		expect(container.textContent).toBe('the quick fox')
		expect(marks(container)).toEqual(['quick'])
	})

	it('emphasises every range, not just the first', () => {
		const container = render('the quick brown fox', [
			{ start: 4, end: 9 },
			{ start: 16, end: 19 }
		])
		expect(container.textContent).toBe('the quick brown fox')
		expect(marks(container)).toEqual(['quick', 'fox'])
	})

	it('treats offsets as UTF-16 code units, the unit `slice` takes', () => {
		// The emoji is two UTF-16 units, so 'hit' starts at 3 — not 2 (code points)
		// and not 5 (UTF-8 bytes). Only astral-plane snippets expose the mistake.
		const container = render('😀 hit here', [{ start: 3, end: 6 }])
		expect(marks(container)).toEqual(['hit'])
	})

	it('clamps a range that runs past the end of the text', () => {
		expect(marks(render('abc', [{ start: 1, end: 99 }]))).toEqual(['bc'])
	})

	it('drops a range that lies entirely outside the text', () => {
		const container = render('abc', [{ start: 10, end: 20 }])
		expect(container.textContent).toBe('abc')
		expect(marks(container)).toEqual([])
	})

	it('normalises overlapping and out-of-order ranges instead of scrambling', () => {
		// The server emits ranges ascending and disjoint, but ranges and text arrive
		// as separate fields with nothing pairing them: a malformed pair must
		// degrade, never duplicate or drop text.
		const container = render('abcdefghij', [
			{ start: 3, end: 8 },
			{ start: 0, end: 5 }
		])
		expect(container.textContent).toBe('abcdefghij')
		expect(marks(container)).toEqual(['abcde', 'fgh'])
	})
})

// vim: ts=4
