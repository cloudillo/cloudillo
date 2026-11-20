// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * `useUploadQueue` replacement items go to `files.replaceContent` (not `uploadBlob`), skip
 * `onUploadComplete`, and map a 412 to the "changed while uploading" message; and
 * `mergeFileView` keeps list-only fields a single-entry FileView lacks.
 *
 * `.test.tsx` so jest gives this suite the jsdom environment (see jest.config.cjs).
 */

import { jest } from '@jest/globals'
import { act, renderHook, waitFor } from '@testing-library/react'

import type { File } from '../apps/files/types.js'
import { mockI18n, mockRealCore } from './helpers/mocks.js'

const { UploadError } = await mockRealCore()
mockI18n()

const api = {
	files: {
		uploadBlob: jest.fn(async (..._args: unknown[]) => ({ contentId: 'x' })),
		replaceContent: jest.fn(
			async (..._args: unknown[]): Promise<{ entryId: string; pendingFileId: string }> => ({
				entryId: 'e1',
				pendingFileId: '@1'
			})
		)
	}
}
jest.unstable_mockModule('../context/index.js', () => ({
	useContextAwareApi: () => ({ api })
}))

const { useUploadQueue } = await import('../apps/files/hooks/useUploadQueue.js')
const { mergeFileView } = await import('../apps/files/file-view.js')

const picked = new globalThis.File(['x'], 'new.pdf', { type: 'application/pdf' })

beforeEach(() => {
	jest.clearAllMocks()
})

describe('useUploadQueue replacements', () => {
	it('calls replaceContent with If-Match id and no onUploadComplete', async () => {
		const onUploadComplete = jest.fn()
		const { result } = renderHook(() => useUploadQueue({ onUploadComplete }))
		act(() => result.current.addReplacement(picked, 'e1', 'c1'))
		await waitFor(() => expect(result.current.queue[0]?.status).toBe('complete'))
		expect(api.files.replaceContent).toHaveBeenCalledWith('e1', picked, 'c1', {
			contentType: 'application/pdf'
		})
		expect(api.files.uploadBlob).not.toHaveBeenCalled()
		expect(onUploadComplete).not.toHaveBeenCalled()
	})

	it('reports a 412 as a conflict', async () => {
		api.files.replaceContent.mockRejectedValueOnce(
			new UploadError('server', 'Precondition failed', 412)
		)
		const { result } = renderHook(() => useUploadQueue())
		act(() => result.current.addReplacement(picked, 'e1', 'c1'))
		await waitFor(() => expect(result.current.queue[0]?.status).toBe('error'))
		expect(result.current.queue[0].error).toBe(
			'This file changed while you were uploading. Try again.'
		)
	})
})

describe('mergeFileView', () => {
	it('keeps list-only fields and takes the new content', () => {
		const row = {
			id: 'e1',
			contentId: 'c1',
			fileName: 'a.pdf',
			contentType: 'application/pdf',
			createdAt: '2026-01-01T00:00:00Z',
			preset: 'default',
			accessLevel: 'write',
			tags: ['x']
		} as File
		const view = {
			fileId: 'e1',
			contentId: 'c2',
			fileName: 'a.pdf',
			contentType: 'application/pdf',
			createdAt: '2026-01-01T00:00:00Z',
			size: 99
		} as unknown as Parameters<typeof mergeFileView>[1]
		const merged = mergeFileView(row, view) as File & { size?: number }
		expect(merged.contentId).toBe('c2')
		expect(merged.size).toBe(99)
		expect(merged.accessLevel).toBe('write')
		expect(merged.tags).toEqual(['x'])
		expect(merged.preset).toBe('default')
	})
})

// vim: ts=4
