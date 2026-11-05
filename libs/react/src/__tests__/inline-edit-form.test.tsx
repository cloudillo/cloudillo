// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { jest } from '@jest/globals'
import { act, fireEvent, render, screen } from '@testing-library/react'
import * as React from 'react'

import { InlineEditForm } from '../components/InlineEdit/InlineEditForm.js'

function setup(value = 'Old name') {
	const onSave = jest.fn()
	const onCancel = jest.fn()
	render(<InlineEditForm value={value} onSave={onSave} onCancel={onCancel} />)
	const input = screen.getByRole('textbox') as HTMLInputElement
	return { onSave, onCancel, input, form: input.closest('form') as HTMLFormElement }
}

function type(input: HTMLInputElement, value: string) {
	fireEvent.change(input, { target: { value } })
}

describe('InlineEditForm', () => {
	it('saves a changed value on submit, trimmed', () => {
		const { onSave, onCancel, input, form } = setup()

		type(input, '  New name ')
		fireEvent.submit(form)

		expect(onSave).toHaveBeenCalledTimes(1)
		expect(onSave).toHaveBeenCalledWith('New name')
		expect(onCancel).not.toHaveBeenCalled()
	})

	it('leaves a blurred form open, saving nothing', () => {
		const { onSave, onCancel, input } = setup()

		type(input, 'New name')
		act(() => {
			input.blur()
		})

		expect(onSave).not.toHaveBeenCalled()
		expect(onCancel).not.toHaveBeenCalled()
		expect(input.isConnected).toBe(true)
		expect(input.value).toBe('New name')
	})

	it('does not write the old name back after a remote rename', () => {
		const onSave = jest.fn()
		const onCancel = jest.fn()
		const form = (value: string) => (
			<InlineEditForm value={value} onSave={onSave} onCancel={onCancel} />
		)
		const { rerender } = render(form('Old name'))

		rerender(form('Remote name'))
		fireEvent.submit(screen.getByRole('textbox').closest('form') as HTMLFormElement)

		expect(onSave).not.toHaveBeenCalled()
		expect(onCancel).toHaveBeenCalledTimes(1)
	})

	it('does nothing on submit with an empty value', () => {
		const { onSave, onCancel, input, form } = setup()

		type(input, '   ')
		fireEvent.submit(form)

		expect(onSave).not.toHaveBeenCalled()
		expect(onCancel).not.toHaveBeenCalled()
	})

	it('never saves from the cancel button', () => {
		const { onSave, onCancel, input } = setup()

		type(input, 'New name')
		fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

		expect(onSave).not.toHaveBeenCalled()
		expect(onCancel).toHaveBeenCalledTimes(1)
	})

	it('never saves on Esc', () => {
		const { onSave, onCancel, input } = setup()

		type(input, 'New name')
		fireEvent.keyDown(input, { key: 'Escape' })

		expect(onSave).not.toHaveBeenCalled()
		expect(onCancel).toHaveBeenCalledTimes(1)
	})

	it('closes without saving on Enter with an unchanged value', () => {
		const { onSave, onCancel, form } = setup()

		fireEvent.submit(form)

		expect(onSave).not.toHaveBeenCalled()
		expect(onCancel).toHaveBeenCalledTimes(1)
	})

	it('calls a consumer onKeyDown, and Esc still cancels', () => {
		const onCancel = jest.fn()
		const onKeyDown = jest.fn()
		render(
			<InlineEditForm
				value="Old name"
				onSave={() => {}}
				onCancel={onCancel}
				onKeyDown={onKeyDown}
			/>
		)

		fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' })

		expect(onKeyDown).toHaveBeenCalledTimes(1)
		expect(onCancel).toHaveBeenCalledTimes(1)
	})

	it('calls a consumer onClick and onDoubleClick, and still stops them bubbling', () => {
		const onClick = jest.fn()
		const onDoubleClick = jest.fn()
		const outerClick = jest.fn()
		const outerDoubleClick = jest.fn()
		render(
			<div onClick={outerClick} onDoubleClick={outerDoubleClick}>
				<InlineEditForm
					value="Old name"
					onSave={() => {}}
					onCancel={() => {}}
					onClick={onClick}
					onDoubleClick={onDoubleClick}
				/>
			</div>
		)
		const input = screen.getByRole('textbox')

		fireEvent.click(input)
		fireEvent.doubleClick(input)

		expect(onClick).toHaveBeenCalledTimes(1)
		expect(onDoubleClick).toHaveBeenCalledTimes(1)
		expect(outerClick).not.toHaveBeenCalled()
		expect(outerDoubleClick).not.toHaveBeenCalled()
	})
})

// vim: ts=4
