// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { errorMessage, type TenantView } from '@cloudillo/core'
import {
	ActionBar,
	Alert,
	Badge,
	Button,
	Dialog,
	EmptyState,
	Field,
	HBox,
	IcCommunity,
	IcDelete,
	IcMore,
	IcPerson,
	IcSettings,
	Input,
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
import dayjs from 'dayjs'
import debounce from 'debounce'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { IcActive, IcAdmin, IcApiKey, IcPasskey, IcSchedule, IcSuspended } from '../icons.js'
import { siteAdminPath } from '../routes.js'
import { formatBytes, formatUnixTime } from '../utils.js'

/** Login is refused once `expiresAt` (unix seconds) is reached */
export function isTenantExpired(tenant: TenantView) {
	return tenant.expiresAt !== undefined && tenant.expiresAt * 1000 <= Date.now()
}

/** Suspended / expired (admin account state) win over the `status` letter */
export function TenantStatusBadge({ tenant }: { tenant: TenantView }) {
	const { t } = useTranslation()
	if (tenant.suspendedAt !== undefined) return <Badge color="error">{t('Suspended')}</Badge>
	if (isTenantExpired(tenant)) return <Badge color="error">{t('Expired')}</Badge>
	const isActive = tenant.status === 'A'
	return (
		<Badge color={isActive ? 'success' : 'warning'}>
			{isActive ? t('Active') : (tenant.status ?? t('Unknown'))}
		</Badge>
	)
}

function ExpiryDialog({
	tenant,
	onClose,
	onSave
}: {
	tenant: TenantView
	onClose: () => void
	onSave: (expiresAt: number | null) => void
}) {
	const { t } = useTranslation()
	const [date, setDate] = React.useState(
		tenant.expiresAt !== undefined ? formatUnixTime(tenant.expiresAt) : ''
	)

	return (
		<Dialog
			open
			size="sm"
			title={t('Set expiry')}
			description={t(
				'{{idTag}} cannot sign in from the start of this day. Resume clears the expiry.',
				{ idTag: tenant.idTag }
			)}
			onClose={onClose}
			onSubmit={() => date && onSave(dayjs(date).unix())}
			footer={
				<ActionBar>
					{tenant.expiresAt !== undefined && (
						<Button onClick={() => onSave(null)}>{t('Clear expiry')}</Button>
					)}
					<Button onClick={onClose}>{t('Cancel')}</Button>
					<Button type="submit" color="primary" disabled={!date}>
						{t('Save')}
					</Button>
				</ActionBar>
			}
		>
			<Field label={t('Expiry date')}>
				<Input
					type="date"
					value={date}
					required
					autoFocus
					onChange={(e) => setDate(e.target.value)}
				/>
			</Field>
		</Dialog>
	)
}

function TenantRow({
	tenant,
	canDelete,
	onPasswordReset,
	onMfaReset,
	onSuspend,
	onResume,
	onSetExpiry,
	onDelete
}: {
	tenant: TenantView
	canDelete: boolean
	onPasswordReset: (idTag: string) => void
	onMfaReset: (idTag: string) => void
	onSuspend: (idTag: string) => void
	onResume: (idTag: string) => void
	onSetExpiry: (tenant: TenantView) => void
	onDelete: (idTag: string) => void
}) {
	const { t } = useTranslation()

	const isAdmin = tenant.roles?.includes('admin')
	const isSuspended = tenant.suspendedAt !== undefined
	const isExpired = isTenantExpired(tenant)

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
				<TenantStatusBadge tenant={tenant} />
				{tenant.expiresAt !== undefined && !isExpired && (
					<Text size="sm" emphasis="muted">
						{' '}
						{t('Expires {{date}}', {
							date: formatUnixTime(tenant.expiresAt)
						})}
					</Text>
				)}
			</TableCell>
			<TableCell>
				<Text size="sm" emphasis="muted">
					{tenant.storageUsed !== undefined ? formatBytes(tenant.storageUsed) : '-'}
				</Text>
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
						icon={<IcApiKey />}
						label={t('Reset Password')}
						disabled={!tenant.email}
						description={tenant.email ? undefined : t('No email address set')}
						onClick={() => onPasswordReset(tenant.idTag)}
					/>
					<MenuItem
						icon={<IcPasskey />}
						label={t('Reset MFA')}
						onClick={() => onMfaReset(tenant.idTag)}
					/>
					{isSuspended || isExpired ? (
						<MenuItem
							icon={<IcActive />}
							label={t('Resume')}
							onClick={() => onResume(tenant.idTag)}
						/>
					) : (
						<MenuItem
							icon={<IcSuspended />}
							label={t('Suspend')}
							disabled={!canDelete}
							onClick={() => onSuspend(tenant.idTag)}
						/>
					)}
					<MenuItem
						icon={<IcSchedule />}
						label={t('Set expiry')}
						disabled={!canDelete}
						onClick={() => onSetExpiry(tenant)}
					/>
					{canDelete && (
						<>
							<MenuDivider />
							<MenuItem
								icon={<IcDelete />}
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
	const [expiryFor, setExpiryFor] = React.useState<TenantView | undefined>()

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

	async function handleMfaReset(idTag: string) {
		if (!api) return

		const confirmed = await dialog.confirm(
			t('Reset two-factor authentication'),
			t(
				'This removes the authenticator app from {{idTag}}. Use it when the owner has lost their device.',
				{ idTag }
			),
			{ color: 'error', confirmLabel: t('Reset') }
		)
		if (!confirmed) return

		try {
			await api.admin.resetMfa(idTag)
			await dialog.tell(
				t('Two-factor authentication reset'),
				t('{{idTag}} can now sign in with the password alone.', { idTag })
			)
		} catch (err: unknown) {
			console.error('Failed to reset MFA:', err)
			await dialog.tell(
				t('Error'),
				err instanceof Error ? err.message : t('Failed to reset two-factor authentication')
			)
		}
	}

	async function handleSuspend(idTag: string) {
		if (!api) return

		const confirmed = await dialog.confirm(
			t('Suspend tenant'),
			t(
				'{{idTag}} will not be able to sign in until resumed. Sessions already open end within an hour.',
				{ idTag }
			),
			{ color: 'error', confirmLabel: t('Suspend') }
		)
		if (!confirmed) return

		try {
			await api.admin.suspendTenant(idTag)
			loadTenants(search || undefined)
		} catch (err) {
			await dialog.tell(t('Error'), errorMessage(err))
		}
	}

	async function handleResume(idTag: string) {
		if (!api) return

		const confirmed = await dialog.confirm(
			t('Resume tenant'),
			t('{{idTag}} can sign in again. This also clears the expiry date.', { idTag }),
			{ confirmLabel: t('Resume') }
		)
		if (!confirmed) return

		try {
			await api.admin.resumeTenant(idTag)
			loadTenants(search || undefined)
		} catch (err) {
			await dialog.tell(t('Error'), errorMessage(err))
		}
	}

	async function handleSetExpiry(idTag: string, expiresAt: number | null) {
		if (!api) return
		setExpiryFor(undefined)
		try {
			await api.admin.setTenantExpiry(idTag, expiresAt)
			loadTenants(search || undefined)
		} catch (err) {
			await dialog.tell(t('Error'), errorMessage(err))
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
			await dialog.tell(t('Delete failed'), errorMessage(err))
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
					columns={[t('Tenant'), t('Email'), t('Status'), t('Storage'), t('Actions')]}
				>
					{tenants.map((tenant) => (
						<TenantRow
							key={tenant.idTag}
							tenant={tenant}
							canDelete={tenant.idTag !== auth?.idTag}
							onPasswordReset={handlePasswordReset}
							onMfaReset={handleMfaReset}
							onSuspend={handleSuspend}
							onResume={handleResume}
							onSetExpiry={setExpiryFor}
							onDelete={handleDelete}
						/>
					))}
				</Table>
			)}

			{expiryFor && (
				<ExpiryDialog
					tenant={expiryFor}
					onClose={() => setExpiryFor(undefined)}
					onSave={(expiresAt) => handleSetExpiry(expiryFor.idTag, expiresAt)}
				/>
			)}
		</VBox>
	)
}

// vim: ts=4
