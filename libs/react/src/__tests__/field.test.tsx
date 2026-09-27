// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { render, screen } from '@testing-library/react'
import * as React from 'react'

import { Field, Input } from '../components/Form/index.js'

describe('Field', () => {
	it('wires label, hint, error and required onto the control', () => {
		render(
			<Field label="Name" hint="h" error="e" required>
				<Input />
			</Field>
		)
		const input = screen.getByRole('textbox')
		const { id } = input
		expect(id).toBeTruthy()
		expect(screen.getByText('Name').closest('label')?.htmlFor).toBe(id)
		const describedBy = input.getAttribute('aria-describedby')?.split(' ')
		expect(describedBy).toEqual(expect.arrayContaining([`${id}-hint`, `${id}-error`]))
		expect(input.getAttribute('aria-invalid')).toBe('true')
		expect((input as HTMLInputElement).required).toBe(true)
	})

	it('omits hint and error ids when those props are absent', () => {
		render(
			<Field label="Name">
				<Input />
			</Field>
		)
		const input = screen.getByRole('textbox')
		expect(input.hasAttribute('aria-describedby')).toBe(false)
		expect(input.hasAttribute('aria-invalid')).toBe(false)
		expect((input as HTMLInputElement).required).toBe(false)
	})

	it("lets the control's own id and aria-invalid win", () => {
		render(
			<Field label="Name" error="e">
				<Input id="own" aria-invalid="false" />
			</Field>
		)
		const input = screen.getByRole('textbox')
		expect(input.id).toBe('own')
		expect(input.getAttribute('aria-invalid')).toBe('false')
	})
})

// vim: ts=4
