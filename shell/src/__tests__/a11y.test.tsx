// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * axe over key screens: login, the TOTP login step, security settings, the site-admin
 * audit page and a file-list row. `color-contrast` is off — jsdom cannot compute colours.
 *
 * The file list is covered by one `ItemCard` in a divided `List`, not the whole
 * `FilesApp` (too many dependencies to mock for what it adds).
 *
 * `.test.tsx` so jest gives this suite the jsdom environment (see jest.config.cjs).
 */

import { jest } from '@jest/globals'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { atom, Provider } from 'jotai'
import { configureAxe, toHaveNoViolations } from 'jest-axe'
import * as React from 'react'
import { MemoryRouter } from 'react-router-dom'

import { mockCloudilloReact, mockI18n, mockRealCore } from './helpers/mocks.js'

expect.extend(toHaveNoViolations)

const axe = configureAxe({ rules: { 'color-contrast': { enabled: false } } })

const ME = 'user.example.com'

const EVENT = {
	id: 1,
	ts: '2026-01-01T10:00:00Z',
	actor: ME,
	event: 'auth.login',
	category: 'auth',
	ip: '127.0.0.1',
	outcome: 'success'
}

// Module-level constants: hooks memoise on these, a fresh object per render loops.
const API = {
	idTag: ME,
	auth: {
		login: jest.fn(async () => ({ mfaRequired: true, mfaToken: 'mfa-token' })),
		listWebAuthnCredentials: jest.fn(async () => []),
		listApiKeys: jest.fn(async () => []),
		getTotp: jest.fn(async () => ({ mode: 'optional', enrolled: false })),
		listAudit: jest.fn(async () => ({
			events: [EVENT],
			nextCursor: null,
			globalCategories: ['sharing'],
			tenantCategories: []
		}))
	},
	admin: {
		listAudit: jest.fn(async () => ({ events: [{ ...EVENT, tnId: 1 }], nextCursor: null }))
	},
	settings: {
		list: jest.fn(async () => []),
		update: jest.fn(async () => null)
	}
}
const API_HOOK = { api: API, authenticated: true }
const TOAST = { error: () => {}, success: () => {}, info: () => {}, warning: () => {} }
const DIALOG = { confirm: async () => false, ask: async () => undefined }
const CTX = { base: '/~', idTag: ME, isHome: true }
const setAuth = () => {}
let authState: { idTag: string } | undefined

await mockRealCore()
await mockCloudilloReact({
	useApi: () => API_HOOK,
	useAuth: () => [authState, setAuth],
	useToast: () => TOAST,
	useDialog: () => DIALOG
})
mockI18n()

jest.unstable_mockModule('@simplewebauthn/browser', () => ({
	browserSupportsWebAuthn: () => false,
	startAuthentication: async () => {
		throw new Error('unsupported')
	},
	startRegistration: async () => {
		throw new Error('unsupported')
	}
}))

const noopAsync = async () => undefined
jest.unstable_mockModule('../pwa.js', () => ({
	default: () => ({}),
	cleanupEncryptionCookie: () => {},
	clearAuthToken: noopAsync,
	deleteApiKey: noopAsync,
	ensureServiceWorker: noopAsync,
	getApiKey: noopAsync,
	getApiKeyResult: async () => ({ status: 'ok' }),
	getSessionToken: () => undefined,
	hadEncryptedData: () => false,
	installHatToken: () => {},
	installToken: noopAsync,
	markHadEncryptedData: () => {},
	releaseInstalledToken: noopAsync,
	resetAppCache: noopAsync,
	resetEncryptionState: async () => false,
	setApiKey: noopAsync,
	setCurrentAuthToken: () => {},
	setSessionToken: () => {}
}))

// Its effect mints a QR login session against the API; not under test here.
jest.unstable_mockModule('../auth/QrLoginPanel.js', () => ({
	QrLoginPanel: () => null
}))

jest.unstable_mockModule('../context/index.js', () => ({
	activeContextAtom: atom<{ idTag: string; roles: string[] } | null>(null),
	contextRolesAtom: atom(new Map<string, string[]>()),
	fileViewUpdateAtom: atom<{ version: number; file: unknown } | undefined>(undefined),
	useApiContext: () => ({ getClientFor: () => null }),
	useContextAwareApi: () => API_HOOK,
	useContextName: () => undefined,
	useCtx: () => CTX,
	useCurrentContextIdTag: () => ME
}))

jest.unstable_mockModule('../apps/viewer/MediaViewer.js', () => ({
	isViewerSupported: () => false,
	triggerFileDownload: () => {}
}))

const { LoginForm } = await import('../auth/auth.js')
const { SecuritySettings } = await import('../settings/security.js')
const { AuditLog, AuditSettings } = await import('../site-admin/audit.js')
const { ItemCard } = await import('../apps/files/components/index.js')
const { List } = await import('@cloudillo/react')

function renderScreen(ui: React.ReactElement) {
	return render(
		<Provider>
			<MemoryRouter>{ui}</MemoryRouter>
		</Provider>
	)
}

/** Let pending effect promises settle before axe walks the DOM. */
async function settle() {
	await act(async () => {})
}

describe('accessibility (axe)', () => {
	beforeEach(() => {
		authState = { idTag: ME }
	})

	it('login form', async () => {
		authState = undefined
		const { container } = renderScreen(<LoginForm />)
		await settle()
		expect(await axe(container)).toHaveNoViolations()
	})

	it('TOTP login step', async () => {
		authState = undefined
		const { container } = renderScreen(<LoginForm />)
		fireEvent.change(screen.getByPlaceholderText('Password'), {
			target: { value: 'secret' }
		})
		const form = container.querySelector('form')
		if (!form) throw new Error('login form not rendered')
		fireEvent.submit(form)
		await screen.findByText('Enter the 6-digit code from your authenticator app.')
		expect(API.auth.login).toHaveBeenCalled()
		expect(await axe(container)).toHaveNoViolations()
	})

	it('security settings', async () => {
		const { container } = renderScreen(<SecuritySettings />)
		await waitFor(() => {
			expect(API.auth.getTotp).toHaveBeenCalled()
			expect(API.auth.listAudit).toHaveBeenCalled()
		})
		await settle()
		expect(await axe(container)).toHaveNoViolations()
	})

	it('site-admin audit page', async () => {
		const { container } = renderScreen(<AuditLog />)
		await waitFor(() => {
			expect(container.querySelector('table, [role="table"]')).not.toBeNull()
		})
		await settle()
		expect(await axe(container)).toHaveNoViolations()
	})

	it('site-admin audit settings page', async () => {
		const { container } = renderScreen(<AuditSettings />)
		await screen.findAllByRole('switch')
		await settle()
		expect(await axe(container)).toHaveNoViolations()
	})

	it('file list row', async () => {
		const file = {
			entryId: 'e1',
			fileId: 'f1',
			fileName: 'Report.pdf',
			fileTp: 'BLOB',
			contentType: 'application/pdf',
			createdAt: '2026-01-01T10:00:00Z',
			preset: 'default',
			owner: { idTag: ME },
			accessLevel: 'write' as const
		}
		const fileOps = {
			openFile: () => {},
			renameFile: () => {},
			setRenameFileName: () => {},
			doRenameFile: () => {},
			doDeleteFile: () => {}
		}
		const { container } = renderScreen(
			<List variant="divided">
				<ItemCard file={file} fileOps={fileOps} />
			</List>
		)
		await settle()
		expect(await axe(container)).toHaveNoViolations()
	})
})

// vim: ts=4
