// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The settings layer of the three that refuse an unsafe nav target.
 *
 * A nav item is rendered as an `href` on every published page, to anonymous readers
 * on the site owner's own origin — so a `javascript:` target is stored XSS. The
 * picker's own input has always run through `safeHref` (`addCustom`), but the
 * per-item target field below it is a plain input that is editable afterwards, and
 * Save only ever checked that the fields were non-empty. `normalizeNav` and
 * `NavLink` drop such a target on render here; the server's own chrome renders the
 * stored nav too, and that copy cannot be checked from this repo.
 *
 * `@cloudillo/react` is mocked down to plain elements: what is under test is the
 * gate, not OpalUI.
 */

import type { SiteNavItem } from '@cloudillo/types'
import { jest } from '@jest/globals'
import { act, fireEvent, render, screen } from '@testing-library/react'
import * as React from 'react'

jest.unstable_mockModule('react-i18next', () => ({
	useTranslation: () => ({ t: (key: string) => key })
}))

// The real components under the overrides below, so the mock does not have to
// track every name the panel imports.
const realReact = await import('../../../libs/react/lib/index.js')

jest.unstable_mockModule('@cloudillo/react', () => ({
	...realReact,
	Badge: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
	// `...rest` matters: the move buttons below carry their whole accessible name in
	// `aria-label`, and a mock that dropped it would hide exactly what is under test.
	Button: ({
		children,
		disabled,
		onClick,
		kind: _kind,
		mode: _mode,
		size: _size,
		variant: _variant,
		...rest
	}: {
		children?: React.ReactNode
		disabled?: boolean
		onClick?: () => void
		kind?: string
		mode?: string
		size?: string
		variant?: string
	} & React.ButtonHTMLAttributes<HTMLButtonElement>) => (
		<button type="button" disabled={disabled} onClick={onClick} {...rest}>
			{children}
		</button>
	),
	mergeClasses: (...classes: unknown[]) => classes.filter(Boolean).join(' '),
	// Render-only: this suite drives the panel through its own controls and never
	// touches the auto/custom switch, but the mock still has to carry every name
	// `site-nav.tsx` imports or the module fails to link at all.
	Segmented: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
	SegmentedItem: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
	Tab: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
	Tabs: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
	useDialog: () => ({ confirm: async () => true })
}))

const { SiteNavPanel } = await import('../settings/site-nav.js')

// `t` is mocked to the identity, so the panel is addressed by its English copy. These
// are the strings `shell/src/settings/site-nav.tsx` passes to `t()` — a copy edit
// there is a one-line change here, not a hunt through the queries below.
const TARGET_LABEL = 'Path or address'
const TARGET_HINT = 'Use a path like /about, or an http(s) address.'
const BLANK_HINT = 'Every item needs a label and a target.'

function renderPanel() {
	const saved: unknown[] = []
	render(
		<SiteNavPanel
			nav={[{ label: 'About', target: '/about' }]}
			derivedNav={[]}
			docs={[]}
			docNames={{}}
			isLeader={true}
			onSave={async (next) => {
				saved.push(next)
			}}
			onLoadPages={async () => []}
		/>
	)
	return {
		saved,
		target: () => screen.getByLabelText(TARGET_LABEL) as HTMLInputElement,
		save: () => screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement
	}
}

describe('SiteNavPanel — target safety', () => {
	it('should enable Save for an edited path', () => {
		const panel = renderPanel()
		fireEvent.change(panel.target(), { target: { value: '/contact' } })
		expect(panel.save().disabled).toBe(false)
	})

	// One target, not the hostile table: this layer's job is to consult `safeHref`
	// before enabling Save. The allowlist itself is exhausted in
	// `libs/core/src/__tests__/site-safety.test.ts`.
	it.each(['javascript:alert(document.cookie)'])(
		'should refuse Save while an existing item targets %p',
		(target) => {
			const panel = renderPanel()
			fireEvent.change(panel.target(), { target: { value: target } })

			expect(panel.save().disabled).toBe(true)
			// Said on the field as well, so the dead button is not a mystery.
			expect(panel.target().getAttribute('aria-invalid')).toBe('true')
			expect(screen.getByText(TARGET_HINT)).toBeTruthy()
		}
	)

	it('should leave an emptied target to the blank gate alone', () => {
		// The two gates must not fault the same field twice.
		const panel = renderPanel()
		fireEvent.change(panel.target(), { target: { value: '  ' } })

		expect(panel.save().disabled).toBe(true)
		expect(panel.target().getAttribute('aria-invalid')).toBe('false')
		expect(screen.getByText(BLANK_HINT)).toBeTruthy()
	})
})

/**
 * Reordering used to be drag-and-drop only, off an `aria-hidden` grip with no
 * `tabIndex` — so a keyboard-only or screen-reader user could not reorder the
 * navigation at all. These buttons are the affordance that gives them the same
 * operation, and they share `moveEntry` with the drag gesture.
 */
describe('SiteNavPanel — keyboard reordering', () => {
	function renderTwo() {
		const saved: SiteNavItem[][] = []
		render(
			<SiteNavPanel
				nav={[
					{ label: 'About', target: '/about' },
					{ label: 'Blog', target: '/blog' }
				]}
				derivedNav={[]}
				docs={[]}
				docNames={{}}
				isLeader={true}
				onSave={async (next) => {
					saved.push((next ?? []) as SiteNavItem[])
				}}
				onLoadPages={async () => []}
			/>
		)
		return {
			saved,
			up: () => screen.getAllByRole('button', { name: 'Move up' }),
			down: () => screen.getAllByRole('button', { name: 'Move down' }),
			save: () => screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement
		}
	}

	it('should move an item down and save the new order', async () => {
		const panel = renderTwo()
		fireEvent.click(panel.down()[0])
		// `act`, because Save is async and settles `saving` back after the write.
		await act(async () => {
			fireEvent.click(panel.save())
		})

		expect(panel.saved).toEqual([
			[
				{ label: 'Blog', target: '/blog' },
				{ label: 'About', target: '/about' }
			]
		])
	})

	it('should move an item back up again', () => {
		const panel = renderTwo()
		fireEvent.click(panel.down()[0])
		fireEvent.click(panel.up()[1])

		// Back where it started, so there is nothing left to save.
		expect(panel.save().disabled).toBe(true)
	})

	function renderThree() {
		render(
			<SiteNavPanel
				nav={[
					{ label: 'About', target: '/about' },
					{ label: 'Blog', target: '/blog' },
					{ label: 'Contact', target: '/contact' }
				]}
				derivedNav={[]}
				docs={[]}
				docNames={{}}
				isLeader={true}
				onSave={async () => {}}
				onLoadPages={async () => []}
			/>
		)
		return {
			down: () => screen.getAllByRole('button', { name: 'Move down' }),
			labels: () =>
				(screen.getAllByLabelText('Label') as HTMLInputElement[]).map((el) => el.value)
		}
	}

	// The rows are keyed by position, so a reorder reuses the same DOM nodes and
	// focus stayed on the *slot*: a second press moved whichever item had arrived
	// there, and "Move down" twice put the entry back where it started.
	it('should follow the item that moved rather than the slot it left', () => {
		const panel = renderThree()
		fireEvent.click(panel.down()[0])
		expect(document.activeElement).toBe(panel.down()[1])

		// The same button the reader's focus is now on — the real keyboard sequence.
		fireEvent.click(panel.down()[1])
		expect(panel.labels()).toEqual(['Blog', 'Contact', 'About'])
	})

	it('should bound the buttons at both ends of the list', () => {
		const panel = renderTwo()
		expect(panel.up()[0].hasAttribute('disabled')).toBe(true)
		expect(panel.down()[0].hasAttribute('disabled')).toBe(false)
		expect(panel.up()[1].hasAttribute('disabled')).toBe(false)
		expect(panel.down()[1].hasAttribute('disabled')).toBe(true)
	})
})

// vim: ts=4
