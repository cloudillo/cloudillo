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
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import {
	LuTriangleAlert as IcWarning,
	LuMail as IcMail,
	LuShieldCheck as IcIdps,
	LuUsers as IcUsers,
	LuUser as IcUser,
	LuUsersRound as IcCommunity,
	LuAtSign as IcInvitations,
	LuServer as IcServer,
	LuHardDrive as IcStorage,
	LuUser as IcTenant,
	LuCheck as IcCheck,
	LuX as IcError,
	LuChevronRight as IcArrow,
	LuSettings as IcSettings
} from 'react-icons/lu'

import { useAuth, useApi, Button, Card } from '@cloudillo/react'
import { TenantView } from '@cloudillo/core'

import { useSettings } from '../settings/settings.js'

interface Ref {
	refId: string
	type: string
	description?: string
	createdAt: Date
	expiresAt?: Date
	count: number
}

export function AdminOverview() {
	const { t } = useTranslation()
	const navigate = useNavigate()
	const { api } = useApi()
	const [auth] = useAuth()

	// Settings
	const { settings: emailSettings } = useSettings('email')

	// Data
	const [tenants, setTenants] = React.useState<TenantView[]>([])
	const [invitations, setInvitations] = React.useState<Ref[]>([])
	const [loading, setLoading] = React.useState(true)

	// Load data
	React.useEffect(
		function loadData() {
			if (!auth || !api) return

			async function load() {
				setLoading(true)
				try {
					const [tenantsRes, refsRes] = await Promise.all([
						api!.admin.listTenants(),
						api!.refs.list({ type: 'register' })
					])
					setTenants(tenantsRes || [])
					setInvitations(
						Array.isArray(refsRes)
							? refsRes.map((ref: any) => ({
									...ref,
									createdAt: new Date(ref.createdAt)
								}))
							: []
					)
				} catch (err) {
					console.error('Failed to load admin data:', err)
				} finally {
					setLoading(false)
				}
			}
			load()
		},
		[auth, api]
	)

	// Calculate stats
	const emailSettingsLoaded = emailSettings !== undefined
	const emailConfigured = emailSettings?.['email.enabled'] && emailSettings?.['email.smtp.host']
	const pendingInvitations = invitations.filter(
		(inv) => inv.count > 0 && (!inv.expiresAt || new Date(inv.expiresAt) > new Date())
	)
	const personalProfiles = tenants.filter((t) => t.type !== 'community')
	const communityProfiles = tenants.filter((t) => t.type === 'community')

	return (
		<>
			{/* Critical Setup Warnings - only show after settings are loaded */}
			{emailSettingsLoaded && !emailConfigured && (
				<div
					className="c-panel animate-fade-slide-up"
					style={{ borderLeft: '4px solid var(--col-warning)' }}
				>
					<div className="c-hbox py-2">
						<IcWarning className="mr-3 text-warning" size={24} />
						<div className="flex-fill">
							<div className="fw-medium">{t('Email Not Configured')}</div>
							<div className="c-hint small">
								{t('Password resets and email notifications will not work')}
							</div>
						</div>
						<Button primary onClick={() => navigate('/site-admin/email')}>
							{t('Configure')}
						</Button>
					</div>
				</div>
			)}

			{/* Stats Overview */}
			<div className="c-panel animate-fade-slide-up stagger-1">
				<h4 className="pb-3">{t('Overview')}</h4>

				<div
					style={{
						display: 'grid',
						gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
						gap: '1rem'
					}}
				>
					{/* Profiles card with breakdown */}
					<Card className="text-center">
						<div className="mb-1">
							<IcUsers size={20} className="text-muted" />
						</div>
						<div style={{ fontSize: '1.75rem', fontWeight: 600, lineHeight: 1.2 }}>
							{loading ? '...' : tenants.length}
						</div>
						<div className="c-hint small mt-1">{t('Profiles')}</div>
						{!loading && (
							<div
								className="c-hbox g-3 mt-2 small text-muted"
								style={{ justifyContent: 'center' }}
							>
								<span className="c-hbox g-1">
									<IcUser size={14} />
									{personalProfiles.length}
								</span>
								<span className="c-hbox g-1">
									<IcCommunity size={14} />
									{communityProfiles.length}
								</span>
							</div>
						)}
					</Card>
					<StatCard
						value={loading ? '...' : String(pendingInvitations.length)}
						label={t('Pending Invitations')}
						icon={<IcInvitations size={20} className="text-muted" />}
					/>
					<StatCard
						value={
							!emailSettingsLoaded ? (
								'...'
							) : emailConfigured ? (
								<IcCheck size={24} className="text-success" />
							) : (
								<IcError size={24} className="text-warning" />
							)
						}
						label={t('Email')}
						icon={<IcMail size={20} className="text-muted" />}
					/>
				</div>
			</div>

			{/* Personal Settings Link */}
			<Card
				interactive
				className="animate-fade-slide-up stagger-2"
				onClick={() => navigate(`/settings/${auth?.idTag}`)}
			>
				<div className="c-hbox ai-center p-2">
					<IcSettings className="text-primary mr-3" size={24} />
					<div className="flex-fill">
						<div className="fw-medium">{t('Personal Settings')}</div>
						<div className="c-hint small">
							{t('Configure your personal account settings')}
						</div>
					</div>
					<IcArrow className="text-muted" />
				</div>
			</Card>

			{/* Quick Actions */}
			<div className="c-panel animate-fade-slide-up stagger-3">
				<h4 className="pb-3">{t('Administration')}</h4>

				<div
					style={{
						display: 'grid',
						gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
						gap: '1rem'
					}}
				>
					<QuickActionCard
						icon={<IcInvitations size={28} />}
						label={t('Invitations')}
						onClick={() => navigate('/site-admin/invitations')}
					/>
					<QuickActionCard
						icon={<IcUsers size={28} />}
						label={t('Users & Communities')}
						onClick={() => navigate('/site-admin/tenants')}
					/>
					<QuickActionCard
						icon={<IcIdps size={28} />}
						label={t('Suggested Providers')}
						onClick={() => navigate('/site-admin/idps')}
					/>
					<QuickActionCard
						icon={<IcServer size={28} />}
						label={t('Server')}
						onClick={() => navigate('/site-admin/server')}
					/>
					<QuickActionCard
						icon={<IcStorage size={28} />}
						label={t('Storage')}
						onClick={() => navigate('/site-admin/storage')}
					/>
					<QuickActionCard
						icon={<IcMail size={28} />}
						label={t('Email')}
						onClick={() => navigate('/site-admin/email')}
					/>
					<QuickActionCard
						icon={<IcTenant size={28} />}
						label={t('Default Policies')}
						onClick={() => navigate('/site-admin/tenant')}
					/>
				</div>
			</div>
		</>
	)
}

interface StatCardProps {
	value: React.ReactNode
	label: string
	icon: React.ReactNode
}

function StatCard({ value, label, icon }: StatCardProps) {
	return (
		<Card className="text-center">
			<div className="mb-1">{icon}</div>
			<div style={{ fontSize: '1.75rem', fontWeight: 600, lineHeight: 1.2 }}>{value}</div>
			<div className="c-hint small mt-1">{label}</div>
		</Card>
	)
}

interface QuickActionCardProps {
	icon: React.ReactNode
	label: string
	onClick: () => void
}

function QuickActionCard({ icon, label, onClick }: QuickActionCardProps) {
	return (
		<Card interactive className="text-center" onClick={onClick}>
			<div className="mb-2 text-primary">{icon}</div>
			<div className="small">{label}</div>
		</Card>
	)
}

// vim: ts=4
