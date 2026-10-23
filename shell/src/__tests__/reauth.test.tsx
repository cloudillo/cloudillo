// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * The re-auth step of a full-access API key: password when allowed, refused outright while
 * TOTP is enrolled or MFA is required (the backend rejects unscoped keys then).
 */

import { jest } from '@jest/globals'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import * as React from 'react'

import type { TotpStatus } from '../../../libs/core/src/index.js'
import { mockCloudilloReact, mockI18n, mockRealCore } from './helpers/mocks.js'

const REFUSAL =
	'Full-access API keys are unavailable while two-factor authentication is enabled or required. Choose at least one scope instead.'

const api = {
	auth: {
		getTotp: jest.fn<() => Promise<TotpStatus>>(),
		createApiKey: jest.fn<(data: unknown) => Promise<unknown>>()
	}
}
const API_HOOK = { api }
const toast = { error: jest.fn(), success: () => {}, info: () => {}, warning: () => {} }

await mockRealCore()
await mockCloudilloReact({
	useApi: () => API_HOOK,
	useToast: () => toast
})
mockI18n()

jest.unstable_mockModule('@simplewebauthn/browser', () => ({
	browserSupportsWebAuthn: () => true,
	startAuthentication: async () => ({}),
	startRegistration: async () => ({})
}))

jest.unstable_mockModule('../auth/auth.js', () => ({
	deviceName: () => 'Test - 1/1/2026',
	TotpCodeField: () => null,
	TotpEnrollInfo: () => null,
	webAuthnErrorMessage: () => undefined
}))

jest.unstable_mockModule('../pwa.js', () => ({
	deleteApiKey: async () => {},
	getApiKey: async () => undefined,
	setApiKey: async () => {}
}))

const { CreateApiKeyModal } = await import('../settings/security.js')

async function openReauth() {
	render(<CreateApiKeyModal open onClose={() => {}} onCreated={() => {}} />)
	fireEvent.click(await screen.findByRole('button', { name: 'Create API Key' }))
	await screen.findByText('Confirm your identity')
}

describe('useReauth (via CreateApiKeyModal)', () => {
	beforeEach(() => {
		api.auth.getTotp.mockReset()
		api.auth.createApiKey.mockReset()
		api.auth.createApiKey.mockResolvedValue({ keyId: 1, plaintextKey: 'k' })
	})

	it('sends the password when TOTP is off', async () => {
		api.auth.getTotp.mockResolvedValue({ mode: 'optional', enrolled: false })
		await openReauth()
		const confirm = await screen.findByRole<HTMLButtonElement>('button', { name: 'Confirm' })
		const password = document.querySelector('input[type="password"]') as HTMLInputElement
		fireEvent.change(password, { target: { value: 'hunter2' } })
		await waitFor(() => expect(confirm.disabled).toBe(false))
		fireEvent.click(confirm)
		await waitFor(() =>
			expect(api.auth.createApiKey).toHaveBeenCalledWith(
				expect.objectContaining({ reauth: { password: 'hunter2' } })
			)
		)
	})

	it.each<[string, TotpStatus]>([
		['TOTP is enrolled', { mode: 'optional', enrolled: true }],
		['MFA is required', { mode: 'required', enrolled: false }]
	])('refuses when %s', async (_label, status) => {
		api.auth.getTotp.mockResolvedValue(status)
		await openReauth()
		await screen.findByText(REFUSAL)
		expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Confirm' }).disabled).toBe(
			true
		)
		expect(screen.queryByRole('button', { name: 'Use passkey' })).toBeNull()
		expect(document.querySelector('input[type="password"]')).toBeNull()
	})
})

// vim: ts=4
