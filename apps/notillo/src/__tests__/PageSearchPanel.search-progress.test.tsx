// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * The panel's page-content search runs behind the title match, so with one title
 * hit on screen the list looks final for roughly 450ms (input debounce +
 * QUERY_DEBOUNCE_MS + RTT) before it silently grows an "In page content" group.
 * The pending affordance therefore has to live outside the empty branch.
 *
 * Both assertions read `data-testid` rather than the rendered copy: the keys *are*
 * the English strings here, so an assertion on the text would fail on a wording
 * change that alters nothing about the behaviour under test.
 */

import type { RtdbClient } from '@cloudillo/rtdb'
import { jest } from '@jest/globals'
import * as React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

import type { SearchResult } from '../utils/search.js'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// No i18next instance in the suite, and the panel only reads `t` for copy.
jest.unstable_mockModule('react-i18next', () => ({
	useTranslation: () => ({ t: (key: string) => key })
}))

// the real generic icon concepts, so the mock never lacks an `Ic*` the app imports
const icons = await import('@cloudillo/react/icons')

// Exactly what `PageSearchPanel` and `SearchResultRow` import between them.
jest.unstable_mockModule('@cloudillo/react', () => ({
	...icons,
	Button: ({ children }: { children?: React.ReactNode }) => (
		<button type="button">{children}</button>
	),
	// The match offsets are not what this suite reads; the row's text is.
	Highlight: ({ text }: { text: string }) => <>{text}</>,
	LoadingSpinner: () => <span />,
	SearchInput: React.forwardRef<
		HTMLInputElement,
		React.ComponentProps<'input'> & { shortcut?: string }
	>(({ shortcut: _shortcut, ...props }, ref) => <input ref={ref} {...props} />)
}))

const { PageSearchPanel } = await import('../pages/PageSearchPanel.js')

function titleHit(id: string, title: string): SearchResult {
	return { id, title, kind: 'title', path: [] }
}

function render(props: {
	pending: boolean
	results: SearchResult[]
	tags?: Set<string>
	activeTags?: Set<string>
	onSearchChange?: (query: string) => void
	onToggleTag?: (tag: string) => void
}) {
	const container = document.createElement('div')
	document.body.append(container)
	const root = createRoot(container)
	act(() => {
		root.render(
			<PageSearchPanel
				client={{} as RtdbClient}
				userId="me.tld"
				readOnly={false}
				pages={new Map()}
				activePageId={undefined}
				onSelectPage={() => {}}
				searchQuery="alpha"
				onSearchChange={props.onSearchChange ?? (() => {})}
				filteredResults={props.results}
				resultsTruncated={false}
				isFiltering={true}
				contentSearchPending={props.pending}
				onRetryContentSearch={() => {}}
				focusSearchSeq={0}
				onSearchActivate={() => {}}
				recentPageIds={[]}
				tags={props.tags ?? new Set()}
				tagCounts={new Map()}
				activeTags={props.activeTags ?? new Set()}
				onToggleTag={props.onToggleTag ?? (() => {})}
				onClearTags={() => {}}
				onCreateFailed={async () => {}}
				renderTree={() => null}
			/>
		)
	})
	return {
		has: (testId: string) => container.querySelector(`[data-testid="${testId}"]`) !== null,
		clickRow(title: string) {
			const row = container.querySelector<HTMLElement>(`[title="${title}"]`)
			act(() => row?.click())
		},
		unmount() {
			act(() => root.unmount())
			container.remove()
		}
	}
}

describe('PageSearchPanel content-search progress', () => {
	it('shows the pending affordance even when a title already matched', () => {
		const view = render({ pending: true, results: [titleHit('p1', 'Alpha')] })

		expect(view.has('content-search-pending')).toBe(true)

		view.unmount()
	})

	it('does not call an empty-but-still-searching list "no matching pages"', () => {
		const view = render({ pending: true, results: [] })

		expect(view.has('content-search-pending')).toBe(true)
		expect(view.has('no-results')).toBe(false)

		view.unmount()
	})
})

describe('PageSearchPanel tag rows', () => {
	function pickTag(activeTags: Set<string>) {
		const onSearchChange = jest.fn<(query: string) => void>()
		const onToggleTag = jest.fn<(tag: string) => void>()
		const view = render({
			pending: false,
			results: [],
			tags: new Set(['alpha']),
			activeTags,
			onSearchChange,
			onToggleTag
		})
		view.clickRow('#alpha')
		view.unmount()
		return { onSearchChange, onToggleTag }
	}

	it('swaps the typed query for the tag filter', () => {
		const { onSearchChange, onToggleTag } = pickTag(new Set())

		expect(onSearchChange).toHaveBeenCalledWith('')
		expect(onToggleTag).toHaveBeenCalledWith('alpha')
	})

	it('keeps the query when turning an active tag off', () => {
		const { onSearchChange, onToggleTag } = pickTag(new Set(['alpha']))

		expect(onSearchChange).not.toHaveBeenCalled()
		expect(onToggleTag).toHaveBeenCalledWith('alpha')
	})
})

// vim: ts=4
