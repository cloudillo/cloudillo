// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as Y from 'yjs'

import { deltaOf, storyTextOf } from '../crdt/delta-cache.js'

function story(text: string): Y.Text {
	const t = new Y.Doc().getText('t')
	t.insert(0, text)
	return t
}

describe('deltaOf', () => {
	it('returns the same array (and text) twice without edits', () => {
		const t = story('ab\n')
		expect(deltaOf(t)).toBe(deltaOf(t))
		expect(storyTextOf(t)).toBe('ab\n')
	})

	it('is invalidated by a transaction that changes the text', () => {
		const t = story('ab\n')
		const before = deltaOf(t)
		t.doc?.transact(() => t.insert(2, 'c'))
		expect(deltaOf(t)).not.toBe(before)
		expect(storyTextOf(t)).toBe('abc\n')
	})

	it('reads fresh content inside a transaction after a write', () => {
		const t = story('ab\n')
		t.doc?.transact(() => {
			expect(storyTextOf(t)).toBe('ab\n')
			t.insert(0, 'x')
			expect(storyTextOf(t)).toBe('xab\n')
		})
		expect(storyTextOf(t)).toBe('xab\n')
	})
})

// vim: ts=4
