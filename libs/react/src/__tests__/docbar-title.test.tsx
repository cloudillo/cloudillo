// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { jest } from '@jest/globals'
import { fireEvent, render, screen } from '@testing-library/react'
import * as React from 'react'

import { DocBarTitle } from '../components/DocBar/DocBarTitle.js'

describe('DocBarTitle', () => {
	it('renders one segment and no separator when there is no sub-item', () => {
		const { container } = render(<DocBarTitle title="My doc" />)

		expect(screen.getByText('My doc')).toBeTruthy()
		expect(container.querySelector('.c-docbar-sep')).toBeNull()
		expect(container.querySelector('.c-docbar-sub')).toBeNull()
		// The responsive rule that hides the document name keys off this class,
		// so it must only appear once there is a second segment to fall back to.
		expect(container.querySelector('.c-docbar-main.has-sub')).toBeNull()
	})

	it('renders a separator and the sub-item label when `sub` is given', () => {
		const { container } = render(
			<DocBarTitle title="My doc" sub={{ label: 'Design notes', icon: '📄' }} />
		)

		expect(screen.getByText('My doc')).toBeTruthy()
		expect(screen.getByText('Design notes')).toBeTruthy()
		expect(screen.getByText('📄')).toBeTruthy()
		expect(container.querySelector('.c-docbar-sep')).not.toBeNull()
		expect(container.querySelector('.c-docbar-main.has-sub')).not.toBeNull()
		// The sub-item is the crumb the trail is currently on.
		expect(screen.getByText('Design notes').getAttribute('aria-current')).toBe('page')
	})

	it('renames the sub-item through `sub.onRename`, never the document', () => {
		const onRename = jest.fn()
		const onSubRename = jest.fn()

		render(
			<DocBarTitle
				title="My doc"
				canRename
				onRename={onRename}
				sub={{ label: 'Design notes', canRename: true, onRename: onSubRename }}
			/>
		)

		fireEvent.click(screen.getByRole('button', { name: 'Design notes' }))

		const input = screen.getByPlaceholderText('Name') as HTMLInputElement
		fireEvent.change(input, { target: { value: 'Meeting notes' } })
		// The save button is icon-only, so submit the form itself.
		fireEvent.submit(input.closest('form') as HTMLFormElement)

		expect(onSubRename).toHaveBeenCalledWith('Meeting notes')
		expect(onRename).not.toHaveBeenCalled()
		// The document title must not have turned into an edit box alongside it.
		expect(screen.getByRole('button', { name: 'My doc' })).toBeTruthy()
	})

	// A name we have not fetched yet is not the same thing as no name. Showing
	// "Untitled document" for the length of the row fetch made every document look
	// unnamed on a slow connection.
	it('shows a placeholder rather than the untitled label while loading', () => {
		const { container } = render(<DocBarTitle state="loading" />)

		expect(screen.queryByText('Untitled document')).toBeNull()
		expect(container.querySelector('.c-skeleton')).not.toBeNull()
	})

	it('keeps showing a known name while loading, so a push cannot flash the placeholder', () => {
		const { container } = render(<DocBarTitle state="loading" title="My doc" />)

		expect(screen.getByText('My doc')).toBeTruthy()
		expect(container.querySelector('.c-skeleton')).toBeNull()
	})

	it('says the document is unavailable rather than untitled when it did not resolve', () => {
		render(<DocBarTitle state="unavailable" />)

		expect(screen.getByText('Document unavailable')).toBeTruthy()
		expect(screen.queryByText('Untitled document')).toBeNull()
	})

	it('still says untitled for a resolved document with no name', () => {
		render(<DocBarTitle state="ready" />)

		expect(screen.getByText('Untitled document')).toBeTruthy()
	})

	/**
	 * The shell pushes a fresh `DocInfo` on every change of any kind — a pin, an
	 * access change, a Files-list bump — and every one of those re-renders this
	 * with the same title. Closing the box on those threw away what was typed.
	 */
	it('keeps the edit box open when an unrelated push leaves the name unchanged', () => {
		const { rerender } = render(<DocBarTitle title="My doc" canRename onRename={jest.fn()} />)

		fireEvent.click(screen.getByRole('button', { name: 'My doc' }))
		const input = screen.getByPlaceholderText('Document name') as HTMLInputElement
		fireEvent.change(input, { target: { value: 'Half-typed nam' } })

		rerender(<DocBarTitle title="My doc" canRename onRename={jest.fn()} dirty />)

		expect((screen.getByPlaceholderText('Document name') as HTMLInputElement).value).toBe(
			'Half-typed nam'
		)
	})

	it('closes the edit box when the name is changed out from under it', () => {
		const { rerender } = render(<DocBarTitle title="My doc" canRename onRename={jest.fn()} />)

		fireEvent.click(screen.getByRole('button', { name: 'My doc' }))
		fireEvent.change(screen.getByPlaceholderText('Document name'), {
			target: { value: 'Half-typed nam' }
		})

		rerender(<DocBarTitle title="Renamed elsewhere" canRename onRename={jest.fn()} />)

		expect(screen.queryByPlaceholderText('Document name')).toBeNull()
		expect(screen.getByRole('button', { name: 'Renamed elsewhere' })).toBeTruthy()
	})

	/**
	 * `h1`'s content model is phrasing content, and `InlineEditForm` renders a
	 * real `<form>`. So the heading wraps the name but never the edit box.
	 */
	it('keeps the document heading out of the way of the edit form', () => {
		const { container, rerender } = render(<DocBarTitle title="My doc" canRename />)

		const headings = container.querySelectorAll('h1')
		expect(headings.length).toBe(1)
		expect(headings[0].textContent).toBe('My doc')

		fireEvent.click(screen.getByRole('button', { name: 'My doc' }))
		expect(container.querySelector('h1 form')).toBeNull()

		// and a sub-item never adds a second one
		rerender(<DocBarTitle title="My doc" sub={{ label: 'Design notes' }} />)
		expect(container.querySelectorAll('h1').length).toBe(1)
	})

	it('renders a non-renameable sub-item as a span, not a button', () => {
		render(<DocBarTitle title="My doc" canRename sub={{ label: 'Page 3 of 12' }} />)

		expect(screen.queryByRole('button', { name: 'Page 3 of 12' })).toBeNull()
		expect(screen.getByText('Page 3 of 12').tagName).toBe('SPAN')
		// The document segment stays renameable independently of the sub-item.
		expect(screen.getByRole('button', { name: 'My doc' })).toBeTruthy()
	})
})

// vim: ts=4
