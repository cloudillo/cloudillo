// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * Settings → Privacy "Download my data": request → poll while pending → download.
 */

import { jest } from '@jest/globals'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import * as React from 'react'

import type { ExportStatus } from '../../../libs/core/src/index.js'
import { mockCloudilloReact, mockI18n, mockRealCore } from './helpers/mocks.js'

const PENDING: ExportStatus = { status: 'pending', createdAt: '2026-01-01T00:00:00Z' }
const READY: ExportStatus = { status: 'ready', createdAt: '2026-01-01T00:00:00Z', size: 2048 }

const api = {
	auth: {
		getExport: jest.fn<() => Promise<ExportStatus>>(),
		requestExport: jest.fn<() => Promise<ExportStatus>>(),
		downloadExport: jest.fn<() => Promise<Blob>>()
	}
}
const API_HOOK = { api }
const toast = { error: jest.fn(), success: () => {}, info: () => {}, warning: () => {} }

const { FetchError } = await mockRealCore()
await mockCloudilloReact({
	useApi: () => API_HOOK,
	useToast: () => toast
})
mockI18n()

const { DataExportPanel } = await import('../settings/privacy.js')

const notFound = () => new FetchError('E', 'none', 404)

describe('DataExportPanel', () => {
	beforeEach(() => {
		for (const fn of Object.values(api.auth)) fn.mockReset()
		toast.error.mockClear()
	})

	afterEach(() => {
		jest.useRealTimers()
	})

	it('without an export, offers a request', async () => {
		api.auth.getExport.mockRejectedValue(notFound())
		render(<DataExportPanel />)
		expect(
			(await screen.findByRole<HTMLButtonElement>('button', { name: 'Request export' }))
				.disabled
		).toBe(false)
	})

	it('hides itself on a 403', async () => {
		api.auth.getExport.mockRejectedValue(new FetchError('E', 'denied', 403))
		const { container } = render(<DataExportPanel />)
		await waitFor(() => expect(api.auth.getExport).toHaveBeenCalled())
		expect(container.textContent).toBe('')
	})

	it('requests, then polls until ready', async () => {
		jest.useFakeTimers()
		api.auth.getExport.mockRejectedValueOnce(notFound()).mockResolvedValue(READY)
		api.auth.requestExport.mockResolvedValue(PENDING)
		render(<DataExportPanel />)
		fireEvent.click(await screen.findByRole('button', { name: 'Request export' }))
		await screen.findByText('Preparing your archive...')
		await act(async () => {
			await jest.advanceTimersByTimeAsync(5000)
		})
		await screen.findByRole('button', { name: 'Download' })
	})

	it('a 409 on request shows the pending export instead of an error', async () => {
		api.auth.getExport.mockRejectedValueOnce(notFound()).mockResolvedValue(PENDING)
		api.auth.requestExport.mockRejectedValue(new FetchError('E', 'pending', 409))
		render(<DataExportPanel />)
		fireEvent.click(await screen.findByRole('button', { name: 'Request export' }))
		await screen.findByText('Preparing your archive...')
		expect(toast.error).not.toHaveBeenCalled()
	})

	it('download fetches the archive and refreshes the status', async () => {
		const url = URL as unknown as { createObjectURL?: unknown; revokeObjectURL?: unknown }
		url.createObjectURL ??= () => 'blob:x'
		url.revokeObjectURL ??= () => {}
		api.auth.getExport.mockResolvedValueOnce(READY).mockRejectedValue(notFound())
		api.auth.downloadExport.mockResolvedValue(new Blob(['zip']))
		render(<DataExportPanel />)
		fireEvent.click(await screen.findByRole('button', { name: 'Download' }))
		await waitFor(() => expect(api.auth.downloadExport).toHaveBeenCalled())
		await screen.findByRole('button', { name: 'Request export' })
		expect(api.auth.getExport).toHaveBeenCalledTimes(2)
	})
})

// vim: ts=4
