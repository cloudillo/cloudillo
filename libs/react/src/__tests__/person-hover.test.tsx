// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * `PersonHover`: a card after a hover on mouse devices (the child's click
 * untouched), a sheet on tap on touch devices, and actions that go to
 * `PersonActionsContext`.
 */

import { jest } from '@jest/globals'
import { act, fireEvent, render, screen } from '@testing-library/react'
import * as React from 'react'

/**
 * Stand in for `@cloudillo/core`, built from its submodules — re-importing the
 * package index inside this factory hands back the mock and recurses. Covers
 * `getAppBus`, `delay` (Button), `getFileUrl`/`idHue` (avatars), `createApiClient`
 * (the profile cache).
 */
jest.unstable_mockModule('@cloudillo/core', async () => {
	const urls = await import('../../../core/lib/urls.js')
	const utils = await import('../../../core/lib/utils.js')
	// `ProfilePicture` -> `hooks.tsx` -> `@cloudillo/crdt` reach these.
	const apiRegistry = await import('../../../core/lib/api-registry.js')
	const fileUtils = await import('../../../core/lib/file-utils.js')
	const presence = await import('../../../core/lib/presence.js')
	return {
		...urls,
		...utils,
		...apiRegistry,
		...fileUtils,
		...presence,
		docBaseName: () => undefined,
		getAppBus: () => ({ idTag: 'node.example', ownerTag: undefined, accessToken: undefined }),
		createApiClient: () => ({
			profiles: {
				getBatch: async (idTags: string[]) =>
					idTags
						.filter((t) => t === '@ada.example')
						.map((idTag) => ({ idTag, name: 'Ada Lovelace' }))
			}
		})
	}
})

const { PersonHover } = await import('../components/Person/PersonHover.js')
const { PersonActionsContext } = await import('../components/Person/PersonActionsContext.js')
const { resetProfileCache } = await import('../profile-cache.js')

/** `(hover: hover)` matches only on a mouse device; everything else is false. */
function stubMedia(canHover: boolean) {
	window.matchMedia = ((query: string) => ({
		matches: canHover && query === '(hover: hover)',
		media: query,
		addEventListener() {},
		removeEventListener() {}
	})) as unknown as typeof window.matchMedia
}

const actions = {
	node: { tag: 'node.example' },
	openProfile: jest.fn<(idTag: string) => void>(),
	message: jest.fn<(idTag: string) => void>(),
	more: jest.fn<(idTag: string, anchor: HTMLElement) => void>()
}
const childClick = jest.fn()

function renderHover(props: { tapOpens?: boolean } = {}) {
	render(
		<PersonActionsContext.Provider value={actions}>
			<PersonHover idTag="@ada.example" {...props}>
				<a href="/profile/ada" onClick={() => childClick()}>
					avatar
				</a>
			</PersonHover>
		</PersonActionsContext.Provider>
	)
	return screen.getByText('avatar')
}

const card = () => document.body.querySelector('.c-popper')

describe('PersonHover', () => {
	beforeEach(() => {
		resetProfileCache()
		actions.openProfile.mockClear()
		actions.message.mockClear()
		actions.more.mockClear()
		childClick.mockClear()
	})

	afterEach(() => {
		jest.useRealTimers()
		;(window as { matchMedia?: unknown }).matchMedia = undefined
	})

	describe('on a hover-capable device', () => {
		beforeEach(() => {
			stubMedia(true)
			jest.useFakeTimers()
		})

		it('opens the card after the hover delay', async () => {
			const trigger = renderHover()

			fireEvent.mouseEnter(trigger)
			act(() => {
				jest.advanceTimersByTime(399)
			})
			expect(card()).toBeNull()

			act(() => {
				jest.advanceTimersByTime(1)
			})
			expect(card()).not.toBeNull()
			await act(async () => {})
			expect(card()?.textContent).toContain('Ada Lovelace')
		})

		it('leaves the child’s click alone', () => {
			const trigger = renderHover()
			fireEvent.click(trigger)
			expect(childClick).toHaveBeenCalledTimes(1)
			expect(card()).toBeNull()
		})

		it('runs the context’s actions and closes', () => {
			const trigger = renderHover()
			fireEvent.mouseEnter(trigger)
			act(() => {
				jest.advanceTimersByTime(400)
			})

			fireEvent.click(screen.getByRole('button', { name: 'Open profile' }))
			expect(actions.openProfile).toHaveBeenCalledWith('@ada.example')
			expect(card()).toBeNull()

			fireEvent.mouseEnter(trigger)
			act(() => {
				jest.advanceTimersByTime(400)
			})
			fireEvent.click(screen.getByRole('button', { name: 'Message' }))
			expect(actions.message).toHaveBeenCalledWith('@ada.example')

			fireEvent.mouseEnter(trigger)
			act(() => {
				jest.advanceTimersByTime(400)
			})
			fireEvent.click(screen.getByRole('button', { name: 'More' }))
			expect(actions.more).toHaveBeenCalledWith('@ada.example', trigger)
		})
	})

	describe('on a touch device', () => {
		beforeEach(() => {
			stubMedia(false)
		})

		it('turns the tap into a sheet instead of the child’s click', async () => {
			const trigger = renderHover()

			fireEvent.click(trigger)
			expect(childClick).not.toHaveBeenCalled()

			fireEvent.click(await screen.findByText('Open profile'))
			expect(actions.openProfile).toHaveBeenCalledWith('@ada.example')
		})

		it('leaves the click alone with tapOpens={false}', () => {
			const trigger = renderHover({ tapOpens: false })

			fireEvent.click(trigger)
			expect(childClick).toHaveBeenCalledTimes(1)
			expect(screen.queryByText('Open profile')).toBeNull()
		})
	})
})

// vim: ts=4
