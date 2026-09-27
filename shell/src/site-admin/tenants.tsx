// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { TenantView } from '@cloudillo/core'
import {
	Alert,
	Badge,
	Button,
	EmptyState,
	HBox,
	Link,
	Menu,
	MenuDivider,
	MenuItem,
	ProfilePicture,
	SearchInput,
	Table,
	TableCell,
	TableRow,
	Text,
	useApi,
	useAuth,
	useDialog,
	VBox
} from '@cloudillo/react'
import debounce from 'debounce'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
	LuShield as IcAdmin,
	LuUsers as IcCommunity,
	LuKey as IcKey,
	LuEllipsisVertical as IcMore,
	LuUser as IcPerson,
	LuSettings as IcSettings,
	LuTrash2 as IcTrash
} from 'react-icons/lu'

import { siteAdminPath } from '../routes.js'

function TenantRow({
	tenant,
	canDelete,
	onPasswordReset,
	onDelete
}: {
	tenant: TenantView
	canDelete: boolean
	onPasswordReset: (idTag: string) => void
	onDelete: (idTag: string) => void
}) {
	const { t } = useTranslation()

	const isAdmin = tenant.roles?.includes('admin')
	const isActive = tenant.status === 'A'

	return (
		<TableRow>
			<TableCell>
				<HBox gap={2} align="center">
					<ProfilePicture
						size="sm"
						profile={{ profilePic: tenant.profilePic }}
						srcTag={tenant.idTag}
					/>
					<Link href={siteAdminPath(['tenants', tenant.idTag])}>
						<Text weight="bold">{tenant.name}</Text>{' '}
						<Text size="sm" emphasis="muted">
							@{tenant.idTag}
						</Text>
					</Link>
					<Text
						emphasis="muted"
						aria-label={tenant.type === 'community' ? t('Community') : t('Person')}
					>
						{tenant.type === 'community' ? <IcCommunity /> : <IcPerson />}
					</Text>
					{isAdmin && (
						<Badge color="info" icon={<IcAdmin />}>
							{t('Administrator')}
						</Badge>
					)}
				</HBox>
			</TableCell>
			<TableCell>
				<Text size="sm" emphasis="muted" truncate>
					{tenant.email}
				</Text>
			</TableCell>
			<TableCell>
				<Badge color={isActive ? 'success' : 'warning'}>
					{isActive ? t('Active') : (tenant.status ?? t('Unknown'))}
				</Badge>
			</TableCell>
			<TableCell align="end">
				<Menu
					trigger={
						<Button
							variant="ghost"
							icon={<IcMore />}
							aria-label={t('Tenant actions')}
						/>
					}
				>
					<MenuItem
						icon={<IcSettings />}
						label={t('Settings')}
						href={siteAdminPath(['tenants', tenant.idTag])}
					/>
					<MenuItem
						icon={<IcKey />}
						label={t('Reset Password')}
						disabled={!tenant.email}
						description={tenant.email ? undefined : t('No email address set')}
						onClick={() => onPasswordReset(tenant.idTag)}
					/>
					{canDelete && (
						<>
							<MenuDivider />
							<MenuItem
								icon={<IcTrash />}
								label={t('Delete tenant')}
								color="error"
								onClick={() => onDelete(tenant.idTag)}
							/>
						</>
					)}
				</Menu>
			</TableCell>
		</TableRow>
	)
}

export function Tenants() {
	const { t } = useTranslation()
	const { api } = useApi()
	const [auth] = useAuth()
	const dialog = useDialog()
	const [tenants, setTenants] = React.useState<TenantView[] | undefined>()
	const [loading, setLoading] = React.useState(false)
	const [search, setSearch] = React.useState('')
	const [error, setError] = React.useState<string | undefined>()

	// Load tenants on mount and when search changes
	const loadTenants = React.useCallback(
		debounce(async (q?: string) => {
			if (!auth || !api) return
			setLoading(true)
			setError(undefined)
			try {
				const res = await api.admin.listTenants(q ? { q } : undefined)
				if (Array.isArray(res)) {
					setTenants(res)
				}
			} catch (err: unknown) {
				console.error('Failed to load tenants:', err)
				setError(err instanceof Error ? err.message : t('Failed to load tenants'))
			} finally {
				setLoading(false)
			}
		}, 300),
		[auth, api, t]
	)

	React.useEffect(
		function onMount() {
			loadTenants()
		},
		[auth, api]
	)

	React.useEffect(
		function onSearchChange() {
			loadTenants(search || undefined)
		},
		[search]
	)

	async function handlePasswordReset(idTag: string) {
		if (!api) return

		const confirmed = await dialog.confirm(
			t('Send Password Reset Email'),
			t('Are you sure you want to send a password reset email to the owner of {{idTag}}?', {
				idTag
			}),
			{ confirmLabel: t('Send') }
		)

		if (!confirmed) return

		try {
			const res = await api.admin.sendPasswordReset(idTag)
			await dialog.tell(t('Password Reset Email Sent'), res.message)
		} catch (err: unknown) {
			console.error('Failed to send password reset:', err)
			await dialog.tell(
				t('Error'),
				err instanceof Error ? err.message : t('Failed to send password reset email')
			)
		}
	}

	async function handleDelete(idTag: string) {
		if (!api) return

		const confirmed = await dialog.confirm(
			t('Type the tenant ID to confirm'),
			t('Type {{idTag}} below to confirm immediate deletion.', { idTag }),
			{ color: 'error', confirmLabel: t('Delete tenant'), requireText: idTag }
		)
		if (!confirmed) return

		try {
			const res = await api.admin.purgeTenant(idTag, { confirmIdTag: idTag })
			await dialog.tell(
				t('Tenant deleted'),
				t('{{idTag}} has been removed.', { idTag: res.idTag })
			)
			loadTenants(search || undefined)
		} catch (err) {
			await dialog.tell(t('Delete failed'), err instanceof Error ? err.message : String(err))
		}
	}

	return (
		<VBox gap={3} autoBg>
			<SearchInput
				aria-label={t('Search tenants...')}
				placeholder={t('Search tenants...')}
				value={search}
				onChange={(e) => setSearch(e.target.value)}
			/>

			{error && <Alert color="error">{error}</Alert>}

			{!loading && tenants && tenants.length === 0 && (
				<EmptyState className="auto-bg" title={t('No tenants found')} />
			)}

			{!!tenants?.length && (
				<Table
					stack
					variant="hoverable"
					aria-label={t('Tenants')}
					columns={[t('Tenant'), t('Email'), t('Status'), t('Actions')]}
				>
					{tenants.map((tenant) => (
						<TenantRow
							key={tenant.idTag}
							tenant={tenant}
							canDelete={tenant.idTag !== auth?.idTag}
							onPasswordReset={handlePasswordReset}
							onDelete={handleDelete}
						/>
					))}
				</Table>
			)}
		</VBox>
	)
}

// vim: ts=4
