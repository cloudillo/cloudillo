// This file is part of the Cloudillo Platform.
// Copyright (C) 2024  Szilárd Hajba
//
// Cloudillo is free software: you can redistribute it and/or modify
// it under the terms of the GNU Lesser General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Lesser General Public License for more details.
//
// You should have received a copy of the GNU Lesser General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import debounce from 'debounce'

import { useApi, useAuth, useDialog, Button, ProfilePicture } from '@cloudillo/react'
import { TenantView } from '@cloudillo/base'

import {
	LuMail as IcMail,
	LuKey as IcKey,
	LuSearch as IcSearch,
	LuRefreshCw as IcLoading,
	LuUser as IcPerson,
	LuUsers as IcCommunity,
	LuShield as IcAdmin
} from 'react-icons/lu'

function TenantCard({
	tenant,
	onPasswordReset
}: {
	tenant: TenantView
	onPasswordReset: (idTag: string) => void
}) {
	const { t } = useTranslation()

	const isAdmin = tenant.roles?.includes('admin')
	const createdDate = new Date(tenant.createdAt * 1000)

	return (
		<div className="c-panel p-3">
			<div className="c-hbox g-3">
				<div
					style={{
						width: '3rem',
						height: '3rem',
						borderRadius: '50%',
						overflow: 'hidden'
					}}
				>
					<ProfilePicture
						profile={{ profilePic: tenant.profilePic }}
						srcTag={tenant.idTag}
					/>
				</div>
				<div className="fill">
					<div className="c-hbox">
						<h3 className="fill">{tenant.name}</h3>
						{isAdmin && (
							<span className="c-badge info" title={t('Administrator')}>
								<IcAdmin />
							</span>
						)}
						{tenant.type === 'community' ? (
							<IcCommunity className="text-muted" title={t('Community')} />
						) : (
							<IcPerson className="text-muted" title={t('Person')} />
						)}
					</div>
					<div className="text-muted">@{tenant.idTag}</div>
				</div>
			</div>

			<div className="c-vbox g-1 mt-3">
				{tenant.email && (
					<div className="c-hbox g-2">
						<IcMail className="text-muted" />
						<span>{tenant.email}</span>
					</div>
				)}
				<div className="c-hbox g-2">
					<span className="text-muted">{t('Created')}:</span>
					<span>{createdDate.toLocaleDateString()}</span>
				</div>
				{tenant.status && (
					<div className="c-hbox g-2">
						<span className="text-muted">{t('Status')}:</span>
						<span
							className={`c-badge ${tenant.status === 'A' ? 'success' : 'warning'}`}
						>
							{tenant.status === 'A' ? t('Active') : tenant.status}
						</span>
					</div>
				)}
			</div>

			<footer className="c-hbox g-2 mt-3 pt-3 border-top">
				{tenant.email ? (
					<Button
						link
						onClick={() => onPasswordReset(tenant.idTag)}
						title={t('Send password reset email')}
					>
						<IcKey />
						{t('Reset Password')}
					</Button>
				) : (
					<span className="text-muted">{t('No email address set')}</span>
				)}
			</footer>
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
			} catch (err: any) {
				console.error('Failed to load tenants:', err)
				setError(err.message || t('Failed to load tenants'))
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
		} catch (err: any) {
			console.error('Failed to send password reset:', err)
			await dialog.tell(t('Error'), err.message || t('Failed to send password reset email'))
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

			{tenants &&
				tenants.map((tenant) => (
					<TenantCard
						key={tenant.idTag}
						tenant={tenant}
						onPasswordReset={handlePasswordReset}
					/>
				))}
		</div>
	)
}

// vim: ts=4
