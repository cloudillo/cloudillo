// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

import type { LayoutState } from '../layout/useLayout.js'
import { PageList, type PageListProps, pageDomId, scrollToPage } from '../view/PageList.js'

const rect = (top: number, height: number) => ({ top, height }) as DOMRect

/** A stub recording its calls' first argument. */
function spy() {
	const calls: unknown[] = []
	return Object.assign((a: unknown) => void calls.push(a), { calls })
}

/** A `.pagillo-pages` scroller (top 0, 1000 px high) holding page `k` at `top`. */
function setup(top: number, scroller = true) {
	document.body.replaceChildren()
	const page = document.createElement('div')
	page.id = pageDomId('k')
	page.getBoundingClientRect = () => rect(top, 400)
	const intoView = spy()
	page.scrollIntoView = intoView
	const box = document.createElement('div')
	box.className = 'pagillo-pages'
	box.getBoundingClientRect = () => rect(0, 1000)
	const scrollBy = spy()
	box.scrollBy = scrollBy as typeof box.scrollBy
	if (scroller) box.append(page)
	document.body.append(scroller ? box : page)
	return { intoView, scrollBy }
}

describe('scrollToPage', () => {
	it('smooth-scrolls the page into view by default', () => {
		const { intoView, scrollBy } = setup(2500)
		scrollToPage('k')
		expect(intoView.calls).toEqual([{ block: 'start', behavior: 'smooth' }])
		expect(scrollBy.calls).toEqual([])
	})

	it('with `jumpFar`: smooth within two screens, instant beyond', () => {
		const near = setup(1500)
		scrollToPage('k', undefined, true)
		expect(near.scrollBy.calls).toEqual([{ top: 1500, behavior: 'smooth' }])
		const far = setup(2500)
		scrollToPage('k', undefined, true)
		expect(far.scrollBy.calls).toEqual([{ top: 2500, behavior: 'instant' }])
	})

	it('centres the `frac` spot of the page', () => {
		const { scrollBy } = setup(500)
		scrollToPage('k', 0.25)
		// 500 + 400 * 0.25 - 1000 / 2
		expect(scrollBy.calls).toEqual([{ top: 100, behavior: 'smooth' }])
	})

	it('falls back to scrollIntoView without a scroller', () => {
		const { intoView, scrollBy } = setup(300, false)
		scrollToPage('k')
		expect(intoView.calls).toEqual([{ block: 'start', behavior: 'smooth' }])
		expect(scrollBy.calls).toEqual([])
	})
})

describe('PageList pointer', () => {
	type Call = Parameters<NonNullable<PageListProps['onPagePointer']>>
	const g = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean; ResizeObserver?: unknown }
	g.IS_REACT_ACT_ENVIRONMENT = true
	g.ResizeObserver ??= class {
		observe() {}
		disconnect() {}
	}
	// A one-page section, not laid out yet.
	const layout = {
		pages: new Map(),
		sections: [{ id: 's', pages: 1 }],
		pending: false,
		glyphDefs: new Map(),
		setViewport: () => {}
	} as unknown as LayoutState

	function mount(dragScroll: boolean) {
		document.body.replaceChildren()
		const calls: Call[0][] = []
		const events: Call[2][] = []
		const host = document.createElement('div')
		document.body.append(host)
		const root = createRoot(host)
		act(() => {
			root.render(
				<PageList
					layout={layout}
					zoom={100}
					defaultPage={{ w: 600, h: 800 }}
					src={{} as PageListProps['src']}
					canEdit
					emptyImages={new Map()}
					onCurrent={() => {}}
					onZoomPct={() => {}}
					onPagePointer={(type, _hit, e) => {
						calls.push(type)
						events.push(e)
					}}
					dragScroll={dragScroll}
				/>
			)
		})
		const pages = host.querySelector('.pagillo-pages') as HTMLElement
		// jsdom has no pointer capture: the pages always hold it.
		pages.hasPointerCapture = () => true
		// MouseEvent: a plain Event has no clientX / clientY (no page hit).
		const fire = (el: Element, type: string, init: MouseEventInit = {}) =>
			act(() => {
				el.dispatchEvent(new MouseEvent(type, { bubbles: true, ...init }))
			})
		return { calls, events, pages, fire, unmount: () => act(() => root.unmount()) }
	}

	it('forwards pointercancel as cancel', () => {
		const { calls, pages, fire, unmount } = mount(false)
		fire(pages, 'pointercancel')
		expect(calls).toEqual(['cancel'])
		unmount()
	})

	it('re-runs the move on a scroll during a move drag', () => {
		const { calls, pages, fire, unmount } = mount(true)
		fire(pages, 'pointermove')
		expect(calls).toEqual(['move'])
		fire(pages, 'scroll')
		expect(calls).toEqual(['move', 'move'])
		unmount()
	})

	it('re-runs the move with the new Alt state on an Alt key during a move drag', () => {
		const { calls, events, pages, fire, unmount } = mount(true)
		fire(pages, 'pointermove', { altKey: true })
		expect(events[0].altKey).toBe(true)
		act(() => {
			window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Alt' }))
		})
		expect(calls).toEqual(['move', 'move'])
		expect(events[1].altKey).toBe(false)
		expect(events[1].clientX).toBe(events[0].clientX)
		unmount()
	})
})
