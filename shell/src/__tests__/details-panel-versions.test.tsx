// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * DetailsPanel's Versions section: listing, load failure, Restore (updates the row via
 * setFile), Restore as copy (duplicate with fromVersion), and its absence for readers and
 * non-BLOB entries.
 */

import { jest } from '@jest/globals'
import { act, fireEvent, render, screen } from '@testing-library/react'
import * as React from 'react'

import type { File, FileOps } from '../apps/files/types.js'
import { mockCloudilloReact, mockI18n } from './helpers/mocks.js'

const version = {
	fileId: 'v1',
	replacedAt: '2026-01-02T03:04:00Z',
	replacedBy: 'Alice',
	size: 1024
}
const api = {
	files: {
		versions: jest.fn(async (_id: string): Promise<unknown[]> => [version]),
		restoreVersion: jest.fn(async (_id: string, _fileId: string) => ({ id: 'e1' })),
		duplicate: jest.fn(async (_id: string, _data: unknown) => ({ id: 'e2' })),
		versionUrl: (id: string, fileId: string) => `https://x/${id}/${fileId}`,
		list: jest.fn(async () => [])
	}
}

await mockCloudilloReact({ useToast: () => ({ success: jest.fn(), error: jest.fn() }) })
mockI18n()

jest.unstable_mockModule('../context/index.js', () => ({
	useCurrentContextIdTag: () => 'me.tld'
}))
jest.unstable_mockModule('../apps/files/hooks/useFileOwnerScope.js', () => ({
	useFileOwnerScope: () => ({
		api,
		isCrossOwner: false,
		upstreamIdTag: undefined,
		scopedId: 'c1',
		scopeIdTag: 'me.tld',
		resolving: false,
		canManageFile: false
	})
}))
jest.unstable_mockModule('../apps/files/hooks/useFileAccess.js', () => ({
	useFileAccess: () => ({ access: undefined, error: undefined })
}))
jest.unstable_mockModule('../apps/files/hooks/useFileList.js', () => ({
	convertFileView: (f: unknown) => f
}))
jest.unstable_mockModule('../apps/files/components/AccessList.js', () => ({
	AccessList: () => null
}))
jest.unstable_mockModule('../apps/files/components/LocationChip.js', () => ({
	LocationChip: () => null
}))
jest.unstable_mockModule('../apps/files/components/TagsCell.js', () => ({
	TagsCell: () => null
}))

const { DetailsPanel, versionCopyParts } = await import('../apps/files/components/DetailsPanel.js')

const blob: File = {
	id: 'e1',
	contentId: 'c1',
	fileName: 'report.pdf',
	fileType: 'BLOB',
	contentType: 'application/pdf',
	createdAt: '2026-01-01T00:00:00Z',
	preset: 'default',
	parentId: null,
	path: [],
	accessLevel: 'write'
}

function makeOps() {
	return { setFile: jest.fn(), openFile: jest.fn() } as unknown as FileOps & {
		setFile: jest.Mock
	}
}

async function renderPanel(file: File = blob, fileOps = makeOps()) {
	await act(async () => {
		render(<DetailsPanel file={file} fileOps={fileOps} />)
	})
	return fileOps
}

/** Button fires onClick after its ~200ms press animation */
async function click(name: string) {
	await act(async () => {
		fireEvent.click(screen.getByRole('button', { name }))
		jest.advanceTimersByTime(300)
	})
}

beforeEach(() => {
	jest.clearAllMocks()
	jest.useFakeTimers()
})

afterEach(() => {
	jest.useRealTimers()
})

describe('versionCopyParts', () => {
	const at = '2026-03-04T05:06:00Z'
	it('splits on the last dot only', () => {
		expect(versionCopyParts('report.pdf', at)).toMatchObject({ stem: 'report', ext: '.pdf' })
		expect(versionCopyParts('README', at)).toMatchObject({ stem: 'README', ext: '' })
		expect(versionCopyParts('.env', at)).toMatchObject({ stem: '.env', ext: '' })
		expect(versionCopyParts('a.tar.gz', at)).toMatchObject({ stem: 'a.tar', ext: '.gz' })
	})

	it('formats the date without : or /', () => {
		expect(versionCopyParts('a', at).date).toMatch(/^\d{4}-\d\d-\d\d \d\d\.\d\d$/)
	})

	it('never yields NaN for an invalid date', () => {
		const { date } = versionCopyParts('a', 'bogus:12/3')
		expect(date).not.toContain('NaN')
		expect(date).not.toMatch(/[:/]/)
	})
})

describe('DetailsPanel versions', () => {
	it('lists earlier versions', async () => {
		await renderPanel()
		expect(api.files.versions).toHaveBeenCalledWith('e1')
		expect(screen.getByText(/Replaced by/)).toBeTruthy()
		expect(screen.getByRole('button', { name: 'Restore' })).toBeTruthy()
	})

	it('says when there are no earlier versions', async () => {
		api.files.versions.mockResolvedValueOnce([])
		await renderPanel()
		expect(screen.getByText('No earlier versions')).toBeTruthy()
	})

	it('shows an error when versions fail to load', async () => {
		api.files.versions.mockRejectedValueOnce(new Error('boom'))
		jest.spyOn(console, 'error').mockImplementation(() => {})
		await renderPanel()
		expect(screen.getByText('Could not load versions. Please try again.')).toBeTruthy()
	})

	it('restores a version and updates the row', async () => {
		const ops = await renderPanel()
		await click('Restore')
		expect(api.files.restoreVersion).toHaveBeenCalledWith('e1', 'v1')
		// Merged over the row: fields the response lacks (accessLevel) survive
		expect(ops.setFile).toHaveBeenCalledWith(
			expect.objectContaining({ id: 'e1', accessLevel: 'write' })
		)
	})

	it('keeps tags/owner the restore response lacks', async () => {
		// convertFileView yields undefined keys for absent fields; they must not overwrite the row
		api.files.restoreVersion.mockResolvedValueOnce({
			id: 'e1',
			contentId: 'c2',
			tags: undefined,
			owner: undefined
		} as { id: string })
		const owner = { idTag: 'bob.tld', name: 'Bob' }
		const ops = await renderPanel({ ...blob, tags: ['red'], owner })
		await click('Restore')
		expect(ops.setFile).toHaveBeenCalledWith(
			expect.objectContaining({ contentId: 'c2', tags: ['red'], owner })
		)
	})

	it('restores a version as a dated copy', async () => {
		await renderPanel()
		await click('Restore as copy')
		expect(api.files.duplicate).toHaveBeenCalledWith(
			'e1',
			expect.objectContaining({
				fromVersion: 'v1',
				fileName: expect.stringMatching(/\(as of .*\)\.pdf$/)
			})
		)
	})

	it('has no Versions panel for a reader or a non-BLOB entry', async () => {
		await renderPanel({ ...blob, accessLevel: 'read' })
		expect(screen.queryByText('Versions')).toBeNull()
		await renderPanel({ ...blob, id: 'e3', fileType: 'FLDR' })
		expect(screen.queryByText('Versions')).toBeNull()
		expect(api.files.versions).not.toHaveBeenCalled()
	})
})

// vim: ts=4
