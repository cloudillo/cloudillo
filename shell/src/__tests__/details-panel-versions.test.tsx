// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * DetailsPanel's Versions section (VersionsPanel): listing, load failure, the ⋯ menu actions
 * (Restore with Undo and the 412 conflict path, Restore as copy, Delete disabled on named
 * rows), the name line, the retention footer, "Show all", and its absence for readers and
 * non-BLOB entries.
 */

import { jest } from '@jest/globals'
import { act, fireEvent, render, screen } from '@testing-library/react'
import * as React from 'react'

import type { File, FileOps } from '../apps/files/types.js'
import { mockCloudilloReact, mockI18n, mockRealCore } from './helpers/mocks.js'

const version = {
	fileId: 'v1',
	replacedAt: '2026-01-02T03:04:00Z',
	replacedBy: 'Alice',
	size: 1024
}
const currentRow = {
	fileId: 'c1',
	replacedBy: 'Bob',
	size: 2048,
	current: true
}
const policy = { keepCount: 50, keepDays: 30, maxSizeMb: 100 }
const api = {
	idTag: 'me.tld',
	files: {
		versions: jest.fn(
			async (_id: string, _opts?: { current?: boolean }): Promise<unknown[]> => [version]
		),
		restoreVersion: jest.fn(async (_id: string, _fileId: string, _expected?: string) => ({
			id: 'e1'
		})),
		duplicate: jest.fn(async (_id: string, _data: unknown) => ({ id: 'e2' })),
		versionPolicy: jest.fn(async (_id: string): Promise<typeof policy> => policy),
		nameVersion: jest.fn(async (_id: string, _fileId: string, _name: string) => null),
		deleteVersion: jest.fn(async (_id: string, _fileId: string) => null),
		list: jest.fn(async () => [])
	}
}
const toast = { success: jest.fn(), error: jest.fn(), dismiss: jest.fn() }
const dialog = {
	askText: jest.fn(async (..._args: unknown[]): Promise<string | null> => null),
	confirm: jest.fn(async (..._args: unknown[]) => false)
}

// VersionsPanel's `instanceof FetchError` must see the same class the tests construct
const { FetchError } = await mockRealCore()
await mockCloudilloReact({ useToast: () => toast, useDialog: () => dialog })
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

const triggerFileDownload = jest.fn()
jest.unstable_mockModule('../apps/viewer/MediaViewer.js', () => ({
	triggerFileDownload,
	isViewerSupported: () => false
}))

const { DetailsPanel } = await import('../apps/files/components/DetailsPanel.js')

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

// mockI18n does not interpolate, so labels and messages are the raw keys
const MORE = 'More actions for version from {{time}}'
const FOOTER =
	'Unnamed versions are kept for {{count}} days (up to {{max}}). Named versions are kept until you remove the name.'

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
async function clickEl(el: HTMLElement) {
	await act(async () => {
		fireEvent.click(el)
		jest.advanceTimersByTime(300)
	})
}

async function click(name: string) {
	await clickEl(screen.getByRole('button', { name }))
}

/** Opens the ⋯ menu of row `row` and returns its item `name` */
async function menuItem(row: number, name: string | RegExp) {
	await clickEl(screen.getAllByRole('button', { name: MORE })[row])
	return screen.getByRole('menuitem', { name })
}

async function menuAction(row: number, name: string) {
	await clickEl(await menuItem(row, name))
}

beforeEach(() => {
	jest.clearAllMocks()
	// Some tests switch the list to one with a current row
	api.files.versions.mockResolvedValue([version])
	jest.useFakeTimers()
})

afterEach(() => {
	jest.useRealTimers()
})

describe('DetailsPanel versions', () => {
	it('lists earlier versions with the current row', async () => {
		await renderPanel()
		expect(api.files.versions).toHaveBeenCalledWith('e1', { current: true })
		expect(screen.getByText(/Alice/)).toBeTruthy()
		await clickEl(screen.getByRole('button', { name: 'Download version from {{time}}' }))
		expect(triggerFileDownload).toHaveBeenCalledWith(
			'me.tld',
			'v1',
			'report.pdf',
			expect.any(Function),
			'e1'
		)
		expect(screen.getAllByRole('button', { name: MORE })).toHaveLength(1)
	})

	it('says when there are no earlier versions', async () => {
		api.files.versions.mockResolvedValueOnce([currentRow])
		await renderPanel()
		expect(
			screen.getByText(
				'No earlier versions yet. Upload a new version to keep this one in history.'
			)
		).toBeTruthy()
		// The current row has no download and no Restore
		expect(screen.queryByRole('button', { name: 'Download version from {{time}}' })).toBeNull()
		await clickEl(screen.getByRole('button', { name: MORE }))
		expect(screen.queryByRole('menuitem', { name: 'Restore' })).toBeNull()
	})

	it('shows an error when versions fail to load', async () => {
		api.files.versions.mockRejectedValueOnce(new Error('boom'))
		jest.spyOn(console, 'error').mockImplementation(() => {})
		await renderPanel()
		expect(screen.getByText('Could not load versions. Please try again.')).toBeTruthy()
	})

	it('shows the name above the time on a named row', async () => {
		api.files.versions.mockResolvedValueOnce([{ ...version, name: 'Final draft' }])
		await renderPanel()
		const name = screen.getByText('Final draft')
		const time = document.querySelector('time')
		expect(time).toBeTruthy()
		expect(name.compareDocumentPosition(time as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
			Node.DOCUMENT_POSITION_FOLLOWING
		)
	})

	it('disables Delete on a named row', async () => {
		api.files.versions.mockResolvedValueOnce([{ ...version, name: 'Final draft' }])
		await renderPanel()
		const del = (await menuItem(0, /^Delete version/)) as HTMLButtonElement
		expect(del.disabled).toBe(true)
		expect(screen.getByText('Remove the name first')).toBeTruthy()
		expect(screen.getByRole('menuitem', { name: 'Rename…' })).toBeTruthy()
		expect(screen.getByRole('menuitem', { name: 'Remove name' })).toBeTruthy()
	})

	it('enables Delete on an unnamed row', async () => {
		await renderPanel()
		const del = (await menuItem(0, 'Delete version')) as HTMLButtonElement
		expect(del.disabled).toBe(false)
		expect(screen.getByRole('menuitem', { name: 'Name this version…' })).toBeTruthy()
	})

	it('restores a version and updates the row', async () => {
		const ops = await renderPanel()
		await menuAction(0, 'Restore')
		// No current row from the server: the row's contentId is the If-Match
		expect(api.files.restoreVersion).toHaveBeenCalledWith('e1', 'v1', 'c1')
		// Merged over the row: fields the response lacks (accessLevel) survive
		expect(ops.setFile).toHaveBeenCalledWith(
			expect.objectContaining({ id: 'e1', accessLevel: 'write' })
		)
		expect(toast.success.mock.calls[0][1]).toMatchObject({ actions: expect.anything() })
	})

	it('restores without If-Match or Undo when nothing names the current content', async () => {
		await renderPanel({ ...blob, contentId: null })
		await menuAction(0, 'Restore')
		expect(api.files.restoreVersion).toHaveBeenCalledWith('e1', 'v1', undefined)
		expect(toast.success.mock.calls[0][1]).toMatchObject({ actions: undefined })
	})

	it('reloads the list when the restore response has no contentId', async () => {
		await renderPanel()
		await menuAction(0, 'Restore')
		await act(async () => {})
		// setFile alone would not re-run the list effect (file.contentId unchanged)
		expect(api.files.versions).toHaveBeenCalledTimes(2)
	})

	it('keeps the loaded list when a reload fails', async () => {
		jest.spyOn(console, 'error').mockImplementation(() => {})
		dialog.confirm.mockResolvedValueOnce(true)
		await renderPanel()
		api.files.versions.mockRejectedValueOnce(new Error('boom'))
		await menuAction(0, 'Delete version')
		await act(async () => {})
		expect(api.files.versions).toHaveBeenCalledTimes(2)
		expect(screen.getByText(/Alice/)).toBeTruthy()
		expect(screen.queryByText('Could not load versions. Please try again.')).toBeNull()
	})

	it('dismisses the Undo toast when the panel unmounts', async () => {
		api.files.versions.mockResolvedValue([currentRow, version])
		toast.success.mockReturnValueOnce('t1')
		let unmount = () => {}
		await act(async () => {
			;({ unmount } = render(<DetailsPanel file={blob} fileOps={makeOps()} />))
		})
		await menuAction(1, 'Restore')
		expect(toast.dismiss).not.toHaveBeenCalled()
		unmount()
		expect(toast.dismiss).toHaveBeenCalledWith('t1')
	})

	it('dismisses the earlier Undo toast on a second restore', async () => {
		api.files.versions.mockResolvedValue([currentRow, version])
		toast.success.mockReturnValueOnce('t1').mockReturnValueOnce('t2')
		await renderPanel()
		await menuAction(1, 'Restore')
		expect(toast.dismiss).not.toHaveBeenCalled()
		await menuAction(1, 'Restore')
		expect(toast.dismiss).toHaveBeenCalledWith('t1')
		expect(toast.dismiss).not.toHaveBeenCalledWith('t2')
	})

	it('locks the row menu during Undo and ignores a second Undo', async () => {
		api.files.versions.mockResolvedValue([currentRow, version])
		let finish = () => {}
		api.files.restoreVersion
			.mockResolvedValueOnce({ id: 'e1', contentId: 'v1' } as { id: string })
			.mockImplementationOnce(
				() =>
					new Promise((resolve) => {
						finish = () => resolve({ id: 'e1', contentId: 'c1' } as { id: string })
					})
			)
		await renderPanel()
		await menuAction(1, 'Restore')
		const opts = toast.success.mock.calls[0][1] as { actions: React.ReactNode }
		await act(async () => {
			render(<div>{opts.actions}</div>)
		})
		await click('Undo')
		const more = screen.getAllByRole('button', { name: MORE }) as HTMLButtonElement[]
		expect(more.every((b) => b.disabled)).toBe(true)
		await click('Undo')
		expect(api.files.restoreVersion).toHaveBeenCalledTimes(2)
		await act(async () => {
			finish()
		})
		expect(
			(screen.getAllByRole('button', { name: MORE }) as HTMLButtonElement[]).some(
				(b) => b.disabled
			)
		).toBe(false)
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
		await menuAction(0, 'Restore')
		expect(ops.setFile).toHaveBeenCalledWith(
			expect.objectContaining({ contentId: 'c2', tags: ['red'], owner })
		)
	})

	it('restores with Undo, and Undo restores the previous current version', async () => {
		api.files.versions.mockResolvedValue([currentRow, version])
		await renderPanel()
		await menuAction(1, 'Restore')
		expect(api.files.restoreVersion).toHaveBeenCalledWith('e1', 'v1', 'c1')
		const [message, opts] = toast.success.mock.calls[0] as [
			string,
			{ duration: number; actions: React.ReactNode }
		]
		expect(message).toBe('Restored version from {{time}}')
		expect(opts.duration).toBe(0)
		await act(async () => {
			render(<div>{opts.actions}</div>)
		})
		await click('Undo')
		expect(api.files.restoreVersion).toHaveBeenLastCalledWith('e1', 'c1', 'v1')
		expect(toast.dismiss).toHaveBeenCalled()
		expect(toast.success).toHaveBeenLastCalledWith('Version restored')
	})

	it('reloads and shows the conflict toast on 412', async () => {
		api.files.versions.mockResolvedValue([currentRow, version])
		api.files.restoreVersion.mockRejectedValueOnce(
			new FetchError('E-CORE-PRECONDITION', 'Precondition failed', 412)
		)
		const ops = await renderPanel()
		expect(api.files.versions).toHaveBeenCalledTimes(1)
		await menuAction(1, 'Restore')
		await act(async () => {})
		expect(api.files.versions).toHaveBeenCalledTimes(2)
		expect(toast.error).toHaveBeenCalledWith(
			'The file changed while you were looking. The list is up to date now.'
		)
		expect(ops.setFile).not.toHaveBeenCalled()
	})

	it('restores a version as a dated copy', async () => {
		await renderPanel()
		await menuAction(0, 'Restore as copy')
		expect(api.files.duplicate).toHaveBeenCalledWith(
			'e1',
			expect.objectContaining({
				fromVersion: 'v1',
				fileName: expect.stringMatching(/\(as of .*\)\.pdf$/)
			})
		)
	})

	it('shows the retention footer from the policy', async () => {
		await renderPanel()
		expect(api.files.versionPolicy).toHaveBeenCalledWith('e1')
		expect(screen.getByText(FOOTER)).toBeTruthy()
	})

	it('hides the retention footer when the policy fails', async () => {
		api.files.versionPolicy.mockRejectedValueOnce(new Error('boom'))
		await renderPanel()
		expect(screen.queryByText(FOOTER)).toBeNull()
	})

	it('shows 20 rows, then all after "Show all"', async () => {
		api.files.versions.mockResolvedValueOnce(
			Array.from({ length: 25 }, (_, i) => ({ ...version, fileId: `v${i}` }))
		)
		await renderPanel()
		expect(screen.getAllByRole('button', { name: MORE })).toHaveLength(20)
		await click('Show all ({{n}})')
		expect(screen.getAllByRole('button', { name: MORE })).toHaveLength(25)
		expect(screen.queryByRole('button', { name: 'Show all ({{n}})' })).toBeNull()
	})

	it('names a version with the trimmed name and reloads', async () => {
		dialog.askText.mockResolvedValueOnce('  Final  ')
		await renderPanel()
		await menuAction(0, 'Name this version…')
		await act(async () => {})
		expect(api.files.nameVersion).toHaveBeenCalledWith('e1', 'v1', 'Final')
		expect(api.files.versions).toHaveBeenCalledTimes(2)
	})

	it('does not name a version when cancelled or unchanged', async () => {
		api.files.versions.mockResolvedValue([{ ...version, name: 'Final' }])
		await renderPanel()
		dialog.askText.mockResolvedValueOnce(null)
		await menuAction(0, 'Rename…')
		dialog.askText.mockResolvedValueOnce(' Final ')
		await menuAction(0, 'Rename…')
		await act(async () => {})
		expect(api.files.nameVersion).not.toHaveBeenCalled()
	})

	it('removes a name only after confirming', async () => {
		api.files.versions.mockResolvedValue([{ ...version, name: 'Final' }])
		await renderPanel()
		dialog.confirm.mockResolvedValueOnce(false)
		await menuAction(0, 'Remove name')
		await act(async () => {})
		expect(api.files.nameVersion).not.toHaveBeenCalled()
		dialog.confirm.mockResolvedValueOnce(true)
		await menuAction(0, 'Remove name')
		await act(async () => {})
		// An empty name unnames: the backend has only the PUT
		expect(api.files.nameVersion).toHaveBeenCalledWith('e1', 'v1', '')
	})

	it('disables Restore while the file is processing', async () => {
		await renderPanel({ ...blob, status: 'pending' })
		const restore = (await menuItem(0, /^Restore(?! as copy)/)) as HTMLButtonElement
		expect(restore.disabled).toBe(true)
	})

	it('hides naming and deleting when the policy says 403', async () => {
		api.files.versions.mockResolvedValue([currentRow, version])
		api.files.versionPolicy.mockRejectedValueOnce(
			new FetchError('E-CORE-FORBIDDEN', 'Forbidden', 403)
		)
		await renderPanel()
		// The current row has nothing left, so no ⋯ at all
		expect(screen.getAllByRole('button', { name: MORE })).toHaveLength(1)
		await clickEl(screen.getByRole('button', { name: MORE }))
		expect(screen.queryByRole('menuitem', { name: 'Name this version…' })).toBeNull()
		expect(screen.queryByRole('menuitem', { name: 'Delete version' })).toBeNull()
		expect(screen.getByRole('menuitem', { name: 'Restore' })).toBeTruthy()
	})

	it('deletes a version after confirming and reloads', async () => {
		dialog.confirm.mockResolvedValueOnce(true)
		await renderPanel()
		await menuAction(0, 'Delete version')
		await act(async () => {})
		expect(api.files.deleteVersion).toHaveBeenCalledWith('e1', 'v1')
		expect(api.files.versions).toHaveBeenCalledTimes(2)
	})

	it('toasts when delete or naming fails', async () => {
		jest.spyOn(console, 'error').mockImplementation(() => {})
		dialog.confirm.mockResolvedValueOnce(true)
		api.files.deleteVersion.mockRejectedValueOnce(new Error('boom'))
		await renderPanel()
		await menuAction(0, 'Delete version')
		await act(async () => {})
		expect(toast.error).toHaveBeenCalledWith('Failed to delete version')
		dialog.askText.mockResolvedValueOnce('X')
		api.files.nameVersion.mockRejectedValueOnce(new Error('boom'))
		await menuAction(0, 'Name this version…')
		await act(async () => {})
		expect(toast.error).toHaveBeenCalledWith('Failed to name version')
	})

	it('locks the row menu while a delete runs', async () => {
		let finish = () => {}
		api.files.deleteVersion.mockImplementationOnce(
			() =>
				new Promise<null>((resolve) => {
					finish = () => resolve(null)
				})
		)
		dialog.confirm.mockResolvedValueOnce(true)
		await renderPanel()
		await menuAction(0, 'Delete version')
		await act(async () => {})
		const more = () => screen.getByRole('button', { name: MORE }) as HTMLButtonElement
		expect(more().disabled).toBe(true)
		await act(async () => {
			finish()
		})
		expect(more().disabled).toBe(false)
	})

	it('Undo uses the restored content id and handles a 412', async () => {
		api.files.versions.mockResolvedValue([currentRow, version])
		api.files.restoreVersion
			.mockResolvedValueOnce({ id: 'e1', contentId: 'cX' } as { id: string })
			.mockRejectedValueOnce(
				new FetchError('E-CORE-PRECONDITION', 'Precondition failed', 412)
			)
		await renderPanel()
		await menuAction(1, 'Restore')
		const opts = toast.success.mock.calls[0][1] as { actions: React.ReactNode }
		await act(async () => {
			render(<div>{opts.actions}</div>)
		})
		const loads = api.files.versions.mock.calls.length
		await click('Undo')
		await act(async () => {})
		expect(api.files.restoreVersion).toHaveBeenLastCalledWith('e1', 'c1', 'cX')
		expect(toast.error).toHaveBeenCalledWith(
			'The file changed while you were looking. The list is up to date now.'
		)
		expect(api.files.versions.mock.calls.length).toBeGreaterThan(loads)
	})

	it('keeps the preset the restore response lacks', async () => {
		// convertFileView's fallbacks for an absent preset / contentId
		api.files.restoreVersion.mockResolvedValueOnce({
			id: 'e1',
			preset: '',
			contentId: null
		} as unknown as { id: string })
		const ops = await renderPanel({ ...blob, preset: 'p1' })
		await menuAction(0, 'Restore')
		expect(ops.setFile).toHaveBeenCalledWith(
			expect.objectContaining({ preset: 'p1', contentId: 'c1' })
		)
	})

	it('hides the oversize note when maxSizeMb is 0', async () => {
		api.files.versions.mockResolvedValue([currentRow])
		api.files.versionPolicy.mockResolvedValueOnce({ ...policy, maxSizeMb: 0 })
		await renderPanel()
		expect(
			screen.queryByText('Files over {{n}} MB keep earlier versions only when named')
		).toBeNull()
	})

	it('offers "Upload new version" when the picker is wired, and calls it with the file', async () => {
		const ops = makeOps()
		const pickNewVersion = jest.fn()
		await renderPanel(blob, { ...ops, pickNewVersion })
		await click('Upload new version')
		expect(pickNewVersion).toHaveBeenCalledWith(blob)
	})

	it('hides "Upload new version" without a picker', async () => {
		await renderPanel()
		expect(screen.queryByRole('button', { name: 'Upload new version' })).toBeNull()
	})

	it('disables "Upload new version" while the content is processing', async () => {
		const pickNewVersion = jest.fn()
		await renderPanel({ ...blob, contentId: '@42' }, { ...makeOps(), pickNewVersion })
		const btn = screen.getByRole('button', { name: 'Upload new version' })
		expect(btn.hasAttribute('disabled') || btn.getAttribute('aria-disabled') === 'true').toBe(
			true
		)
		await clickEl(btn)
		expect(pickNewVersion).not.toHaveBeenCalled()
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
