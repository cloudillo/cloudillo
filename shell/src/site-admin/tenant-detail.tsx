// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { FetchError, type TenantView } from '@cloudillo/core'
import {
	Badge,
	Button,
	Field,
	HBox,
	Input,
	Panel,
	ProfilePicture,
	Text,
	useApi,
	useToast,
	VBox
} from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuShield as IcAdmin, LuUsers as IcCommunity, LuUser as IcPerson } from 'react-icons/lu'
import { useParams } from 'react-router-dom'

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
		<VBox gap={3}>
			<Panel padding={2}>
				<HBox gap={3} align="center">
					<ProfilePicture
						size="sm"
						profile={{ profilePic: tenant?.profilePic }}
						srcTag={idTag}
					/>
					<Text as="div" className="flex-fill">
						<Text weight="bold">{tenant?.name ?? idTag}</Text>{' '}
						<Text size="sm" emphasis="muted">
							@{idTag}
						</Text>
					</Text>
					{tenant?.type === 'community' ? (
						<Badge icon={<IcCommunity />}>{t('Community')}</Badge>
					) : (
						<Badge icon={<IcPerson />}>{t('Person')}</Badge>
					)}
					{tenant?.roles?.includes('admin') && (
						<Badge color="info" icon={<IcAdmin />}>
							{t('Administrator')}
						</Badge>
					)}
				</HBox>
			</Panel>

			<Panel title={t('Storage')}>
				<Field
					label={t('Maximum Storage Quota (GB)')}
					orientation="horizontal"
					error={storageInputError}
					hint={`${t('Default for all tenants: {{n}} GB.', { n: storageGbDefault })} ${
						tenantStorageGb === undefined
							? t('No override set — inheriting the default.')
							: t('Set a value here to override for this tenant.')
					}`}
				>
					<HBox gap={2} align="center">
						<Input
							className="w-xs"
							name={STORAGE_KEY}
							type="number"
							min="1"
							max="100000"
							placeholder={String(storageGbDefault)}
							value={storageInput}
							onChange={onStorageInput}
						/>
						<Button
							variant="link"
							disabled={tenantStorageGb === undefined || storageBusy}
							onClick={onStorageReset}
						>
							{t('Reset to default')}
						</Button>
					</HBox>
				</Field>
			</Panel>
		</VBox>
	)
}

// vim: ts=4
