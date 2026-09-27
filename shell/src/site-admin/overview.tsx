// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { TenantView } from '@cloudillo/core'
import {
	Alert,
	Button,
	Card,
	Grid,
	HBox,
	Panel,
	Text,
	useApi,
	useAuth,
	VBox
} from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
	LuChevronRight as IcArrow,
	LuCheck as IcCheck,
	LuUsersRound as IcCommunity,
	LuX as IcError,
	LuAtSign as IcInvitations,
	LuMail as IcMail,
	LuSettings as IcSettings,
	LuUser as IcUser,
	LuUsers as IcUsers
} from 'react-icons/lu'

import { HOME_BASE, settingsPath, siteAdminPath } from '../routes.js'
import { useSettings } from '../settings/settings.js'

interface Ref {
	refId: string
	type: string
	description?: string
	createdAt: Date
	expiresAt?: Date
	count?: number
}

export function AdminOverview() {
	const { t } = useTranslation()
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
							? refsRes.map((ref) => ({
									...ref,
									createdAt: new Date(ref.createdAt),
									expiresAt: ref.expiresAt ? new Date(ref.expiresAt) : undefined
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
		(inv) => (inv.count ?? 0) > 0 && (!inv.expiresAt || new Date(inv.expiresAt) > new Date())
	)
	const personalProfiles = tenants.filter((t) => t.type !== 'community')
	const communityProfiles = tenants.filter((t) => t.type === 'community')

	return (
		<>
			{/* Critical Setup Warnings - only show after settings are loaded */}
			{emailSettingsLoaded && !emailConfigured && (
				<Alert
					color="warning"
					className="animate-fade-slide-up"
					title={t('Email Not Configured')}
					actions={
						<Button color="primary" href={siteAdminPath('email')}>
							{t('Configure')}
						</Button>
					}
				>
					{t('Password resets and email notifications will not work')}
				</Alert>
			)}

			{/* Stats Overview */}
			<Panel title={t('Overview')} className="animate-fade-slide-up stagger-1">
				<Grid min="140px" gap={3}>
					{/* Profiles card with breakdown */}
					<StatCard
						value={loading ? '...' : tenants.length}
						label={t('Profiles')}
						icon={<IcUsers size={20} />}
					>
						{!loading && (
							<HBox gap={3} justify="center" className="mt-2">
								<Text size="sm" emphasis="muted">
									<IcUser size={14} /> {personalProfiles.length}
								</Text>
								<Text size="sm" emphasis="muted">
									<IcCommunity size={14} /> {communityProfiles.length}
								</Text>
							</HBox>
						)}
					</StatCard>
					<StatCard
						value={loading ? '...' : pendingInvitations.length}
						label={t('Pending Invitations')}
						icon={<IcInvitations size={20} />}
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
						icon={<IcMail size={20} />}
					/>
				</Grid>
			</Panel>

			{/* Personal Settings Link */}
			<Card
				className="animate-fade-slide-up stagger-2"
				// `AdminOverview` only ever renders under `~` — the SiteAdmin chrome
				// redirects any other context.
				href={settingsPath(HOME_BASE)}
			>
				<HBox gap={3} align="center" className="p-2">
					<IcSettings className="text-primary" size={24} />
					<VBox className="flex-fill">
						<Text weight="medium">{t('Personal Settings')}</Text>
						<Text size="sm" emphasis="muted">
							{t('Configure your personal account settings')}
						</Text>
					</VBox>
					<IcArrow className="text-muted" />
				</HBox>
			</Card>
		</>
	)
}

interface StatCardProps {
	value: React.ReactNode
	label: string
	icon: React.ReactNode
	children?: React.ReactNode
}

function StatCard({ value, label, icon, children }: StatCardProps) {
	return (
		<Card>
			<VBox align="center" gap={1}>
				<Text emphasis="muted">{icon}</Text>
				<Text size="2xl" weight="semibold">
					{value}
				</Text>
				<Text size="sm" emphasis="muted">
					{label}
				</Text>
				{children}
			</VBox>
		</Card>
	)
}

// vim: ts=4
