// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * What `cacheFiles` files a row under.
 *
 * The cache reproduces one tenant's `GET /api/files` listing offline, and
 * `createCachedFileFetchPage` queries it by the tenant it asked. A mirrored row
 * (`upstream` set) is still that tenant's row, so keying it by `upstream.idTag`
 * makes it a dead write: never listed, and first out under eviction.
 */

// Not a global in ESM mode, unlike describe/it/expect.
import { jest } from '@jest/globals'

import type { FileView } from '@cloudillo/core'

interface PutRecord {
	indexFields: Record<string, unknown>
	payload: FileView
	cacheKey: string
}

const putRecords = jest.fn<(store: string, records: PutRecord[]) => Promise<void>>()
const queryRecords =
	jest.fn<
		(
			store: string,
			query: { indexName: string; range: unknown },
			limit?: number
		) => Promise<FileView[]>
	>()

jest.unstable_mockModule('../cache/encrypted-store.js', () => ({
	putRecords,
	queryRecords
}))

// node env has no IndexedDB; the key range is just the key here
;(globalThis as { IDBKeyRange?: unknown }).IDBKeyRange ??= { only: (k: unknown) => k }

const { cacheFiles, getCachedFileByFileId } = await import('../cache/file-cache.js')

const SCOPE = 'bob.org'

function file(over: Partial<FileView> = {}): FileView {
	return {
		entryId: 'e1',
		fileId: 'f1~abc',
		status: 'A',
		contentType: 'cloudillo/quillo',
		fileName: 'Notes',
		createdAt: '2026-01-01T00:00:00Z',
		...over
	} as FileView
}

describe('cacheFiles keying', () => {
	beforeEach(() => putRecords.mockReset())

	it('files a mirrored row under the serving tenant, not its upstream', async () => {
		await cacheFiles(SCOPE, [
			file({ owner: { idTag: SCOPE }, upstream: { idTag: 'alice.org' } })
		])

		const [, records] = putRecords.mock.calls[0]
		expect(records[0].cacheKey).toBe(`${SCOPE}:e1`)
		expect(records[0].indexFields.ownerIdTag).toBe(SCOPE)
	})

	// `owner` is authority since backend migration 49: a community member's own file
	// carries the member's idTag while being served by the community.
	it('ignores the owner profile too', async () => {
		await cacheFiles(SCOPE, [file({ owner: { idTag: 'member.org' } })])

		const [, records] = putRecords.mock.calls[0]
		expect(records[0].cacheKey).toBe(`${SCOPE}:e1`)
		expect(records[0].indexFields.ownerIdTag).toBe(SCOPE)
	})
})

describe('getCachedFileByFileId', () => {
	beforeEach(() => queryRecords.mockReset())

	it('looks the content id up through the by-owner-file index', async () => {
		const row = file()
		queryRecords.mockResolvedValueOnce([row])
		expect(await getCachedFileByFileId(SCOPE, 'f1~abc')).toBe(row)
		expect(queryRecords).toHaveBeenCalledWith(
			'files',
			{ indexName: 'by-owner-file', range: [SCOPE, 'f1~abc'] },
			1
		)

		queryRecords.mockResolvedValueOnce([])
		expect(await getCachedFileByFileId(SCOPE, 'missing')).toBeNull()
	})
})

// vim: ts=4
