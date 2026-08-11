// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { render } from '@testing-library/react'
import * as React from 'react'

import { InitialsAvatar, initialsFor, monogramFor } from '../components/Avatar/InitialsAvatar.js'

describe('initialsFor', () => {
	// A one-word name is read as a word, like monogramFor reads an idTag —
	// 'Gu', not 'GU' and not the bare 'G' a share-link guest used to get.
	it('takes the first two characters of a one-word name', () => {
		expect(initialsFor('Ada')).toBe('Ad')
		expect(initialsFor('Guest')).toBe('Gu')
		expect(initialsFor('ada')).toBe('Ad')
	})

	it('keeps a single-character name as itself', () => {
		expect(initialsFor('A')).toBe('A')
		expect(initialsFor('a')).toBe('A')
	})

	it('takes the first letter of the first two words', () => {
		expect(initialsFor('Ada Lovelace')).toBe('AL')
		expect(initialsFor('Grace Brewster Murray Hopper')).toBe('GB')
	})

	it('collapses irregular whitespace', () => {
		expect(initialsFor('  Ada   Lovelace  ')).toBe('AL')
	})

	it('falls back to a neutral glyph for an empty name', () => {
		expect(initialsFor('')).toBe('?')
		expect(initialsFor('   ')).toBe('?')
		expect(initialsFor(undefined)).toBe('?')
	})

	it('uppercases with locale rules', () => {
		expect(initialsFor('szilárd hajba')).toBe('SH')
	})

	it('handles non-Latin scripts', () => {
		expect(initialsFor('Ада Лавлейс')).toBe('АЛ')
		expect(initialsFor('山田 太郎')).toBe('山太')
		// A single-word CJK name: no case to apply, so both characters survive
		expect(initialsFor('山田')).toBe('山田')
	})

	// A surrogate pair is one grapheme but two UTF-16 units; slicing by index
	// would emit half of it and render a replacement box.
	it('keeps astral-plane characters whole', () => {
		expect(initialsFor('🐙 Squid')).toBe('🐙S')
		expect(initialsFor('🐙x')).toBe('🐙x')
	})
})

describe('monogramFor', () => {
	// Capitalised as a word, not as initials: 'Sz', never 'SZ' and never 'SH'.
	it('takes the first two characters of the idTag', () => {
		expect(monogramFor('@szilu.cloudillo.net')).toBe('Sz')
	})

	it('accepts a bare idTag as well as an @-prefixed one', () => {
		expect(monogramFor('szilu.cloudillo.net')).toBe('Sz')
	})

	it('strips only one leading @', () => {
		expect(monogramFor('@@odd.example')).toBe('@o')
	})

	// Stops at the domain, so a one-letter user is 'A' and never 'A.'
	it('copes with a one-character user part', () => {
		expect(monogramFor('@a.example')).toBe('A')
	})

	it('handles non-Latin scripts', () => {
		expect(monogramFor('@ада.example')).toBe('Ад')
	})

	// A surrogate pair is one grapheme but two UTF-16 units; see initialsFor.
	it('keeps astral-plane characters whole', () => {
		expect(monogramFor('🐙x.example')).toBe('🐙x')
	})

	it('falls back to the name initials with no idTag', () => {
		expect(monogramFor(undefined, 'Ada Lovelace')).toBe('AL')
		expect(monogramFor('', 'Ada')).toBe('Ad')
		// A guest has no idTag at all — two letters, not a bare 'G'
		expect(monogramFor(undefined, 'Guest')).toBe('Gu')
		expect(monogramFor('   ', 'Ada Lovelace')).toBe('AL')
		expect(monogramFor()).toBe('?')
	})
})

describe('InitialsAvatar', () => {
	it('renders the initials and pins a hue from the seed', () => {
		const { container } = render(<InitialsAvatar name="Ada Lovelace" seed="@ada.example" />)
		const avatar = container.querySelector('.c-avatar')

		expect(avatar).not.toBeNull()
		expect(avatar?.textContent).toBe('AL')
		expect(avatar?.classList.contains('c-id-color')).toBe(true)

		const hue = (avatar as HTMLElement).style.getPropertyValue('--id-hue')
		expect(Number(hue)).toBeGreaterThanOrEqual(0)
		expect(Number(hue)).toBeLessThan(360)
	})

	it('gives the same seed the same hue and different seeds different ones', () => {
		function hueOf(props: { name?: string; seed?: string }) {
			const { container } = render(<InitialsAvatar {...props} />)
			return (container.querySelector('.c-avatar') as HTMLElement).style.getPropertyValue(
				'--id-hue'
			)
		}

		// The seed, not the display name, is what fixes the colour — so the same
		// person keeps their colour after a rename.
		expect(hueOf({ name: 'Ada Lovelace', seed: '@ada.example' })).toBe(
			hueOf({ name: 'A. Lovelace', seed: '@ada.example' })
		)
		expect(hueOf({ seed: '@ada.example' })).not.toBe(hueOf({ seed: '@grace.example' }))
	})

	it('prefers the idTag monogram over the name initials', () => {
		const { container } = render(
			<InitialsAvatar name="Szilárd Hajba" idTag="@szilu.cloudillo.net" />
		)
		const avatar = container.querySelector('.c-avatar') as HTMLElement

		expect(avatar.textContent).toBe('Sz')
		// and the idTag seeds the colour without a separate `seed` prop
		expect(avatar.style.getPropertyValue('--id-hue')).not.toBe('')
	})

	it('falls back to the name as the colour seed', () => {
		const { container } = render(<InitialsAvatar name="Ada" />)
		expect(
			(container.querySelector('.c-avatar') as HTMLElement).style.getPropertyValue('--id-hue')
		).not.toBe('')
	})
})

// vim: ts=4
