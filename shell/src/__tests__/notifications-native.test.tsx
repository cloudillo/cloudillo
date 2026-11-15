// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * Notification settings inside the Android app: the push switch follows native push
 * state (device key, distributors) instead of Web Push.
 */

import { jest } from '@jest/globals'
import { act, fireEvent, render, screen } from '@testing-library/react'
import * as React from 'react'

import type { PushState } from '../native-bridge.js'
import type { UsePWA } from '../pwa.js'
import { mockCloudilloReact, mockI18n } from './helpers/mocks.js'

const PUSH_LABEL = 'Enable push notifications on this device'

function pushState(patch: Partial<PushState> = {}): PushState {
	return {
		enabled: false,
		permission: true,
		hasDeviceKey: true,
		distributors: 1,
		distributor: 'ntfy',
		subscribed: false,
		...patch
	}
}

let current = pushState()
const pushApi = {
	getState: jest.fn(async () => current),
	enable: jest.fn(async () => ({ ...current, enabled: true })),
	disable: jest.fn(async () => ({ ...current, enabled: false }))
}

await mockCloudilloReact({
	useApi: () => ({ api: null }),
	useAuth: () => [{ idTag: 'me.tld' }],
	useToast: () => ({ error: jest.fn() })
})
mockI18n()

jest.unstable_mockModule('../native-bridge.js', () => ({
	isNativeApp: () => true,
	ensureDeviceKey: async () => {},
	getNativeInfo: async () => ({}),
	pushApi
}))
jest.unstable_mockModule('../lib/room-mute.js', () => ({
	useMutedRooms: () => ({ muted: [], unmute: () => {} })
}))
jest.unstable_mockModule('../notifications/useLocalNotifySettings.js', () => ({
	useLocalNotifySettings: () => ({ settings: {}, updateSetting: () => {} })
}))
jest.unstable_mockModule('../settings/settings.js', () => ({
	isPushAllowed: () => true,
	useSettings: () => ({ settings: {}, onSettingChange: () => {}, refresh: () => {} }),
	SwitchRow: ({
		label,
		description,
		...props
	}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; description?: string }) => (
		<div>
			<label>
				<input type="checkbox" {...props} />
				{label}
			</label>
			{description && <p>{description}</p>}
		</div>
	)
}))

const { NotificationSettings } = await import('../settings/notifications.js')

async function renderSettings() {
	render(<NotificationSettings pwa={{} as UsePWA} />)
	// Let the mount effect's ensureDeviceKey → getState chain land
	await act(async () => {})
	return screen.getByLabelText(PUSH_LABEL) as HTMLInputElement
}

beforeEach(() => {
	jest.clearAllMocks()
	current = pushState()
})

describe('NotificationSettings in the app', () => {
	it('disables the switch until the device is linked', async () => {
		current = pushState({ hasDeviceKey: false })
		const sw = await renderSettings()
		expect(sw.disabled).toBe(true)
		expect(screen.getByText('Link this device first.')).toBeTruthy()
	})

	it('hints at a distributor when push is on without one', async () => {
		current = pushState({ enabled: true, distributors: 0 })
		const sw = await renderSettings()
		expect(sw.checked).toBe(true)
		expect(screen.getByText(/Install a UnifiedPush distributor/)).toBeTruthy()
	})

	it('toggling enables native push', async () => {
		const sw = await renderSettings()
		await act(async () => {
			fireEvent.click(sw)
		})
		expect(pushApi.enable).toHaveBeenCalled()
		expect(sw.checked).toBe(true)
	})
})

// vim: ts=4
