// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/** mergeFileView: list-only fields survive a single-entry view, dropped fields do not */

import type * as Types from '@cloudillo/core'

import { mergeFileView } from '../apps/files/file-view.js'
import type { File } from '../apps/files/types.js'

const prev: File = {
	id: 'e1',
	contentId: 'c1',
	fileName: 'a.pdf',
	contentType: 'application/pdf',
	createdAt: '2026-01-01T00:00:00Z',
	preset: 'default',
	modifiedAt: '2026-01-02T00:00:00Z',
	accessLevel: 'write',
	tags: ['x']
} as File

const view = {
	id: 'e1',
	fileName: 'b.pdf',
	contentType: 'application/pdf',
	createdAt: '2026-01-01T00:00:00Z',
	status: 'active'
} as unknown as Types.FileView

describe('mergeFileView', () => {
	it('clears fields the server dropped, keeps list-only ones and the fallbacks', () => {
		const merged = mergeFileView(prev, view)
		expect(merged.fileName).toBe('b.pdf')
		expect(merged.modifiedAt).toBeUndefined()
		expect(merged.accessLevel).toBe('write')
		expect(merged.tags).toEqual(['x'])
		expect(merged.preset).toBe('default')
		expect(merged.contentId).toBe('c1')
	})
})
