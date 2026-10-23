// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * Settings → Security two-factor panel: enroll start → confirm, disable with a code, and
 * the bare-403 handling (message per action, status re-read).
 */

import { jest } from '@jest/globals'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import * as React from 'react'

import type { TotpStatus } from '../../../libs/core/src/index.js'
import { mockCloudilloReact, mockI18n, mockRealCore } from './helpers/mocks.js'

const OFF: TotpStatus = { mode: 'optional', enrolled: false }
const ON: TotpStatus = { mode: 'optional', enrolled: true }

const api = {
	auth: {
		getTotp: jest.fn<() => Promise<TotpStatus>>(),
		totpEnrollStart: jest.fn<() => Promise<unknown>>(),
		totpEnrollConfirm: jest.fn<(data: { code: string }) => Promise<TotpStatus>>(),
		totpDisable: jest.fn<(data: { code: string }) => Promise<TotpStatus>>()
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

jest.unstable_mockModule('../auth/auth.js', () => ({
	deviceName: () => 'Test - 1/1/2026',
	TotpCodeField: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
		<input placeholder="123456" value={value} onChange={(e) => onChange(e.target.value)} />
	),
	TotpEnrollInfo: ({ secret }: { secret: string }) => <div>secret:{secret}</div>,
	webAuthnErrorMessage: () => undefined
}))

jest.unstable_mockModule('../pwa.js', () => ({
	deleteApiKey: async () => {},
	getApiKey: async () => undefined,
	setApiKey: async () => {}
}))

const { TwoFactorPanel } = await import('../settings/security.js')

const forbidden = () => new FetchError('E', 'denied', 403)

async function click(name: string) {
	fireEvent.click(await screen.findByRole('button', { name }))
}

async function enterCode() {
	fireEvent.change(await screen.findByPlaceholderText('123456'), { target: { value: '123456' } })
}

describe('TwoFactorPanel', () => {
	beforeEach(() => {
		for (const fn of Object.values(api.auth)) fn.mockReset()
		api.auth.getTotp.mockResolvedValue(OFF)
		toast.error.mockClear()
	})

	it('enrolls: start shows the secret, confirm marks it enabled', async () => {
		api.auth.totpEnrollStart.mockResolvedValue({ secret: 'S3CR3T', otpauthUri: 'otpauth://x' })
		api.auth.totpEnrollConfirm.mockResolvedValue(ON)
		render(<TwoFactorPanel />)
		await click('Enable')
		await screen.findByText('secret:S3CR3T')
		await enterCode()
		await click('Verify')
		await screen.findByText('Enabled')
		expect(api.auth.totpEnrollConfirm).toHaveBeenCalledWith({ code: '123456' })
	})

	it('disables with a code', async () => {
		api.auth.getTotp.mockResolvedValue(ON)
		api.auth.totpDisable.mockResolvedValue(OFF)
		render(<TwoFactorPanel />)
		await click('Disable two-factor authentication')
		await enterCode()
		await click('Disable')
		await screen.findByText('Not enabled')
		expect(api.auth.totpDisable).toHaveBeenCalledWith({ code: '123456' })
	})

	it('a 403 on enable is not a wrong code, and re-reads the status', async () => {
		api.auth.totpEnrollStart.mockRejectedValue(forbidden())
		render(<TwoFactorPanel />)
		await click('Enable')
		await waitFor(() =>
			expect(toast.error).toHaveBeenCalledWith(
				'Two-factor authentication is not available right now.'
			)
		)
		await waitFor(() => expect(api.auth.getTotp).toHaveBeenCalledTimes(2))
	})

	it('a 403 on verify is a wrong code, and re-reads the status', async () => {
		api.auth.totpEnrollStart.mockResolvedValue({ secret: 'S', otpauthUri: 'otpauth://x' })
		api.auth.totpEnrollConfirm.mockRejectedValue(forbidden())
		render(<TwoFactorPanel />)
		await click('Enable')
		await screen.findByText('secret:S')
		await enterCode()
		await click('Verify')
		await waitFor(() =>
			expect(toast.error).toHaveBeenCalledWith('Invalid code. Please try again.')
		)
		await waitFor(() => expect(api.auth.getTotp).toHaveBeenCalledTimes(2))
	})
})

// vim: ts=4
