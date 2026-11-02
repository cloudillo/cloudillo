// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { DialogContainer } from '@cloudillo/react'
import * as React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import * as Y from 'yjs'

import { openPublication } from '../crdt/document.js'
// Interpolates `{{n}}` in the (untranslated, English) keys.
import '../i18n.js'
import { newSectionMap, newStyleMap, sectionOf } from '../crdt/entities.js'
import type { StoredSection, StoredStyle } from '../crdt/stored-types.js'
import type { LayoutState } from '../layout/useLayout.js'
import { SectionsList } from '../view/SectionsList.js'

const g = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean; ResizeObserver?: unknown }
g.IS_REACT_ACT_ENVIRONMENT = true
g.ResizeObserver ??= class {
	observe() {}
	disconnect() {}
}

/** Past `Button`'s 200 ms press animation and the queued frames. */
const frames = () => act(() => new Promise((r) => setTimeout(r, 300)))

/**
 * Sections A (pages 1–2) and B (page 3), page 3 in view. `bTitle`: B is unnamed and its story
 * holds a heading paragraph with that text.
 */
function mount(
	editable: boolean,
	opts: { onGo?: (id: string, story: string) => void; overset?: unknown[]; bTitle?: string } = {}
) {
	document.body.replaceChildren()
	const yDoc = new Y.Doc()
	const doc = openPublication(yDoc)
	doc.st.set('h', newStyleMap({ k: 'p', name: 'H', props: { tocLevel: 1 } } as StoredStyle))
	for (const [id, name] of [
		['a', 'A'],
		['b', opts.bTitle === undefined ? 'B' : undefined]
	] as const) {
		const tx = new Y.Text()
		doc.tx.set(id, tx)
		if (id === 'b' && opts.bTitle !== undefined)
			tx.applyDelta([{ insert: opts.bTitle }, { insert: '\n', attributes: { ps: 'h' } }])
		doc.s.set(id, newSectionMap({ story: id, name } as StoredSection))
	}
	doc.secs.push(['a', 'b'])
	const layout = {
		pages: new Map(),
		sections: [
			{ id: 'a', pages: 2 },
			{ id: 'b', pages: 1 }
		],
		overset: opts.overset ?? []
	} as unknown as LayoutState
	const host = document.createElement('div')
	document.body.append(host)
	const root = createRoot(host)
	act(() => {
		root.render(
			<>
				<SectionsList
					yDoc={yDoc}
					doc={doc}
					layout={layout}
					current={2}
					editable={editable}
					onGo={opts.onGo ?? (() => {})}
					onSettings={() => {}}
				/>
				<DialogContainer />
			</>
		)
	})
	return { host, yDoc, doc, unmount: () => act(() => root.unmount()) }
}

const rowOf = (host: HTMLElement, id: string) =>
	host.querySelector<HTMLElement>(`[data-sec="${id}"]`)

/** Open row `id`'s ⋮ menu; the menu items by label. */
async function openMenu(host: HTMLElement, id: string) {
	act(() => {
		rowOf(host, id)
			?.parentElement?.querySelector<HTMLElement>('[aria-label="Section actions"]')
			?.click()
	})
	await frames()
	return (label: string) =>
		[...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
			(e) => e.textContent === label
		)
}

const isDisabled = (e: HTMLElement | undefined) =>
	e?.getAttribute('aria-disabled') === 'true' || (e as HTMLButtonElement | undefined)?.disabled

it('renders one row per section, the current one marked', () => {
	const { host, unmount } = mount(true)
	const rows = [...host.querySelectorAll<HTMLElement>('[data-sec]')]
	expect(rows.map((r) => r.querySelector('.pagillo-sec-name')?.textContent)).toEqual(['A', 'B'])
	expect(rows.map((r) => r.getAttribute('aria-current'))).toEqual([null, 'location'])
	expect(host.querySelectorAll('[aria-label="Section actions"]')).toHaveLength(2)
	expect(host.textContent).toContain('New section')
	unmount()
})

it('Rename… from the row menu: the input mounts after the menu closes and keeps focus', async () => {
	const { host, doc, unmount } = mount(true)
	act(() => {
		host.querySelector<HTMLElement>('[aria-label="Section actions"]')?.click()
	})
	await frames()
	const item = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
		(e) => e.textContent === 'Rename…'
	)
	act(() => {
		item?.click()
	})
	// Mount (flushed as `act` ends), then the input's own focus frame.
	await frames()
	await frames()
	const input = host.querySelector<HTMLInputElement>('input[aria-label="Name"]')
	expect(input).not.toBeNull()
	expect(document.activeElement).toBe(input)
	expect(doc.s.get('a')?.get('name')).toBe('A')
	unmount()
})

it('read-only: no actions, no "New section"', () => {
	const { host, unmount } = mount(false)
	expect(host.querySelectorAll('[data-sec]')).toHaveLength(2)
	expect(host.querySelector('[aria-label="Section actions"]')).toBeNull()
	expect(host.textContent).not.toContain('New section')
	unmount()
})

it('Alt+↓ moves a row down; Alt+↑ on the first row does nothing', () => {
	const { host, doc, unmount } = mount(true)
	const key = (id: string, k: string) =>
		act(() => {
			rowOf(host, id)?.dispatchEvent(
				new KeyboardEvent('keydown', { key: k, altKey: true, bubbles: true })
			)
		})
	key('a', 'ArrowUp')
	expect(doc.secs.toArray()).toEqual(['a', 'b'])
	key('a', 'ArrowDown')
	expect(doc.secs.toArray()).toEqual(['b', 'a'])
	unmount()
})

it('Move up / Move down are disabled at the ends', async () => {
	const { host, unmount } = mount(true)
	let item = await openMenu(host, 'a')
	expect(isDisabled(item('Move up'))).toBe(true)
	expect(isDisabled(item('Move down'))).toBe(false)
	act(() => {
		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
	})
	await frames()
	item = await openMenu(host, 'b')
	expect(isDisabled(item('Move up'))).toBe(false)
	expect(isDisabled(item('Move down'))).toBe(true)
	unmount()
})

it('Duplicate inserts "<name> (copy)" right after the source', async () => {
	const { host, doc, unmount } = mount(true)
	const item = await openMenu(host, 'a')
	act(() => {
		item('Duplicate')?.click()
	})
	const ids = doc.secs.toArray()
	expect(ids).toHaveLength(3)
	expect(sectionOf(doc, ids[1] ?? '')?.name).toBe('A (copy)')
	unmount()
})

it('Insert section below goes to the next index and jumps there', async () => {
	const went: unknown[][] = []
	const { host, doc, unmount } = mount(true, { onGo: (...a) => went.push(a) })
	const item = await openMenu(host, 'a')
	act(() => {
		item('Insert section below')?.click()
	})
	const ids = doc.secs.toArray()
	expect(ids).toHaveLength(3)
	expect(ids[0]).toBe('a')
	expect(went).toEqual([[ids[1], sectionOf(doc, ids[1] ?? '')?.story]])
	unmount()
})

it('"New section" appends', async () => {
	const { host, doc, unmount } = mount(true)
	act(() => {
		;[...host.querySelectorAll<HTMLElement>('button')]
			.find((b) => b.textContent?.includes('New section'))
			?.click()
	})
	await frames()
	const ids = doc.secs.toArray()
	expect(ids).toHaveLength(3)
	expect(ids.slice(0, 2)).toEqual(['a', 'b'])
	unmount()
})

it('overset badge and page-range meta', () => {
	const { host, unmount } = mount(false, { overset: [{ sec: 'a' }] })
	expect(rowOf(host, 'a')?.textContent).toContain('Overset')
	expect(rowOf(host, 'b')?.textContent).not.toContain('Overset')
	expect(rowOf(host, 'a')?.querySelector('.pagillo-sec-meta')?.textContent).toBe('pp. 1–2')
	expect(rowOf(host, 'b')?.querySelector('.pagillo-sec-meta')?.textContent).toBe('p. 3')
	unmount()
})

it('a heading-derived name follows story typing', () => {
	const { host, doc, unmount } = mount(false, { bTitle: 'Title' })
	const name = () => rowOf(host, 'b')?.querySelector('.pagillo-sec-name')?.textContent
	expect(name()).toBe('Title')
	act(() => {
		;(doc.tx.get('b') as Y.Text).insert(0, 'New ')
	})
	expect(name()).toBe('New Title')
	unmount()
})

it('leaving the rename field by blur does not pull focus back to the row', async () => {
	const { host, unmount } = mount(true)
	const item = await openMenu(host, 'a')
	act(() => {
		item('Rename…')?.click()
	})
	await frames()
	await frames()
	const input = host.querySelector<HTMLInputElement>('input[aria-label="Name"]')
	expect(document.activeElement).toBe(input)
	act(() => {
		input?.blur()
	})
	await frames()
	expect(host.querySelector('input[aria-label="Name"]')).toBeNull()
	expect(document.activeElement).not.toBe(rowOf(host, 'a'))
	unmount()
})

it('Remove asks first, then deletes the section', async () => {
	const { host, doc, unmount } = mount(true)
	const item = await openMenu(host, 'a')
	act(() => {
		item('Remove')?.click()
	})
	await frames()
	expect(doc.secs.toArray()).toEqual(['a', 'b'])
	const ok = [...document.querySelectorAll<HTMLElement>('dialog button')].find(
		(b) => b.textContent === 'OK'
	)
	expect(ok).toBeDefined()
	act(() => {
		ok?.click()
	})
	await frames()
	expect(doc.secs.toArray()).toEqual(['b'])
	unmount()
})

// vim: ts=4
