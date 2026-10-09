// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * `DocViewEmbed` / `ViewEmbed` status handling: which placeholder a request outcome shows, the
 * boot-stall overlay, Retry, and the actions the chrome and placeholders hand back to the host.
 */

import { PROTOCOL_VERSION } from '@cloudillo/core'
import { jest } from '@jest/globals'
import { act, fireEvent, render, screen } from '@testing-library/react'
import * as React from 'react'

import type { DocumentEmbedState } from '../components/DocumentEmbed/useDocumentEmbed.js'

/** What the mocked request hook answers; swap per test */
let embedState: DocumentEmbedState = { status: 'loading' }
/** How many times the request hook mounted (a Retry remounts it) */
let mounts = 0

jest.unstable_mockModule('../components/DocumentEmbed/useDocumentEmbed.js', () => ({
	embedErrorReason: () => undefined,
	useDocumentEmbed: () => {
		React.useEffect(() => {
			mounts++
		}, [])
		return embedState
	}
}))

const { DocViewEmbed, EMBED_BOOT_TIMEOUT, ViewEmbed } = await import(
	'../components/ViewEmbed/ViewEmbed.js'
)

// jsdom has none; the frame only needs it to exist
globalThis.ResizeObserver ??= class {
	observe() {}
	unobserve() {}
	disconnect() {}
}

const STALLED = "This embed couldn't be loaded"
const settings = { sizing: 'fit-width' as const }

function renderDoc() {
	return render(
		<DocViewEmbed
			fileId="f2"
			contentType="cloudillo/taskillo"
			sourceFileId="f1"
			settings={settings}
			canInteract={false}
		/>
	)
}

function iframe(container: HTMLElement) {
	const el = container.querySelector('iframe')
	if (!el) throw new Error('no iframe')
	return el
}

/** Send a message from inside the embedded iframe, as the child's bus would */
function fromChild(el: HTMLIFrameElement, type: string, payload: unknown) {
	act(() => {
		window.dispatchEvent(
			new MessageEvent('message', {
				source: el.contentWindow,
				data: { cloudillo: true, v: PROTOCOL_VERSION, type, payload }
			})
		)
	})
}

/** A click on a `Button`, which fires `onClick` only after its press delay */
async function press(el: HTMLElement) {
	fireEvent.click(el)
	await act(() => jest.advanceTimersByTimeAsync(300))
}

beforeEach(() => {
	jest.useFakeTimers()
	embedState = { status: 'loading' }
	mounts = 0
})

afterEach(() => {
	jest.useRealTimers()
})

describe('DocViewEmbed', () => {
	it('shows the nested placeholder for a nested refusal, the error one otherwise', () => {
		embedState = { status: 'error', error: 'x', reason: 'nested' }
		const { unmount } = renderDoc()
		expect(screen.getByText('This embed is nested too deeply or embeds itself')).toBeTruthy()
		unmount()

		embedState = { status: 'error', error: 'x' }
		renderDoc()
		expect(screen.getByText(STALLED)).toBeTruthy()
	})

	it('shows the stall overlay when a loaded app stays silent', () => {
		embedState = { status: 'ready', iframeSrc: 'about:blank#h:f2:_embed:n1' }
		const { container } = renderDoc()
		fireEvent.load(iframe(container))
		expect(screen.queryByText(STALLED)).toBeNull()

		act(() => jest.advanceTimersByTime(EMBED_BOOT_TIMEOUT))
		expect(screen.getByText(STALLED)).toBeTruthy()
	})

	// Taskillo & co. never report past 'auth'
	it("counts an 'auth' ready as settled", () => {
		embedState = { status: 'ready', iframeSrc: 'about:blank#h:f2:_embed:n1' }
		const { container } = renderDoc()
		const el = iframe(container)
		fireEvent.load(el)
		fromChild(el, 'app:ready.notify', { stage: 'auth' })

		act(() => jest.advanceTimersByTime(EMBED_BOOT_TIMEOUT))
		expect(screen.queryByText(STALLED)).toBeNull()
	})

	it('re-requests the embed on Retry', async () => {
		embedState = { status: 'error', error: 'x' }
		renderDoc()
		expect(mounts).toBe(1)

		await press(screen.getByText('Retry'))
		expect(mounts).toBe(2)
	})
})

describe('ViewEmbed', () => {
	it('offers "Load anyway" for an untrusted source', async () => {
		const onLoadAnyway = jest.fn()
		render(
			<ViewEmbed
				status="untrusted"
				settings={settings}
				canInteract={false}
				onLoadAnyway={onLoadAnyway}
			/>
		)
		await press(screen.getByText('Load anyway'))
		expect(onLoadAnyway).toHaveBeenCalled()
	})

	it('hands the "Allow editing" toggle to the host', async () => {
		const onEditableChange = jest.fn()
		render(
			<ViewEmbed
				status="live"
				src="about:blank#h:f2:_embed:n1"
				settings={settings}
				canInteract={false}
				actions={{ editable: false, onEditableChange }}
			/>
		)
		await press(screen.getByLabelText('Embed options'))
		fireEvent.click(screen.getByText('Allow editing'))
		expect(onEditableChange).toHaveBeenCalledWith(true)
	})
})

// vim: ts=4
