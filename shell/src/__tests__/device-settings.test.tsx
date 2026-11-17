// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * "This device" backup settings: enabling a source asks about existing items (and a
 * dismissed dialog leaves it off), the relink alert, and the permission alert; actions
 * whose result is not a full state re-fetch it.
 */

import { jest } from '@jest/globals'
import { act, fireEvent, render, screen } from '@testing-library/react'
import * as React from 'react'

import type { BackupState } from '../native-bridge.js'
import { mockCloudilloReact, mockI18n } from './helpers/mocks.js'

function fixture(patch: Partial<BackupState> = {}): BackupState {
	return {
		permissions: { media: 'granted', notifications: true },
		relinkNeeded: false,
		globals: {
			defaultPreset: 'standard',
			defaultMobileData: false,
			requiresCharging: false,
			videosWifiOnly: true
		},
		sources: [
			{
				id: 'cam',
				kind: 'media',
				name: 'Camera',
				enabled: false,
				preset: null,
				mobileData: null,
				cutoffMs: null,
				newestFirst: true,
				counts: { total: 0, done: 0, pending: 0, failed: 0 }
			}
		],
		running: false,
		progress: null,
		...patch
	}
}

let state = fixture()
const backupApi = {
	estimate: jest.fn(async (_id: string) => ({ count: 3, bytes: 1024 })),
	enableSource: jest.fn(async (_id: string, _incl: boolean) => state),
	getState: jest.fn(async () => state),
	requestPermissions: jest.fn(async () => state.permissions)
}
const relinkDevice = jest.fn(async (_idTag: string) => {})
const toast = { error: jest.fn() }
const dialog = { ask: jest.fn(async (..._args: unknown[]): Promise<boolean | undefined> => true) }

await mockCloudilloReact({
	useAuth: () => [{ idTag: 'me.tld' }],
	useDialog: () => dialog,
	useToast: () => toast
})
mockI18n()

class DeviceAccountMismatchError extends Error {}
jest.unstable_mockModule('../native-bridge.js', () => ({
	backupApi,
	relinkDevice,
	DeviceAccountMismatchError,
	useBackupState: () => ({ state, setState: () => {}, error: undefined, refresh: () => {} })
}))
jest.unstable_mockModule('../settings/settings.js', () => ({
	SwitchRow: ({
		label,
		checked,
		onChange
	}: {
		label: string
		checked: boolean
		onChange: React.ChangeEventHandler<HTMLInputElement>
	}) => (
		<label>
			<input type="checkbox" checked={checked} onChange={onChange} />
			{label}
		</label>
	)
}))

const { DeviceSettings } = await import('../settings/device.js')

beforeEach(() => {
	jest.clearAllMocks()
	state = fixture()
})

/** Button fires onClick after its press animation. */
async function press(name: RegExp) {
	jest.useFakeTimers()
	try {
		fireEvent.click(screen.getByRole('button', { name }))
		await act(async () => {
			jest.advanceTimersByTime(300)
		})
	} finally {
		jest.useRealTimers()
	}
	// Let the action's promise chain settle
	await act(async () => {})
}

async function enableCamera() {
	render(<DeviceSettings />)
	await act(async () => {
		fireEvent.click(screen.getByLabelText('Camera'))
	})
}

describe('DeviceSettings', () => {
	it('enables a source with existing items once confirmed', async () => {
		await enableCamera()
		expect(backupApi.estimate).toHaveBeenCalledWith('cam')
		expect(dialog.ask).toHaveBeenCalled()
		expect(backupApi.enableSource).toHaveBeenCalledWith('cam', true)
	})

	it('leaves the source off when the dialog is dismissed', async () => {
		dialog.ask.mockResolvedValueOnce(undefined)
		await enableCamera()
		expect(dialog.ask).toHaveBeenCalled()
		expect(backupApi.enableSource).not.toHaveBeenCalled()
	})

	it('enables only new items when the user says so', async () => {
		dialog.ask.mockResolvedValueOnce(false)
		await enableCamera()
		expect(backupApi.enableSource).toHaveBeenCalledWith('cam', false)
	})

	it('shows the relink alert, relinks the signed-in account and re-fetches state', async () => {
		state = fixture({ relinkNeeded: true })
		render(<DeviceSettings />)
		expect(screen.getByText('Backup is paused')).toBeTruthy()
		await press(/Link again/)
		expect(relinkDevice).toHaveBeenCalledWith('me.tld')
		expect(backupApi.getState).toHaveBeenCalled()
	})

	it('explains a relink to a different account', async () => {
		relinkDevice.mockRejectedValueOnce(new DeviceAccountMismatchError())
		state = fixture({ relinkNeeded: true })
		render(<DeviceSettings />)
		await press(/Link again/)
		expect(toast.error).toHaveBeenCalledWith('This device is linked to a different account.')
		expect(backupApi.getState).not.toHaveBeenCalled()
	})

	it('re-fetches state after granting access', async () => {
		state = fixture({ permissions: { media: 'denied', notifications: true } })
		render(<DeviceSettings />)
		await press(/Grant access/)
		expect(backupApi.requestPermissions).toHaveBeenCalled()
		expect(backupApi.getState).toHaveBeenCalled()
	})

	it('warns when media access is denied', () => {
		state = fixture({ permissions: { media: 'denied', notifications: true } })
		render(<DeviceSettings />)
		expect(screen.getByText('No access to photos and videos')).toBeTruthy()
	})
})

// vim: ts=4
