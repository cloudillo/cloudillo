// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * The TOTP login step: 403 keeps the code step, 410 (token gone) goes back to the
 * password, Verify needs 6 digits, and welcome.tsx can hand the step over directly (and
 * the handed-over token never enters history.state). Back from the code step never auto-prompts
 * for a passkey.
 */

import { jest } from '@jest/globals'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { atom, Provider } from 'jotai'
import * as React from 'react'
import { MemoryRouter, useLocation } from 'react-router-dom'

import { mockCloudilloReact, mockI18n, mockRealCore } from './helpers/mocks.js'

const ME = 'user.example.com'

const API = {
	idTag: ME,
	auth: {
		login: jest.fn(async () => ({ mfaRequired: true, mfaToken: 't' })),
		loginMfa: jest.fn<(data: unknown) => Promise<unknown>>(),
		getWebAuthnLoginChallenge: jest.fn(async () => {
			throw new Error('no challenge in tests')
		})
	},
	settings: { get: jest.fn(async () => ({ value: null })) }
}
const API_HOOK = { api: API, authenticated: false }
const TOAST = { error: () => {}, success: () => {}, info: () => {}, warning: () => {} }

const { FetchError } = await mockRealCore()
await mockCloudilloReact({
	useApi: () => API_HOOK,
	useAuth: () => [undefined, () => {}],
	useToast: () => TOAST
})
mockI18n()

let webAuthnSupported = false
jest.unstable_mockModule('@simplewebauthn/browser', () => ({
	browserSupportsWebAuthn: () => webAuthnSupported,
	startAuthentication: async () => {
		throw new Error('unsupported')
	}
}))

const noopAsync = async () => undefined
const installToken = jest.fn<(token: string) => Promise<void>>(noopAsync)
jest.unstable_mockModule('../pwa.js', () => ({
	default: () => ({}),
	installToken,
	setApiKey: noopAsync
}))

jest.unstable_mockModule('../auth/QrLoginPanel.js', () => ({
	QrLoginPanel: () => null
}))

jest.unstable_mockModule('../context/index.js', () => ({
	activeContextAtom: atom<{ idTag: string; roles: string[] } | null>(null),
	contextRolesAtom: atom(new Map<string, string[]>())
}))

const { LoginForm, LoginInitContext } = await import('../auth/auth.js')
const { handOffMfa } = await import('../auth/mfa-handoff.js')

const CODE_PROMPT = 'Enter the 6-digit code from your authenticator app.'

let locationState: unknown
function LocationProbe() {
	locationState = useLocation().state
	return null
}

function renderLogin(
	entry: string | { pathname: string; state: unknown } = '/login',
	loginInit: React.ContextType<typeof LoginInitContext> = undefined
) {
	return render(
		<Provider>
			<MemoryRouter initialEntries={[entry]}>
				<LoginInitContext.Provider value={loginInit}>
					<LoginForm />
				</LoginInitContext.Provider>
				<LocationProbe />
			</MemoryRouter>
		</Provider>
	)
}

const HANDOFF = { pathname: '/login', state: { onboardingRefId: 'r1' } }

/** What welcome.tsx does: the step in memory, only the refId in the router state */
function renderHandoff(loginInit: React.ContextType<typeof LoginInitContext> = undefined) {
	handOffMfa({ mfaToken: 't' })
	return renderLogin(HANDOFF, loginInit)
}
const PASSKEYS = { qrLogin: { sessionId: 's', secret: 'x' }, webAuthn: true }

/** Password step → code step */
async function toCodeStep() {
	const { container } = renderLogin()
	fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'secret' } })
	const form = container.querySelector('form')
	if (!form) throw new Error('login form not rendered')
	fireEvent.submit(form)
	await screen.findByText(CODE_PROMPT)
	return form
}

function enterCode(code: string) {
	fireEvent.change(screen.getByPlaceholderText('123456'), { target: { value: code } })
}

const verifyButton = () => screen.getByRole('button', { name: /Verify/ })

describe('LoginForm TOTP step', () => {
	let consoleError: ReturnType<typeof jest.spyOn>
	beforeEach(() => {
		API.auth.loginMfa.mockReset()
		consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
	})

	afterEach(() => {
		consoleError.mockRestore()
	})

	it('403 keeps the code step and says the code is wrong', async () => {
		API.auth.loginMfa.mockRejectedValue(new FetchError('E', 'denied', 403))
		const form = await toCodeStep()
		enterCode('123456')
		fireEvent.submit(form)
		await screen.findByText('Invalid code. Please try again.')
		expect(screen.getByText(CODE_PROMPT)).toBeTruthy()
		expect(API.auth.loginMfa).toHaveBeenCalledWith({ mfaToken: 't', code: '123456' })
	})

	it('a failure after an accepted code is not reported as a wrong code', async () => {
		API.auth.loginMfa.mockResolvedValue({ token: 'tok', idTag: ME })
		installToken.mockRejectedValueOnce(new Error('Service worker unavailable'))
		const form = await toCodeStep()
		enterCode('123456')
		fireEvent.submit(form)
		await screen.findByText('Service worker unavailable')
		expect(screen.queryByText('Invalid code. Please try again.')).toBeNull()
		// The token is spent, so the step closes
		expect(screen.queryByText(CODE_PROMPT)).toBeNull()
		expect(screen.getByPlaceholderText('Password')).toBeTruthy()
	})

	it('410 goes back to the password step', async () => {
		API.auth.loginMfa.mockRejectedValue(new FetchError('E', 'gone', 410))
		const form = await toCodeStep()
		enterCode('123456')
		fireEvent.submit(form)
		await screen.findByText('The sign-in attempt expired. Please enter your password again.')
		expect(screen.queryByText(CODE_PROMPT)).toBeNull()
		expect(screen.getByPlaceholderText('Password')).toBeTruthy()
	})

	it('Verify needs all 6 digits', async () => {
		const form = await toCodeStep()
		enterCode('12345')
		expect((verifyButton() as HTMLButtonElement).disabled).toBe(true)
		fireEvent.submit(form)
		expect(API.auth.loginMfa).not.toHaveBeenCalled()
		enterCode('123456')
		expect((verifyButton() as HTMLButtonElement).disabled).toBe(false)
	})

	it('opens on the code step when onboarding hands over the MFA token', () => {
		renderHandoff()
		expect(screen.getByText(CODE_PROMPT)).toBeTruthy()
		expect(screen.queryByPlaceholderText('Password')).toBeNull()
	})

	it('keeps the handed-over MFA token out of history state, and hands it over once', () => {
		const { unmount } = renderHandoff()
		expect(screen.getByText(CODE_PROMPT)).toBeTruthy()
		expect(locationState).toEqual({ onboardingRefId: 'r1' })
		expect(locationState).not.toHaveProperty('mfa')
		unmount()
		renderLogin(HANDOFF)
		expect(screen.queryByText(CODE_PROMPT)).toBeNull()
	})

	describe('with passkeys available', () => {
		let hasFocus: ReturnType<typeof jest.spyOn>
		beforeEach(() => {
			webAuthnSupported = true
			hasFocus = jest.spyOn(document, 'hasFocus').mockReturnValue(true)
			API.auth.getWebAuthnLoginChallenge.mockClear()
		})
		afterEach(() => {
			webAuthnSupported = false
			hasFocus.mockRestore()
		})

		it('prompts on its own on a plain login page', async () => {
			renderLogin('/login', PASSKEYS)
			await act(async () => {})
			expect(API.auth.getWebAuthnLoginChallenge).toHaveBeenCalledTimes(1)
		})

		it('Back from the code step does not pop a passkey prompt', async () => {
			renderHandoff(PASSKEYS)
			fireEvent.click(screen.getByRole('button', { name: /Back/ }))
			await screen.findByPlaceholderText('Password')
			await act(async () => {})
			expect(API.auth.getWebAuthnLoginChallenge).not.toHaveBeenCalled()
		})
	})
})
