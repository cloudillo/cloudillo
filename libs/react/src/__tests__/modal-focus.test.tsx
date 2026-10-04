// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { act, render, screen } from '@testing-library/react'
import * as React from 'react'

import { Dialog, DialogContainer, useDialog } from '../components/Dialog/index.js'
import { Input } from '../components/Form/index.js'
import { isInDialog } from '../components/hooks.js'
import { Modal } from '../components/Modal/index.js'

function stubPointer(fine: boolean) {
	window.matchMedia = ((query: string) => ({
		matches: fine && query === '(pointer: fine)',
		media: query,
		addEventListener() {},
		removeEventListener() {}
	})) as unknown as typeof window.matchMedia
}

describe('Modal focus', () => {
	afterEach(() => {
		;(window as { matchMedia?: unknown }).matchMedia = undefined
	})

	it('honours autoFocus on a child', () => {
		render(
			<Dialog open title="T" onSubmit={() => {}}>
				<Input aria-label="first" />
				<Input aria-label="second" autoFocus />
			</Dialog>
		)
		expect(document.activeElement).toBe(screen.getByLabelText('second'))
	})

	it('focuses the first field on a fine pointer', () => {
		stubPointer(true)
		render(
			<Dialog open title="T" onSubmit={() => {}}>
				<Input aria-label="name" />
			</Dialog>
		)
		expect(document.activeElement).toBe(screen.getByLabelText('name'))
	})

	it('skips the field on a coarse pointer and avoids the close button', () => {
		stubPointer(false)
		render(
			<Dialog open title="T" onClose={() => {}} footer={<button type="button">Go</button>}>
				<Input aria-label="name" />
			</Dialog>
		)
		expect(document.activeElement).toBe(screen.getByText('Go'))
	})

	it('focuses Cancel in a destructive confirm', () => {
		let dialog!: ReturnType<typeof useDialog>
		function Opener() {
			dialog = useDialog()
			return null
		}
		render(
			<>
				<Opener />
				<DialogContainer />
			</>
		)
		act(() => {
			void dialog.confirm('Delete?', 'Gone for good', { color: 'error' })
		})
		expect(document.activeElement?.textContent).toBe('Cancel')
	})

	it.each([
		['useEffect', React.useEffect],
		['useLayoutEffect', React.useLayoutEffect]
	])('mounts children in the same commit as open (%s)', (_name, useHook) => {
		const seen: unknown[] = []
		function Host({ open }: { open: boolean }) {
			const ref = React.useRef<HTMLDivElement>(null)
			useHook(() => {
				if (open) seen.push(ref.current)
			}, [open])
			return (
				<Modal open={open}>
					<div ref={ref} />
				</Modal>
			)
		}
		const { rerender } = render(<Host open={false} />)
		rerender(<Host open />)
		expect(seen).toHaveLength(1)
		expect(seen[0]).toBeInstanceOf(HTMLDivElement)
	})
})

describe('isInDialog', () => {
	it('matches targets inside an open dialog only', () => {
		render(
			<>
				<dialog open>
					<button type="button">in</button>
				</dialog>
				<button type="button">out</button>
			</>
		)
		expect(isInDialog(screen.getByText('in'))).toBe(true)
		expect(isInDialog(screen.getByText('out'))).toBe(false)
		expect(isInDialog(null)).toBe(false)
	})
})

// vim: ts=4
