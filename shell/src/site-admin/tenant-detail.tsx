// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { useApi, useToast, ProfilePicture } from '@cloudillo/react'
import { FetchError, type TenantView } from '@cloudillo/core'

import { LuUser as IcPerson, LuUsers as IcCommunity, LuShield as IcAdmin } from 'react-icons/lu'

const STORAGE_KEY = 'limits.max_storage_gb'

export function TenantDetail() {
	const { t } = useTranslation()
	const { idTag } = useParams<{ idTag: string }>()
	const { api } = useApi()
	const { error: toastError } = useToast()

	const [tenant, setTenant] = React.useState<TenantView | undefined>()
	// Site-wide default for limits.max_storage_gb. 100 is the schema default.
	const [globalStorageGb, setGlobalStorageGb] = React.useState<number | undefined>()
	// Raw per-tenant override; undefined means "no override, inheriting global".
	const [tenantStorageGb, setTenantStorageGb] = React.useState<number | undefined>()
	// Local mirror of the input string so the user can type freely.
	const [storageInput, setStorageInput] = React.useState<string>('')
	const [storageBusy, setStorageBusy] = React.useState(false)
	const [storageInputError, setStorageInputError] = React.useState<string | undefined>()
	const storageDebounceRef = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
	const mountedRef = React.useRef(true)

	React.useEffect(function trackMounted() {
		mountedRef.current = true
		return function () {
			mountedRef.current = false
		}
	}, [])

	React.useEffect(
		function loadTenant() {
			if (!api || !idTag) return
			let cancelled = false
			;(async function () {
				try {
					// No dedicated GET /admin/tenants/:idTag yet — list-then-filter
					// keeps the page working without a second backend round-trip.
					const tenants = await api.admin.listTenants({ q: idTag })
					if (cancelled) return
					const match = tenants.find((tn) => tn.idTag === idTag)
					if (!match) {
						console.error('Tenant not found', idTag)
						toastError(t('Tenant not found.'))
						return
					}
					setTenant(match)
				} catch (err) {
					console.error('Failed to load tenant', err)
					if (!cancelled) toastError(t('Failed to load tenant. Please try again.'))
				}
			})()
			return function () {
				cancelled = true
			}
		},
		[api, idTag, t, toastError]
	)

	React.useEffect(
		function loadStorageOverride() {
			if (!api || !idTag) return
			let cancelled = false
			;(async function () {
				const [globalRes, tenantRes] = await Promise.allSettled([
					api.settings.get(STORAGE_KEY, { level: 'global' }),
					api.settings.get(STORAGE_KEY, { level: 'tenant', tenant: idTag })
				])
				if (cancelled) return

				if (
					globalRes.status === 'fulfilled' &&
					typeof globalRes.value?.value === 'number'
				) {
					setGlobalStorageGb(globalRes.value.value)
				} else if (globalRes.status === 'rejected') {
					console.error('Failed to load global storage default', globalRes.reason)
					toastError(t('Failed to load setting. Please try again.'))
				}

				if (
					tenantRes.status === 'fulfilled' &&
					typeof tenantRes.value?.value === 'number'
				) {
					setTenantStorageGb(tenantRes.value.value)
					setStorageInput(String(tenantRes.value.value))
				} else if (
					tenantRes.status === 'rejected' &&
					!(tenantRes.reason instanceof FetchError && tenantRes.reason.httpStatus === 404)
				) {
					// 404 means "no override at this level" — anything else is a real failure.
					console.error('Failed to load tenant storage override', tenantRes.reason)
					toastError(t('Failed to load setting. Please try again.'))
				}
			})()
			return function () {
				cancelled = true
			}
		},
		[api, idTag, t, toastError]
	)

	React.useEffect(function () {
		return function () {
			if (storageDebounceRef.current) clearTimeout(storageDebounceRef.current)
		}
	}, [])

	if (!idTag) return null

	const storageGbDefault = globalStorageGb ?? 100

	function onStorageInput(evt: React.ChangeEvent<HTMLInputElement>) {
		if (!api || !idTag) return
		const next = evt.target.value
		setStorageInput(next)

		if (storageDebounceRef.current) clearTimeout(storageDebounceRef.current)
		// Empty input does not auto-clear the override (use Reset to default).
		if (next === '') {
			setStorageInputError(undefined)
			return
		}
		const parsed = Number(next)
		// Skip values outside the [1, 100000] range that the input advertises.
		if (!Number.isFinite(parsed) || parsed < 1 || parsed > 100000) {
			setStorageInputError(t('Enter a value between 1 and 100000.'))
			return
		}
		setStorageInputError(undefined)

		storageDebounceRef.current = setTimeout(async function () {
			try {
				await api.settings.update(
					STORAGE_KEY,
					{ value: parsed },
					{ level: 'tenant', tenant: idTag }
				)
				if (mountedRef.current) setTenantStorageGb(parsed)
			} catch (err) {
				console.error('Failed to save storage quota', err)
				if (mountedRef.current) toastError(t('Failed to save setting. Please try again.'))
			}
		}, 800)
	}

	async function onStorageReset() {
		if (!api || !idTag) return
		// Cancel any pending debounced update — otherwise it would re-create the
		// override we are about to delete.
		if (storageDebounceRef.current) {
			clearTimeout(storageDebounceRef.current)
			storageDebounceRef.current = undefined
		}
		setStorageInputError(undefined)
		setStorageBusy(true)
		try {
			await api.settings.delete(STORAGE_KEY, { level: 'tenant', tenant: idTag })
			if (mountedRef.current) {
				setTenantStorageGb(undefined)
				setStorageInput('')
			}
		} catch (err) {
			console.error('Failed to reset storage quota', err)
			if (mountedRef.current) toastError(t('Failed to save setting. Please try again.'))
		} finally {
			if (mountedRef.current) setStorageBusy(false)
		}
	}

	return (
		<div className="c-vbox g-3">
			<div className="c-panel flex-row align-items-center g-3 px-3 py-2">
				<div
					style={{
						width: '2rem',
						height: '2rem',
						borderRadius: '50%',
						overflow: 'hidden',
						flexShrink: 0
					}}
				>
					<ProfilePicture profile={{ profilePic: tenant?.profilePic }} srcTag={idTag} />
				</div>
				<div className="flex-fill">
					<strong>{tenant?.name ?? idTag}</strong>{' '}
					<span className="text-muted small">@{idTag}</span>
				</div>
				{tenant?.type === 'community' ? (
					<span className="text-muted" title={t('Community')}>
						<IcCommunity />
					</span>
				) : (
					<span className="text-muted" title={t('Person')}>
						<IcPerson />
					</span>
				)}
				{tenant?.roles?.includes('admin') && (
					<span className="c-badge info" title={t('Administrator')}>
						<IcAdmin />
					</span>
				)}
			</div>

			<div className="c-panel">
				<h4>{t('Storage')}</h4>

				<label className="c-hbox pb-2 g-2">
					<span className="flex-fill">{t('Maximum Storage Quota (GB)')}</span>
					<input
						className={`c-input w-xs ${storageInputError ? 'is-invalid' : ''}`}
						name={STORAGE_KEY}
						type="number"
						min="1"
						max="100000"
						placeholder={String(storageGbDefault)}
						value={storageInput}
						onChange={onStorageInput}
					/>
					<button
						type="button"
						className="c-link"
						disabled={tenantStorageGb === undefined || storageBusy}
						onClick={onStorageReset}
					>
						{t('Reset to default')}
					</button>
				</label>
				{storageInputError && (
					<p className="c-invalid-feedback mb-2">{storageInputError}</p>
				)}
				<p className="c-hint mb-4">
					{t('Default for all tenants: {{n}} GB.', { n: storageGbDefault })}{' '}
					{tenantStorageGb === undefined
						? t('No override set — inheriting the default.')
						: t('Set a value here to override for this tenant.')}
				</p>
			</div>
		</div>
	)
}

// vim: ts=4
