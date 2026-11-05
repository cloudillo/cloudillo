// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * The slash menu under the Hungarian dictionary. Built-ins are told apart by `key`: a
 * filter on the English title would let the upload items back in next to the media
 * picker's own. The order: headings, lists, the rest of the text group,
 * Paragraph last, and each group once, because the menu prints a heading per change.
 */

import { TextDecoder, TextEncoder } from 'node:util'
import { BlockNoteEditor } from '@blocknote/core'
import type { DefaultReactSuggestionItem } from '@blocknote/react'
import { jest } from '@jest/globals'
import * as React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

import { hu } from '../editor/locales/hu.js'
import type { NotilloEditor } from '../editor/schema.js'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// jsdom lacks these, and react-router, under `@cloudillo/react`, reads them on import.
Object.assign(globalThis, { TextDecoder, TextEncoder })

// The real module under it: the schema's graph reaches for more than `useTranslation`.
const i18n = await import('react-i18next')

jest.unstable_mockModule('react-i18next', () => ({
	...i18n,
	useTranslation: () => ({ t: (key: string) => key })
}))

const { notilloSchema } = await import('../editor/schema.js')
const { useMediaHandler } = await import('../editor/useMediaHandler.js')

type Item = DefaultReactSuggestionItem & { key: string }

const editor = BlockNoteEditor.create({
	schema: notilloSchema,
	dictionary: hu
}) as unknown as NotilloEditor

function menu(query: string, readOnly = false): Item[] {
	let getItems: ReturnType<typeof useMediaHandler>['getSlashMenuItems'] | undefined
	function Probe() {
		getItems = useMediaHandler({ editor, ownerTag: 'me.tld', readOnly }).getSlashMenuItems
		return null
	}
	const root = createRoot(document.createElement('div'))
	act(() => root.render(<Probe />))
	const items = getItems?.(editor, query) as Item[]
	act(() => root.unmount())
	return items
}

describe('getSlashMenuItems', () => {
	it('lists the menu in its decided order, with search-only groups left out', () => {
		expect(menu('').map((item) => item.key)).toEqual([
			'heading',
			'heading_2',
			'heading_3',
			'bullet_list',
			'numbered_list',
			'check_list',
			'toggle_list',
			'quote',
			'code_block',
			'divider',
			'index',
			'paragraph',
			'table',
			'image',
			'video',
			'audio',
			'document',
			'emoji'
		])
	})

	it('prints each group once', () => {
		const runs = menu('')
			.map((item) => item.group)
			.filter((group, i, groups) => group !== groups[i - 1])

		expect(new Set(runs).size).toBe(runs.length)
	})

	it('replaces the upload built-ins with the media picker under a translated dictionary', () => {
		const items = menu('')

		expect(items.filter((item) => item.key === 'image')).toHaveLength(1)
		expect(items.find((item) => item.key === 'image')?.title).toBe(hu.slash_menu.image.title)
		expect(items.some((item) => item.key === 'file')).toBe(false)
	})

	it('finds the search-only groups by query', () => {
		const keys = menu('címsor').map((item) => item.key)

		expect(keys).toEqual(expect.arrayContaining(['heading_4', 'heading_5', 'heading_6']))
	})

	it('gives every item an icon', () => {
		expect(menu('').every((item) => React.isValidElement(item.icon))).toBe(true)
	})

	it('offers no inserts that need the picker to a read-only user', () => {
		const keys = menu('', true).map((item) => item.key)

		expect(keys).not.toContain('image')
		expect(keys).not.toContain('index')
		expect(keys).not.toContain('document')
	})
})

// vim: ts=4
