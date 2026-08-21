// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The sidebar tree, walked with a `pp` cycle in it.
 *
 * The home row renders the *top level* as its children, so a home page whose own
 * stored `pp` points at a top-level page closes a loop: that page renders home, which
 * renders the top level, which renders that page again. Reachable by two clients
 * racing — one promotes X to home while the other files X under Y — and by any
 * out-of-band write. Unguarded, the walk recurses until the stack goes.
 *
 * Only the walk is exercised here; OpalUI and the search panel are stubbed away.
 */

import type { RtdbClient } from '@cloudillo/rtdb'
import { jest } from '@jest/globals'
import * as React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

import type { PageWithId } from '../publish/tree.js'
import { ROOT_PARENT } from '../rtdb/types.js'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

jest.unstable_mockModule('react-i18next', () => ({
	useTranslation: () => ({ t: (key: string) => key })
}))

const passthrough = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>

jest.unstable_mockModule('@cloudillo/react', () => ({
	ActionSheet: passthrough,
	ActionSheetItem: passthrough,
	AvatarGroup: passthrough,
	Button: ({ children }: { children?: React.ReactNode }) => (
		<button type="button">{children}</button>
	),
	LoadingSpinner: () => <span />,
	Menu: passthrough,
	MenuItem: passthrough,
	Modal: passthrough,
	PresenceAvatar: () => <span />,
	// `data-page-id` is how the assertion below counts rows.
	TreeItem: ({
		id,
		label,
		children
	}: {
		id: string
		label?: React.ReactNode
		children?: React.ReactNode
	}) => (
		<div data-page-id={id}>
			{label}
			{children}
		</div>
	),
	TreeView: passthrough,
	useDialog: () => ({ tell: async () => undefined, confirm: async () => false }),
	useIsMobile: () => false,
	useOutsideClick: () => {},
	usePresence: () => ({ entries: [] })
}))

// The tree is rendered *through* the search panel, as its `renderTree` prop.
jest.unstable_mockModule('../pages/PageSearchPanel.js', () => ({
	PageSearchPanel: ({ renderTree }: { renderTree: () => React.ReactNode }) => <>{renderTree()}</>
}))

jest.unstable_mockModule('../pages/useConsistencyCheck.js', () => ({
	useConsistencyCheck: () => async () => undefined
}))

const { PageSidebar } = await import('../pages/PageSidebar.js')

const page = (id: string, parentPageId: string | undefined): PageWithId =>
	({ id, title: id, parentPageId, order: 0 }) as unknown as PageWithId

/** `home` is filed under `p1`, and `p1` is top-level — which is home's own child row. */
function cyclicPages(): Map<string, PageWithId> {
	return new Map([
		['home', page('home', 'p1')],
		['p1', page('p1', ROOT_PARENT)]
	])
}

function renderSidebar() {
	const container = document.createElement('div')
	document.body.append(container)
	act(() => {
		createRoot(container).render(
			<PageSidebar
				client={{} as RtdbClient}
				pages={cyclicPages()}
				// Both rows open: the cycle is only walked through expanded rows.
				expanded={new Set(['home', 'p1'])}
				unfiledPage={null}
				onExpand={() => {}}
				onToggleExpand={() => {}}
				activePageId="p1"
				onSelectPage={() => {}}
				userId="me.example"
				readOnly={false}
				tags={new Set()}
				tagCounts={new Map()}
				activeTags={new Set()}
				onToggleTag={() => {}}
				onClearTags={() => {}}
				searchQuery=""
				onSearchChange={() => {}}
				filteredResults={[]}
				resultsTruncated={false}
				isFiltering={false}
				contentSearchPending={false}
				onRetryContentSearch={() => {}}
				focusSearchSeq={0}
				onSearchActivate={() => {}}
				recentPageIds={[]}
				siteMode={true}
				homePageId="home"
				onSetHome={async () => {}}
				onClearHome={async () => {}}
				homeBusy={false}
			/>
		)
	})
	return container
}

describe('PageSidebar — a cycle in the stored tree', () => {
	it('should render each page once instead of recursing', () => {
		const container = renderSidebar()

		expect(container.querySelectorAll('[data-page-id="home"]')).toHaveLength(1)
		expect(container.querySelectorAll('[data-page-id="p1"]')).toHaveLength(1)
	})
})

// vim: ts=4
