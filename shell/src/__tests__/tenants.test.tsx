// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * Site-admin tenant list: `isTenantExpired`, and the row actions (suspend, resume,
 * set expiry, reset MFA) — each calls its admin endpoint and the list reloads.
 */

import { jest } from '@jest/globals'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import dayjs from 'dayjs'
import * as React from 'react'
import { MemoryRouter } from 'react-router-dom'

import type { TenantView } from '../../../libs/core/src/index.js'

const ME = 'admin.example.com'
const BOB = 'bob.example.com'

const tenant = (idTag: string, extra: Partial<TenantView> = {}): TenantView => ({
	tnId: idTag === ME ? 1 : 2,
	idTag,
	name: idTag,
	type: 'person',
	status: 'A',
	createdAt: 0,
	...extra
})

const api = {
	admin: {
		listTenants: jest.fn<() => Promise<TenantView[]>>(),
		suspendTenant: jest.fn(async (_idTag: string) => {}),
		resumeTenant: jest.fn(async (_idTag: string) => {}),
		setTenantExpiry: jest.fn(async (_idTag: string, _at: number | null) => {}),
		resetMfa: jest.fn(async (_idTag: string) => {})
	}
}
const dialog = {
	confirm: jest.fn(async (..._args: unknown[]) => true),
	tell: jest.fn(async (..._args: unknown[]) => {})
}

// Stable: `Tenants` reloads whenever `auth` changes identity
const AUTH_HOOK = [{ idTag: ME }, () => {}]

const realCore = await import('../../../libs/core/src/index.js')
jest.unstable_mockModule('@cloudillo/core', () => realCore)

const realReact = await import('../../../libs/react/src/index.js')
jest.unstable_mockModule('@cloudillo/react', () => ({
	...realReact,
	useApi: () => ({ api }),
	useAuth: () => AUTH_HOOK,
	useDialog: () => dialog
}))

jest.unstable_mockModule('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) => key,
		i18n: { language: 'en' }
	})
}))

// No 300 ms search debounce in tests
jest.unstable_mockModule('debounce', () => ({ default: (fn: unknown) => fn }))

const { isTenantExpired, Tenants } = await import('../site-admin/tenants.js')

describe('isTenantExpired', () => {
	const now = Math.floor(Date.now() / 1000)

	it('is expired once expiresAt has passed', () => {
		expect(isTenantExpired(tenant(BOB, { expiresAt: now - 60 }))).toBe(true)
	})

	it('is not expired before expiresAt or without one', () => {
		expect(isTenantExpired(tenant(BOB, { expiresAt: now + 3600 }))).toBe(false)
		expect(isTenantExpired(tenant(BOB))).toBe(false)
	})
})

describe('Tenants row actions', () => {
	beforeEach(() => {
		for (const fn of Object.values(api.admin)) fn.mockClear()
		api.admin.listTenants.mockResolvedValue([tenant(ME), tenant(BOB)])
		dialog.confirm.mockClear()
		dialog.tell.mockClear()
	})

	function renderTenants() {
		return render(
			<MemoryRouter>
				<Tenants />
			</MemoryRouter>
		)
	}

	/** Opens the actions menu of `idTag`'s row and returns the menu item named `name` */
	async function menuItem(idTag: string, name: string) {
		const row = (await screen.findByText(`@${idTag}`)).closest('tr')
		if (!row) throw new Error(`no row for ${idTag}`)
		fireEvent.click(within(row).getByRole('button', { name: 'Tenant actions' }))
		return screen.findByRole('menuitem', { name })
	}

	it('suspends, then shows the reloaded row as suspended', async () => {
		renderTenants()
		const item = await menuItem(BOB, 'Suspend')
		api.admin.listTenants.mockResolvedValue([tenant(ME), tenant(BOB, { suspendedAt: 1 })])
		fireEvent.click(item)
		await screen.findByText('Suspended')
		expect(api.admin.suspendTenant).toHaveBeenCalledWith(BOB)
	})

	it('resumes a suspended tenant', async () => {
		api.admin.listTenants.mockResolvedValue([tenant(ME), tenant(BOB, { suspendedAt: 1 })])
		renderTenants()
		const item = await menuItem(BOB, 'Resume')
		api.admin.listTenants.mockResolvedValue([tenant(ME), tenant(BOB)])
		fireEvent.click(item)
		await waitFor(() => expect(screen.queryByText('Suspended')).toBeNull())
		expect(api.admin.resumeTenant).toHaveBeenCalledWith(BOB)
	})

	it('sets an expiry date from the dialog', async () => {
		renderTenants()
		fireEvent.click(await menuItem(BOB, 'Set expiry'))
		const input = (await screen.findByLabelText('Expiry date')) as HTMLInputElement
		fireEvent.change(input, { target: { value: '2099-01-02' } })
		const form = input.closest('form')
		if (!form) throw new Error('expiry dialog has no form')
		const loads = api.admin.listTenants.mock.calls.length
		fireEvent.submit(form)
		await waitFor(() =>
			expect(api.admin.setTenantExpiry).toHaveBeenCalledWith(BOB, dayjs('2099-01-02').unix())
		)
		await waitFor(() => expect(api.admin.listTenants).toHaveBeenCalledTimes(loads + 1))
	})

	it('resets MFA after confirmation', async () => {
		renderTenants()
		fireEvent.click(await menuItem(BOB, 'Reset MFA'))
		await waitFor(() => expect(api.admin.resetMfa).toHaveBeenCalledWith(BOB))
		expect(dialog.confirm).toHaveBeenCalledTimes(1)
		expect(dialog.tell).toHaveBeenCalledWith(
			'Two-factor authentication reset',
			'{{idTag}} can now sign in with the password alone.'
		)
	})

	it('cannot suspend or set an expiry on the own row', async () => {
		renderTenants()
		const suspend = await menuItem(ME, 'Suspend')
		expect(suspend.hasAttribute('disabled') || suspend.ariaDisabled === 'true').toBe(true)
		const expiry = screen.getByRole('menuitem', { name: 'Set expiry' })
		expect(expiry.hasAttribute('disabled') || expiry.ariaDisabled === 'true').toBe(true)
		expect(screen.queryByRole('menuitem', { name: 'Delete tenant' })).toBeNull()
	})
})

// vim: ts=4
