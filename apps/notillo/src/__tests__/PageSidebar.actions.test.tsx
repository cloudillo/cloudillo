// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * The sidebar's row actions: F2 and the `⋯` menu, the `+` ghost row, and the hand-over
 * of a new home page to its title. OpalUI and the search panel are stubbed away, and
 * the stubs forward what these actions need.
 */

import type { RtdbClient } from '@cloudillo/rtdb'
import { jest } from '@jest/globals'
import * as React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

import type { PageWithId } from '../publish/tree.js'
import { ROOT_PARENT } from '../rtdb/types.js'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
// jsdom has no `CSS`; `closeRename` escapes the page id with it.
;(globalThis as unknown as { CSS: { escape: (s: string) => string } }).CSS = {
	escape: (s) => s
}

jest.unstable_mockModule('react-i18next', () => ({
	useTranslation: () => ({ t: (key: string) => key })
}))

const passthrough = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>

/** What `dialog.confirm` answers. */
let confirmed = false

// the real generic icon concepts, so the mock never lacks an `Ic*` the app imports
const icons = await import('@cloudillo/react/icons')

jest.unstable_mockModule('@cloudillo/react', () => ({
	...icons,
	ActionSheet: passthrough,
	ActionSheetDivider: () => <hr />,
	ActionSheetItem: passthrough,
	AvatarGroup: passthrough,
	Button: ({
		children,
		onClick,
		'aria-label': ariaLabel
	}: {
		children?: React.ReactNode
		onClick?: () => void
		'aria-label'?: string
	}) => (
		<button type="button" aria-label={ariaLabel} onClick={onClick}>
			{children}
		</button>
	),
	InlineEditForm: ({
		onSave,
		onCancel
	}: {
		onSave: (value: string) => void
		onCancel: () => void
	}) => (
		<form data-rename="">
			<button type="button" data-save="" onClick={() => onSave('Renamed')} />
			<button type="button" data-cancel="" onClick={onCancel} />
		</form>
	),
	LoadingSpinner: () => <span />,
	Menu: passthrough,
	MenuDivider: () => <hr />,
	MenuItem: ({ label, onClick }: { label: string; onClick: () => void }) => (
		<button type="button" role="menuitem" onClick={onClick}>
			{label}
		</button>
	),
	Modal: passthrough,
	PresenceAvatar: () => <span />,
	TreeItem: ({
		id,
		label,
		actions,
		children,
		onSelect,
		onKeyDown
	}: {
		id: string
		label?: React.ReactNode
		actions?: React.ReactNode
		children?: React.ReactNode
		onSelect?: () => void
		onKeyDown?: React.KeyboardEventHandler
	}) => (
		<div data-tree-item-id={id} tabIndex={-1} onKeyDown={onKeyDown}>
			<div data-row="" onClick={onSelect}>
				{label}
			</div>
			{actions}
			{children}
		</div>
	),
	TreeView: passthrough,
	useDialog: () => ({ tell: async () => undefined, confirm: async () => confirmed }),
	useIsMobile: () => false,
	useOutsideClick: () => {},
	usePresence: () => ({ entries: [] })
}))

jest.unstable_mockModule('../pages/PageSearchPanel.js', () => ({
	PageSearchPanel: ({ renderTree }: { renderTree: () => React.ReactNode }) => <>{renderTree()}</>
}))

jest.unstable_mockModule('../pages/useConsistencyCheck.js', () => ({
	useConsistencyCheck: () => async () => undefined
}))

const createPage = jest.fn<(...args: unknown[]) => Promise<string>>(async () => 'new')
const onRenamePage = jest.fn<(pageId: string, title: string) => Promise<boolean>>(async () => true)
const deletePage = jest.fn<(...args: unknown[]) => Promise<void>>(async () => {})
const pageOps = await import('../rtdb/page-ops.js')

jest.unstable_mockModule('../rtdb/page-ops.js', () => ({
	...pageOps,
	createPage,
	deletePage
}))

const { PageSidebar } = await import('../pages/PageSidebar.js')

const page = (id: string): PageWithId =>
	({ id, title: id, parentPageId: ROOT_PARENT, order: 0 }) as unknown as PageWithId

function renderSidebar(props: { siteMode?: boolean; homePageId?: string } = {}) {
	const container = document.createElement('div')
	document.body.append(container)
	const root = createRoot(container)
	const onSelectPage = jest.fn<(id: string, opts?: { justCreated?: boolean }) => void>()
	const onExpand = jest.fn<(id: string) => void>()
	const onSetHome = jest.fn<(id: string, opts?: { justCreated?: boolean }) => Promise<void>>(
		async () => {}
	)
	act(() => {
		root.render(
			<PageSidebar
				client={{} as RtdbClient}
				pages={new Map([['p1', page('p1')]])}
				expanded={new Set()}
				unfiledPage={null}
				onExpand={onExpand}
				onToggleExpand={() => {}}
				activePageId="p1"
				onSelectPage={onSelectPage}
				onRenamePage={onRenamePage}
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
				siteMode={!!props.siteMode}
				homePageId={props.homePageId}
				onSetHome={onSetHome}
				onClearHome={async () => {}}
				homeBusy={false}
			/>
		)
	})
	const row = container.querySelector('[data-tree-item-id="p1"]') as HTMLElement
	return {
		container,
		row,
		onSelectPage,
		onExpand,
		onSetHome,
		rename: () => container.querySelector('[data-rename]'),
		button(name: string) {
			const found = [...container.querySelectorAll('button')].find(
				(b) => b.textContent === name || b.getAttribute('aria-label') === name
			)
			if (!found) throw new Error(`no button "${name}"`)
			return found
		},
		pressF2() {
			act(() => {
				row.dispatchEvent(
					new KeyboardEvent('keydown', { key: 'F2', bubbles: true, cancelable: true })
				)
			})
		},
		unmount() {
			act(() => root.unmount())
			container.remove()
		}
	}
}

const click = (el: Element) =>
	act(async () => {
		el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
	})

const nextFrame = () =>
	act(async () => {
		await new Promise((resolve) => requestAnimationFrame(resolve))
	})

describe('PageSidebar row actions', () => {
	beforeEach(() => {
		createPage.mockClear()
		onRenamePage.mockClear()
	})

	it('F2 opens the rename field, and saving writes the new title', async () => {
		const view = renderSidebar()
		expect(view.rename()).toBeNull()

		view.pressF2()
		expect(view.rename()).not.toBeNull()

		await click(view.container.querySelector('[data-save]') as Element)
		expect(onRenamePage).toHaveBeenCalledWith('p1', 'Renamed')
		expect(view.rename()).toBeNull()
		view.unmount()
	})

	it('still writes a rename while a delete runs', async () => {
		let finish = () => {}
		deletePage.mockImplementationOnce(
			() =>
				new Promise<void>((resolve) => {
					finish = resolve
				})
		)
		confirmed = true
		const view = renderSidebar()

		await click(view.row.querySelector('.page-tree-action') as Element)
		await click(view.button('Delete'))
		expect(deletePage).toHaveBeenCalledTimes(1)

		view.pressF2()
		await click(view.container.querySelector('[data-save]') as Element)
		expect(onRenamePage).toHaveBeenCalledWith('p1', 'Renamed')

		await act(async () => finish())
		confirmed = false
		view.unmount()
	})

	it('gives the focus back to the row when the rename closes', async () => {
		const view = renderSidebar()

		view.pressF2()
		await click(view.container.querySelector('[data-cancel]') as Element)
		await nextFrame()

		expect(document.activeElement).toBe(view.row)
		view.unmount()
	})

	it('the ghost row creates a subpage and hands it to the title', async () => {
		const view = renderSidebar()
		const ghost = view.container.querySelector(
			'[data-tree-item-id="ghost:p1"] [data-row]'
		) as Element

		await click(ghost)

		expect(createPage.mock.calls[0]?.[3]).toBe('p1')
		expect(view.onExpand).toHaveBeenCalledWith('p1')
		expect(view.onSelectPage).toHaveBeenCalledWith('new', { justCreated: true })
		view.unmount()
	})

	it('the ghost row makes one page while a create is pending, and another after', async () => {
		let finish = (_id: string) => {}
		createPage.mockImplementationOnce(
			() =>
				new Promise<string>((resolve) => {
					finish = resolve
				})
		)
		const view = renderSidebar()
		const ghost = view.container.querySelector(
			'[data-tree-item-id="ghost:p1"] [data-row]'
		) as Element

		await click(ghost)
		await click(ghost)
		expect(createPage).toHaveBeenCalledTimes(1)

		await act(async () => finish('new'))
		await click(ghost)
		expect(createPage).toHaveBeenCalledTimes(2)
		view.unmount()
	})

	it('the ghost row under the home page creates a top-level page', async () => {
		createPage.mockClear()
		const view = renderSidebar({ siteMode: true, homePageId: 'p1' })
		const ghost = view.container.querySelector(
			'[data-tree-item-id="ghost:p1"] [data-row]'
		) as Element

		await click(ghost)

		expect(createPage.mock.calls[0]?.[3]).toBe(ROOT_PARENT)
		expect(view.onExpand).not.toHaveBeenCalled()
		expect(view.onSelectPage).toHaveBeenCalledWith('new', { justCreated: true })
		view.unmount()
	})

	it('the ⋯ menu offers Rename, Add subpage and Delete', async () => {
		const view = renderSidebar()

		await click(view.row.querySelector('.page-tree-action') as Element)

		const items = [...view.container.querySelectorAll('[role="menuitem"]')].map(
			(item) => item.textContent
		)
		expect(items).toEqual(expect.arrayContaining(['Rename', 'Add subpage', 'Delete']))
		view.unmount()
	})

	it('hands a new home page to its title', async () => {
		const view = renderSidebar({ siteMode: true })

		await click(view.button('Choose a page…'))
		await click(view.button('Create a home page'))

		expect(view.onSetHome).toHaveBeenCalledWith('new', { justCreated: true })
		expect(view.onSelectPage).toHaveBeenCalledWith('new', { justCreated: true })
		view.unmount()
	})
})

// vim: ts=4
