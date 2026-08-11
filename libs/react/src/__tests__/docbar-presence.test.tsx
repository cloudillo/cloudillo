// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { PresenceEntry } from '@cloudillo/core'
import { fireEvent, render, screen } from '@testing-library/react'
import * as React from 'react'

import { DocBarPresence } from '../components/DocBar/DocBarPresence.js'

const SIGNED_IN: PresenceEntry = {
	name: 'Szilárd Hajba',
	idTag: '@szilu.cloudillo.net',
	connId: '1',
	self: false,
	connections: 1,
	hue: 210
}

const GUEST: PresenceEntry = {
	name: 'Anon',
	connId: '2',
	self: false,
	connections: 1,
	hue: 40
}

/** The faces in the trigger stack, in roster order. */
function faces(container: HTMLElement) {
	return Array.from(container.querySelectorAll('.c-avatar-group .c-avatar')) as HTMLElement[]
}

describe('DocBarPresence', () => {
	it('renders nothing for an empty roster', () => {
		const { container } = render(<DocBarPresence users={[]} />)
		expect(container.firstChild).toBeNull()
	})

	/**
	 * A guest is exactly "no idTag" — nothing about them is verified, so their
	 * ring is dashed. Everyone else wears a solid ring in their identity colour.
	 */
	it('marks a guest avatar and only a guest avatar', () => {
		const { container } = render(<DocBarPresence users={[SIGNED_IN, GUEST]} />)
		const [signedIn, guest] = faces(container)

		expect(signedIn.classList.contains('id-ring')).toBe(true)
		expect(signedIn.classList.contains('guest')).toBe(false)

		expect(guest.classList.contains('id-ring')).toBe(true)
		expect(guest.classList.contains('guest')).toBe(true)
	})

	// A photo carries no identity colour of its own, so the ring has to be told
	// the hue. The initials branch derives the same hue from its own seed.
	it('pins the roster hue on a picture avatar', () => {
		const { container } = render(
			<DocBarPresence users={[{ ...SIGNED_IN, profilePic: 'https://example/pic.webp' }]} />
		)
		const face = faces(container)[0]

		expect(face.style.getPropertyValue('--id-hue')).toBe('210')
		expect(face.classList.contains('c-id-color')).toBe(true)
		expect(face.classList.contains('id-ring')).toBe(true)
	})

	// The idTag, capitalised as a word — not the display name's initials ('SH')
	// and not a shouted tag ('SZ').
	it('draws a monogram from the idTag, not the name', () => {
		const { container } = render(<DocBarPresence users={[SIGNED_IN]} />)
		expect(faces(container)[0].textContent).toBe('Sz')
	})

	it('labels the roster rows', () => {
		const { container } = render(
			<DocBarPresence users={[{ ...SIGNED_IN, self: true }, GUEST]} />
		)
		fireEvent.click(container.querySelector('.c-dropdown-host__trigger') as HTMLElement)

		expect(screen.getByText('Szilárd Hajba (you)')).toBeTruthy()
		expect(screen.getByText('Anon (guest)')).toBeTruthy()
	})
})

// vim: ts=4
