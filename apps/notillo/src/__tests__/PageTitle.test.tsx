// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * The page's title field: only a changed, non-empty, trimmed value is saved, on blur or
 * unmount; Esc never saves; a new page takes the focus once, with its name selected.
 */

import { jest } from '@jest/globals'
import * as React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

jest.unstable_mockModule('react-i18next', () => ({
	useTranslation: () => ({ t: (key: string) => key })
}))

const { PageTitle } = await import('../editor/PageTitle.js')

function render(
	props: { readOnly?: boolean; justCreated?: string; saved?: boolean; title?: string } = {}
) {
	const container = document.createElement('div')
	document.body.append(container)
	const root = createRoot(container)
	const justCreatedRef: React.RefObject<string | undefined> = { current: props.justCreated }
	const onRename = jest.fn<(title: string) => Promise<boolean>>(async () => props.saved ?? true)
	const onEnter = jest.fn<() => void>()
	const element = (pageId: string, title = 'Old') => (
		<PageTitle
			key={pageId}
			pageId={pageId}
			title={title}
			readOnly={!!props.readOnly}
			justCreatedRef={justCreatedRef}
			onRename={onRename}
			onEnter={onEnter}
		/>
	)
	act(() => root.render(element('p1', props.title)))

	const field = () => container.querySelector('textarea') as HTMLTextAreaElement
	return {
		container,
		field,
		justCreatedRef,
		onRename,
		onEnter,
		rerender: (pageId: string, title?: string) =>
			act(() => root.render(element(pageId, title))),
		type(value: string) {
			const setValue = Object.getOwnPropertyDescriptor(
				HTMLTextAreaElement.prototype,
				'value'
			)?.set
			act(() => {
				setValue?.call(field(), value)
				field().dispatchEvent(new Event('input', { bubbles: true }))
			})
		},
		press(key: string) {
			act(() => {
				field().dispatchEvent(
					new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
				)
			})
		},
		// Async, so the `onRename` result is in by the time it returns.
		blur: () =>
			act(async () => {
				field().focus()
				field().blur()
			}),
		unmount() {
			act(() => root.unmount())
			container.remove()
		}
	}
}

describe('PageTitle', () => {
	it('saves a changed name, trimmed, on blur', async () => {
		const view = render()

		view.type('  New  ')
		await view.blur()

		expect(view.onRename).toHaveBeenCalledTimes(1)
		expect(view.onRename).toHaveBeenCalledWith('New')
		view.unmount()
	})

	it.each([
		['unchanged', 'Old'],
		['unchanged once trimmed', ' Old '],
		['empty', '   ']
	])('does not save a name that is %s, and shows the old one', async (_case, value) => {
		const view = render()

		view.type(value)
		await view.blur()

		expect(view.onRename).not.toHaveBeenCalled()
		expect(view.field().value).toBe('Old')
		view.unmount()
	})

	it('Esc reverts without saving', async () => {
		const view = render()

		view.type('New')
		view.press('Escape')
		await view.blur()

		expect(view.field().value).toBe('Old')
		expect(view.onRename).not.toHaveBeenCalled()
		view.unmount()
	})

	it('Enter saves, then hands over to the page body', () => {
		const view = render()

		view.field().focus()
		view.type('New')
		view.press('Enter')

		expect(view.onRename).toHaveBeenCalledWith('New')
		expect(view.onEnter).toHaveBeenCalledTimes(1)
		view.unmount()
	})

	it('keeps the new name after the write, until the new title arrives', async () => {
		const view = render()

		view.type('  New  ')
		await view.blur()
		expect(view.field().value).toBe('  New  ')

		view.rerender('p1', 'New')
		expect(view.field().value).toBe('New')

		// The draft is gone: a later rename from elsewhere shows through.
		view.rerender('p1', 'Newer')
		expect(view.field().value).toBe('Newer')
		view.unmount()
	})

	it('drops a held draft when a different title arrives', async () => {
		const view = render()

		view.type('New')
		await view.blur()
		view.rerender('p1', 'Other')

		expect(view.field().value).toBe('Other')
		view.unmount()
		expect(view.onRename).toHaveBeenCalledTimes(1)
	})

	it('keeps what is being typed when a different title arrives', () => {
		const view = render()

		view.field().focus()
		view.type('New')
		view.rerender('p1', 'Other')

		expect(view.field().value).toBe('New')
		view.unmount()
	})

	it('falls back to the title when the write is refused', async () => {
		const view = render({ saved: false })

		view.type('New')
		await view.blur()

		expect(view.field().value).toBe('Old')
		view.unmount()
	})

	it('keeps a pasted name on one line', () => {
		const view = render()

		view.type('One\n two')

		expect(view.field().value).toBe('One two')
		view.unmount()
	})

	it('takes the focus for a just-created page, with the name selected, once', () => {
		const view = render({ justCreated: 'p1' })

		expect(document.activeElement).toBe(view.field())
		expect(view.field().selectionStart).toBe(0)
		expect(view.field().selectionEnd).toBe('Old'.length)
		expect(view.justCreatedRef.current).toBeUndefined()

		view.field().blur()
		view.rerender('p2')
		expect(document.activeElement).not.toBe(view.field())
		view.unmount()
	})

	it('saves a draft with no blur on unmount, once', () => {
		const view = render()

		view.type('  New  ')
		view.unmount()

		expect(view.onRename).toHaveBeenCalledTimes(1)
		expect(view.onRename).toHaveBeenCalledWith('New')
	})

	it('does not save again on unmount after a blur saved', async () => {
		const view = render()

		view.type('New')
		await view.blur()
		view.unmount()

		expect(view.onRename).toHaveBeenCalledTimes(1)
	})

	it('saves the old name back on blur before the new title arrives', async () => {
		const view = render()

		view.type('New')
		await view.blur()
		view.type('Old')
		await view.blur()

		expect(view.onRename.mock.calls).toEqual([['New'], ['Old']])
		view.unmount()
	})

	it('saves the old name back on unmount before the new title arrives', async () => {
		const view = render()

		view.type('New')
		await view.blur()
		view.type('Old')
		view.unmount()

		expect(view.onRename.mock.calls).toEqual([['New'], ['Old']])
	})

	it('does not save on unmount after Esc', () => {
		const view = render()

		view.type('New')
		view.press('Escape')
		view.unmount()

		expect(view.onRename).not.toHaveBeenCalled()
	})

	it('waits for the title of a just-created page before taking the focus', () => {
		const view = render({ justCreated: 'p1', title: '' })

		expect(document.activeElement).not.toBe(view.field())
		expect(view.justCreatedRef.current).toBe('p1')

		view.rerender('p1', 'New Page')

		expect(document.activeElement).toBe(view.field())
		expect(view.field().selectionStart).toBe(0)
		expect(view.field().selectionEnd).toBe('New Page'.length)
		expect(view.justCreatedRef.current).toBeUndefined()
		view.unmount()
	})

	it('leaves the focus alone when another page was just created', () => {
		const view = render({ justCreated: 'other' })

		expect(document.activeElement).not.toBe(view.field())
		expect(view.justCreatedRef.current).toBe('other')
		view.unmount()
	})

	it('is plain text for a read-only user', () => {
		const view = render({ readOnly: true })

		expect(view.field()).toBeNull()
		expect(view.container.querySelector('h1')?.textContent).toBe('Old')
		view.unmount()
	})
})

// vim: ts=4
