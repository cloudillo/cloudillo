// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import debounce from 'debounce'

import {
	useApi,
	useAuth,
	useDialog,
	Button,
	Menu,
	MenuDivider,
	MenuItem,
	Modal,
	ProfilePicture
} from '@cloudillo/react'
import type { TenantView } from '@cloudillo/core'

import {
	LuKey as IcKey,
	LuSearch as IcSearch,
	LuRefreshCw as IcLoading,
	LuSettings as IcSettings,
	LuTrash2 as IcTrash,
	LuUser as IcPerson,
	LuUsers as IcCommunity,
	LuShield as IcAdmin,
	LuEllipsisVertical as IcMore
} from 'react-icons/lu'

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
	const navigate = useNavigate()
	const [menuPos, setMenuPos] = React.useState<{ x: number; y: number } | null>(null)

	const isAdmin = tenant.roles?.includes('admin')
	const statusLabel = tenant.status === 'A' ? t('Active') : (tenant.status ?? t('Unknown'))
	const statusColor = tenant.status === 'A' ? 'var(--col-success)' : 'var(--col-warning)'

	function openMenu(e: React.MouseEvent<HTMLButtonElement>) {
		const rect = e.currentTarget.getBoundingClientRect()
		const MENU_WIDTH = 220
		const x = Math.max(8, Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8))
		setMenuPos({ x, y: rect.bottom + 4 })
	}

	return (
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
				<ProfilePicture profile={{ profilePic: tenant.profilePic }} srcTag={tenant.idTag} />
			</div>

			<div className="flex-fill c-hbox align-items-center g-2" style={{ minWidth: 0 }}>
				<Link
					to={`/site-admin/tenants/${encodeURIComponent(tenant.idTag)}`}
					style={{
						minWidth: 0,
						overflow: 'hidden',
						textOverflow: 'ellipsis',
						whiteSpace: 'nowrap'
					}}
				>
					<strong>{tenant.name}</strong>{' '}
					<span className="text-muted small">@{tenant.idTag}</span>
				</Link>
				<span
					className="text-muted"
					title={tenant.type === 'community' ? t('Community') : t('Person')}
					style={{
						width: '1.25rem',
						height: '1.25rem',
						display: 'inline-flex',
						alignItems: 'center',
						justifyContent: 'center',
						flexShrink: 0
					}}
				>
					{tenant.type === 'community' ? <IcCommunity /> : <IcPerson />}
				</span>
				{isAdmin && (
					<span
						className="c-badge info"
						title={t('Administrator')}
						style={{ flexShrink: 0 }}
					>
						<IcAdmin />
					</span>
				)}
			</div>

			<div
				className="sm-hide text-muted small"
				style={{
					width: '14rem',
					overflow: 'hidden',
					textOverflow: 'ellipsis',
					whiteSpace: 'nowrap',
					flexShrink: 0
				}}
				title={tenant.email}
			>
				{tenant.email}
			</div>

			<span
				title={statusLabel}
				aria-label={statusLabel}
				style={{
					width: '0.625rem',
					height: '0.625rem',
					borderRadius: '50%',
					background: statusColor,
					flexShrink: 0
				}}
			/>

			<button
				type="button"
				className="c-button icon link"
				aria-label={t('Tenant actions')}
				aria-haspopup="menu"
				aria-expanded={menuPos !== null}
				title={t('Tenant actions')}
				onClick={openMenu}
			>
				<IcMore />
			</button>

			{menuPos && (
				<Menu position={menuPos} onClose={() => setMenuPos(null)}>
					<MenuItem
						icon={<IcSettings />}
						label={t('Settings')}
						onClick={() => {
							setMenuPos(null)
							navigate(`/site-admin/tenants/${encodeURIComponent(tenant.idTag)}`)
						}}
					/>
					<MenuItem
						icon={<IcKey />}
						label={t('Reset Password')}
						disabled={!tenant.email}
						title={tenant.email ? undefined : t('No email address set')}
						onClick={() => {
							setMenuPos(null)
							onPasswordReset(tenant.idTag)
						}}
					/>
					{canDelete && (
						<>
							<MenuDivider />
							<MenuItem
								icon={<IcTrash />}
								label={t('Delete tenant')}
								danger
								onClick={() => {
									setMenuPos(null)
									onDelete(tenant.idTag)
								}}
							/>
						</>
					)}
				</Menu>
			)}
		</div>
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
	const [purgeTarget, setPurgeTarget] = React.useState<string | undefined>()
	const [purgeInput, setPurgeInput] = React.useState('')
	const [purgeBusy, setPurgeBusy] = React.useState(false)

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
			})
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

		setPurgeTarget(idTag)
		setPurgeInput('')
	}

	async function confirmPurge() {
		if (!api || !purgeTarget) return
		const target = purgeTarget
		setPurgeBusy(true)
		try {
			const res = await api.admin.purgeTenant(target, { confirmIdTag: target })
			setPurgeBusy(false)
			setPurgeTarget(undefined)
			setPurgeInput('')
			await dialog.tell(
				t('Tenant deleted'),
				t('{{idTag}} has been removed.', { idTag: res.idTag })
			)
			loadTenants(search || undefined)
		} catch (err) {
			setPurgeBusy(false)
			setPurgeTarget(undefined)
			setPurgeInput('')
			await dialog.tell(t('Delete failed'), err instanceof Error ? err.message : String(err))
		}
	}

	return (
		<div className="c-vbox g-3">
			<div className="c-input-group">
				<div className="c-button icon">
					{loading ? <IcLoading className="animate-rotate-cw" /> : <IcSearch />}
				</div>
				<input
					className="c-input"
					type="text"
					placeholder={t('Search tenants...')}
					value={search}
					onChange={(e) => setSearch(e.target.value)}
				/>
			</div>

			{error && <div className="c-panel error">{error}</div>}

			{!loading && tenants && tenants.length === 0 && (
				<div className="c-panel info">{t('No tenants found')}</div>
			)}

			{tenants?.map((tenant) => (
				<TenantRow
					key={tenant.idTag}
					tenant={tenant}
					canDelete={tenant.idTag !== auth?.idTag}
					onPasswordReset={handlePasswordReset}
					onDelete={handleDelete}
				/>
			))}

			<Modal
				open={!!purgeTarget}
				onClose={() => {
					if (!purgeBusy) {
						setPurgeTarget(undefined)
						setPurgeInput('')
					}
				}}
			>
				<div className="c-panel p-3" style={{ minWidth: '20rem', maxWidth: '32rem' }}>
					<h3>{t('Type the tenant ID to confirm')}</h3>
					<p>
						{t('Type {{idTag}} below to confirm immediate deletion.', {
							idTag: purgeTarget ?? ''
						})}
					</p>
					<input
						className="c-input w-100"
						type="text"
						placeholder={purgeTarget}
						value={purgeInput}
						onChange={(e) => setPurgeInput(e.target.value)}
						autoFocus
						disabled={purgeBusy}
					/>
					<div className="c-hbox g-2 mt-3">
						<div className="fill" />
						<Button
							kind="link"
							onClick={() => {
								setPurgeTarget(undefined)
								setPurgeInput('')
							}}
							disabled={purgeBusy}
						>
							{t('Cancel')}
						</Button>
						<Button
							className="text-error"
							onClick={confirmPurge}
							disabled={purgeBusy || purgeInput !== purgeTarget}
						>
							{purgeBusy ? <IcLoading className="animate-rotate-cw" /> : <IcTrash />}
							{t('Delete tenant')}
						</Button>
					</div>
				</div>
			</Modal>
		</div>
	)
}

// vim: ts=4
