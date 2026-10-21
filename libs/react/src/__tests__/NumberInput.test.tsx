// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/** `NumberInput` text mode: a draft while typing, committed through `parse` + clamp. */

import { jest } from '@jest/globals'
import { fireEvent, render, screen } from '@testing-library/react'
import * as React from 'react'

import { NumberInput } from '../components/NumberInput/NumberInput.js'

/** "12pt" → 12; anything non-numeric → undefined (rejected). */
const parse = (text: string) => {
	const n = parseFloat(text)
	return Number.isNaN(n) ? undefined : n
}
const format = (v: number) => `${v}pt`

/** A parent that stores what it is given, or (`accept: false`) rejects every change. */
function setup(value = 10, accept = true) {
	const onChange = jest.fn<(v: number) => void>()
	function Parent() {
		const [v, setV] = React.useState(value)
		return (
			<NumberInput
				aria-label="Size"
				value={v}
				min={1}
				max={100}
				parse={parse}
				format={format}
				onChange={(next) => {
					onChange(next)
					if (accept) setV(next)
				}}
			/>
		)
	}
	render(<Parent />)
	return { input: screen.getByLabelText('Size') as HTMLInputElement, onChange }
}

describe('NumberInput text mode', () => {
	it('keeps the draft while typing, without committing', () => {
		const { input, onChange } = setup()
		expect(input.value).toBe('10pt')
		fireEvent.change(input, { target: { value: '2' } })
		expect(input.value).toBe('2')
		fireEvent.change(input, { target: { value: '24' } })
		expect(input.value).toBe('24')
		expect(onChange).not.toHaveBeenCalled()
	})

	it('commits on Enter through parse, then shows the formatted value', () => {
		const { input, onChange } = setup()
		fireEvent.change(input, { target: { value: '24' } })
		fireEvent.keyDown(input, { key: 'Enter' })
		expect(onChange).toHaveBeenCalledWith(24)
		expect(input.value).toBe('24pt')
	})

	it('commits on blur and clamps to min/max', () => {
		const { input, onChange } = setup()
		fireEvent.change(input, { target: { value: '500' } })
		fireEvent.blur(input)
		expect(onChange).toHaveBeenCalledWith(100)
		expect(input.value).toBe('100pt')
	})

	it('reverts invalid input', () => {
		const { input, onChange } = setup()
		fireEvent.change(input, { target: { value: 'abc' } })
		fireEvent.keyDown(input, { key: 'Enter' })
		expect(onChange).not.toHaveBeenCalled()
		expect(input.value).toBe('10pt')
	})

	it('keeps showing the value when the parent rejects the change', () => {
		const { input, onChange } = setup(10, false)
		fireEvent.change(input, { target: { value: '24' } })
		fireEvent.keyDown(input, { key: 'Enter' })
		expect(onChange).toHaveBeenCalledWith(24)
		expect(input.value).toBe('10pt')
	})

	it('reverts on Escape', () => {
		const { input, onChange } = setup()
		fireEvent.change(input, { target: { value: '42' } })
		fireEvent.keyDown(input, { key: 'Escape' })
		expect(input.value).toBe('10pt')
		fireEvent.blur(input)
		expect(onChange).not.toHaveBeenCalled()
	})

	it('steps with the arrow keys (Shift ×10), from the draft when there is one', () => {
		const { input, onChange } = setup()
		fireEvent.keyDown(input, { key: 'ArrowUp' })
		expect(onChange).toHaveBeenLastCalledWith(11)
		fireEvent.keyDown(input, { key: 'ArrowDown', shiftKey: true })
		expect(onChange).toHaveBeenLastCalledWith(1)
		fireEvent.change(input, { target: { value: '50' } })
		fireEvent.keyDown(input, { key: 'ArrowUp' })
		expect(onChange).toHaveBeenLastCalledWith(51)
		expect(input.value).toBe('51pt')
	})
})
