// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The Image tool hands control to the shell's MediaPicker and gets it back through
 * `onInsertComplete` - which is also how the tool is switched back to select. The effect that opens
 * the picker is keyed on `activeTool` alone, so a path that skips that callback leaves the tool
 * armed and inert: re-clicking the button sets the same tool, nothing changes, and no pointer
 * handler covers 'image' either.
 *
 * `getAppBus` is a singleton and cannot be module-mocked here (the `jest` global is not injected
 * under ESM), so `pickMedia` is patched on the real instance and restored afterwards.
 */

import { getAppBus } from '@cloudillo/core'
import { act, renderHook } from '@testing-library/react'
import * as Y from 'yjs'

import { getOrCreateDocument } from '../crdt/document.js'
import { useImageHandler } from '../hooks/useImageHandler.js'

type PickMedia = ReturnType<typeof getAppBus>['pickMedia']

function setup(pickMedia: PickMedia) {
	const bus = getAppBus()
	const realPickMedia = bus.pickMedia
	bus.pickMedia = pickMedia

	const yDoc = new Y.Doc()
	const doc = getOrCreateDocument(yDoc)
	let completed = 0
	const view = renderHook(() =>
		useImageHandler({
			yDoc,
			doc,
			enabled: true,
			onInsertComplete: () => {
				completed++
			}
		})
	)
	return {
		view,
		completed: () => completed,
		restore: () => {
			bus.pickMedia = realPickMedia
			view.unmount()
		}
	}
}

describe('useImageHandler', () => {
	it('hands the tool back when the picker throws', async () => {
		const fixture = setup((() => Promise.reject(new Error('picker exploded'))) as PickMedia)
		// The hook logs the failure; the assertion is about the callback, not the console
		const realError = console.error
		console.error = () => {}
		try {
			await act(async () => {
				await fixture.view.result.current.insertImage(0, 0)
			})
			expect(fixture.completed()).toBe(1)
		} finally {
			console.error = realError
			fixture.restore()
		}
	})

	it('hands the tool back when the picker is cancelled', async () => {
		const fixture = setup((() => Promise.resolve(undefined)) as PickMedia)
		try {
			await act(async () => {
				await fixture.view.result.current.insertImage(0, 0)
			})
			expect(fixture.completed()).toBe(1)
		} finally {
			fixture.restore()
		}
	})
})

// vim: ts=4
