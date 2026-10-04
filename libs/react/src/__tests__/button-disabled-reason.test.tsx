// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { jest } from '@jest/globals'
import { fireEvent, render, screen } from '@testing-library/react'
import * as React from 'react'

import { Button } from '../components/Button/index.js'

describe('Button disabledReason', () => {
	it('an explicit disabled={false} overrides the reason', () => {
		const fn = jest.fn()
		render(
			<Button disabled={false} disabledReason="x" immediate onClick={fn}>
				Go
			</Button>
		)
		fireEvent.click(screen.getByRole('button'))
		expect(fn).toHaveBeenCalled()
		expect(screen.getByRole('button').getAttribute('aria-disabled')).toBeNull()
	})

	it('blocks the click while disabled', () => {
		const fn = jest.fn()
		render(
			<Button disabled disabledReason="x" immediate onClick={fn}>
				Go
			</Button>
		)
		fireEvent.click(screen.getByRole('button'))
		expect(fn).not.toHaveBeenCalled()
		expect(screen.getByRole('button').getAttribute('aria-disabled')).toBe('true')
	})
})
