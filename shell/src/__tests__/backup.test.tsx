// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * Site-admin backup page: status rendering, a 409 "already running", the poll that
 * starts once "Run backup now" is accepted, and the denied state.
 */

import { jest } from '@jest/globals'
import { act, fireEvent, render, screen } from '@testing-library/react'
import * as React from 'react'

import type { BackupStatus } from '../../../libs/core/src/index.js'
import { mockCloudilloReact, mockI18n, mockRealCore } from './helpers/mocks.js'

const STATUS: BackupStatus = {
	running: false,
	last: { at: 1_700_000_000, ok: true, bytes: 2048 },
	snapshots: [{ name: 'snap-1.tar.zst', createdAt: 1_700_000_000, bytes: 1536 }]
}

const api = {
	admin: {
		backupStatus: jest.fn<() => Promise<BackupStatus>>(),
		runBackup: jest.fn<() => Promise<void>>()
	}
}
const dialog = { tell: jest.fn(async (_title: string, _msg: string) => {}) }
const settingsHook = { settings: {}, onSettingChange: jest.fn(), denied: false }

const { FetchError } = await mockRealCore()
await mockCloudilloReact({
	useApi: () => ({ api }),
	useDialog: () => dialog
})
mockI18n()

jest.unstable_mockModule('../settings/settings.js', () => ({
	useSettings: () => settingsHook,
	SettingsDenied: () => <div>denied</div>
}))

const { Backup } = await import('../site-admin/backup.js')

describe('Backup', () => {
	beforeEach(() => {
		api.admin.backupStatus.mockReset().mockResolvedValue(STATUS)
		api.admin.runBackup.mockReset()
		dialog.tell.mockClear()
		settingsHook.denied = false
	})

	it('renders the snapshot list and the last run', async () => {
		render(<Backup />)
		await screen.findByText('snap-1.tar.zst')
		expect(screen.getByText('1.5 KB')).toBeTruthy()
		expect(screen.getByText('Last run: {{time}}, {{size}}')).toBeTruthy()
	})

	describe('Run backup now', () => {
		// Fake timers: Button fires onClick after its press animation, and the poll is 5 s
		beforeEach(() => {
			jest.useFakeTimers()
		})
		afterEach(() => {
			jest.useRealTimers()
		})

		async function clickRun() {
			await act(async () => {})
			fireEvent.click(screen.getByRole('button', { name: /Run backup now/ }))
			await act(async () => {
				jest.advanceTimersByTime(300)
			})
		}

		it('tells the admin when a backup is already running', async () => {
			api.admin.runBackup.mockRejectedValue(new FetchError('x', 'x', 409))
			render(<Backup />)
			await clickRun()
			expect(dialog.tell).toHaveBeenCalledWith('Backup', 'A backup is already running.')
		})

		it('shows Running and polls after a run is accepted', async () => {
			api.admin.runBackup.mockResolvedValue(undefined)
			render(<Backup />)
			await clickRun()
			expect(api.admin.backupStatus).toHaveBeenCalledTimes(1)
			expect(screen.getByText('Running')).toBeTruthy()
			await act(async () => {
				jest.advanceTimersByTime(5000)
			})
			expect(api.admin.backupStatus).toHaveBeenCalledTimes(2)
		})
	})

	it('renders SettingsDenied when denied', () => {
		settingsHook.denied = true
		render(<Backup />)
		expect(screen.getByText('denied')).toBeTruthy()
	})
})

// vim: ts=4
