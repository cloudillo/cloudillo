// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The slug freeze, right after a publish.
 *
 * `usePageProperties` is a one-shot `get()` taken when the pane mounts — deliberately
 * not a subscription, so a collaborator's write cannot overwrite what is being typed.
 * `freezePublishedPages` writes `pubAt` and `slug` *after* the publish commits, and
 * nothing re-reads. With the pane left open across a publish the pane's own record
 * still said "never published", so clearing the address field was no longer refused
 * and a rename could move a live URL.
 *
 * Both fields are live on the page map (`PAGE_FIELDS` in `useAllPages`), which is
 * where the two props under test come from.
 */

import type { RtdbClient } from '@cloudillo/rtdb'
import { jest } from '@jest/globals'
import * as React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

import type { PageRecord } from '../rtdb/types.js'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const FROZEN_NOTICE = 'A published page keeps its address — type a new one to move it.'

jest.unstable_mockModule('react-i18next', () => ({
	useTranslation: () => ({ t: (key: string) => key })
}))

// Exactly what the panel imports, as plain elements: what is under test is the
// freeze, not OpalUI.
jest.unstable_mockModule('@cloudillo/react', () => ({
	Button: ({ children }: { children?: React.ReactNode }) => (
		<button type="button">{children}</button>
	),
	Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
	LoadingSpinner: () => <span />,
	NativeSelect: (props: React.SelectHTMLAttributes<HTMLSelectElement>) => <select {...props} />,
	// `data-label` is how the cases below reach one field among many.
	PropertyField: ({ label, children }: { label: string; children?: React.ReactNode }) => (
		<div data-label={label}>{children}</div>
	),
	PropertySection: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
	TextArea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} />,
	Toggle: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
		<input type="checkbox" {...props} />
	)
}))

const save = jest.fn(async () => {})
let record: PageRecord | undefined

jest.unstable_mockModule('../hooks/usePageProperties.js', () => ({
	usePageProperties: () => ({ record, loading: false, error: undefined, retry: () => {}, save })
}))

const { PagePropertiesPanel } = await import('../pages/PagePropertiesPanel.js')

function renderPanel(props: { publishedAt?: string; liveSlug?: string | null }) {
	const container = document.createElement('div')
	document.body.append(container)
	const root = createRoot(container)
	act(() => {
		root.render(
			<PagePropertiesPanel
				client={{} as RtdbClient}
				pageId="p1"
				title="Hello"
				derived={{}}
				atContainerRoot={false}
				atRoot={false}
				isHome={false}
				canBecomeHome={false}
				onToggleHome={() => {}}
				readOnly={false}
				{...props}
			/>
		)
	})
	return container
}

/** Empty the address field and blur it, which is where `TextProperty` commits. */
function clearSlug(container: HTMLElement) {
	const input = container.querySelector('[data-label="Slug"] input') as HTMLInputElement
	act(() => {
		const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
			?.set as (v: string) => void
		setter.call(input, '')
		input.dispatchEvent(new Event('input', { bubbles: true }))
	})
	act(() => {
		input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
	})
	return input
}

beforeEach(() => {
	save.mockClear()
	record = { id: 'p1', title: 'Hello', slug: 'hello' } as unknown as PageRecord
})

describe('PagePropertiesPanel — the slug freeze', () => {
	it('should refuse to clear the address when only the live map says it is published', () => {
		// The pane's own record predates the publish, which is the regression.
		const container = renderPanel({ publishedAt: '2026-01-01T00:00:00Z', liveSlug: 'hello' })
		clearSlug(container)

		expect(container.textContent).toContain(FROZEN_NOTICE)
		expect(save).not.toHaveBeenCalled()
	})

	it('should not carry the notice over to the next page', () => {
		// The notice is panel state and nothing inside the panel resets it on a
		// `pageId` change, so the call site in `app.tsx` keys it by page — this
		// mirrors that. Without the key the frozen-slug notice stayed on screen under
		// the *next* page's address field, where it is not true.
		const container = document.createElement('div')
		document.body.append(container)
		const root = createRoot(container)
		const show = (pageId: string, published: boolean) => {
			act(() => {
				root.render(
					<PagePropertiesPanel
						key={pageId}
						client={{} as RtdbClient}
						pageId={pageId}
						title="Hello"
						publishedAt={published ? '2026-01-01T00:00:00Z' : undefined}
						liveSlug={published ? 'hello' : undefined}
						derived={{}}
						atContainerRoot={false}
						atRoot={false}
						isHome={false}
						canBecomeHome={false}
						onToggleHome={() => {}}
						readOnly={false}
					/>
				)
			})
		}

		show('p1', true)
		clearSlug(container)
		expect(container.textContent).toContain(FROZEN_NOTICE)

		show('p2', false)
		expect(container.textContent).not.toContain(FROZEN_NOTICE)
	})

	it('should still clear the address of a page that was never published', () => {
		const container = renderPanel({})
		clearSlug(container)

		expect(container.textContent).not.toContain(FROZEN_NOTICE)
		expect(save).toHaveBeenCalledWith({ slug: null })
	})
})

// vim: ts=4
