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
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { browserSupportsWebAuthn } from '@simplewebauthn/browser'

import {
	LuDownload as IcInstall,
	LuBell as IcNotifications,
	LuFingerprint as IcPasskey,
	LuShield as IcSecurity,
	LuEye as IcPrivacy,
	LuPalette as IcAppearance,
	LuHardDrive as IcFiles,
	LuKeyRound as IcKey,
	LuMonitor as IcDevice,
	LuChevronRight as IcArrow
} from 'react-icons/lu'

import { useAuth, useApi, Button } from '@cloudillo/react'
import type { WebAuthnCredential, ApiKeyListItem } from '@cloudillo/base'

import { UsePWA } from '../pwa.js'
import { subscribeNotifications } from './notifications.js'

interface SettingsOverviewProps {
	pwa: UsePWA
}

export function SettingsOverview({ pwa }: SettingsOverviewProps) {
	const { t } = useTranslation()
	const navigate = useNavigate()
	const params = useParams()
	const { api } = useApi()
	const [auth] = useAuth()
	const contextIdTag = params.contextIdTag!
	const basePath = `/settings/${contextIdTag}`

	// Security data
	const [passkeys, setPasskeys] = React.useState<WebAuthnCredential[]>([])
	const [apiKeys, setApiKeys] = React.useState<ApiKeyListItem[]>([])
	const [notificationSubscription, setNotificationSubscription] = React.useState<
		PushSubscription | undefined
	>()

	// Feature detection
	const isInstalled = React.useMemo(
		() => window.matchMedia('(display-mode: standalone)').matches,
		[]
	)
	const canInstall = !isInstalled && !!pwa.doInstall
	const webAuthnSupported = React.useMemo(() => browserSupportsWebAuthn(), [])

	// Load security data
	React.useEffect(
		function loadSecurityData() {
			if (!api) return

			async function load() {
				try {
					const [credentials, keys] = await Promise.all([
						api!.auth.listWebAuthnCredentials(),
						api!.auth.listApiKeys()
					])
					setPasskeys(credentials)
					setApiKeys(keys)
				} catch (err) {
					console.error('Failed to load security data:', err)
				}
			}
			load()
		},
		[api]
	)

	// Check notification subscription status
	React.useEffect(function checkNotifications() {
		;(async function () {
			if (window.Notification?.permission === 'granted') {
				const sw = await navigator.serviceWorker.ready
				const subscription = (await sw?.pushManager?.getSubscription()) || undefined
				setNotificationSubscription(subscription)
			}
		})()
	}, [])

	const notificationsEnabled = Notification.permission === 'granted' && !!notificationSubscription
	const canEnableNotifications = 'Notification' in window && Notification.permission !== 'denied'
	const hasPasskeys = passkeys.length > 0

	// Handlers
	async function handleInstall() {
		if (pwa.doInstall) {
			await pwa.doInstall()
		}
	}

	async function handleEnableNotifications() {
		try {
			const subscription = await subscribeNotifications(api, pwa)
			if (subscription) {
				setNotificationSubscription(subscription)
			}
		} catch (err) {
			console.error('Failed to enable notifications:', err)
		}
	}

	// Check if we have any recommendations to show
	const hasRecommendations =
		canInstall ||
		(!notificationsEnabled && canEnableNotifications) ||
		(!hasPasskeys && webAuthnSupported)

	return (
		<>
			{/* Setup Recommendations */}
			{hasRecommendations && (
				<div className="c-panel">
					<h4 className="pb-2">{t('Enhance Your Experience')}</h4>

					{canInstall && (
						<div className="c-hbox py-3 border-bottom">
							<IcInstall className="mr-3" size={24} />
							<div className="flex-fill">
								<div className="fw-medium">{t('Install App')}</div>
								<div className="c-hint small">
									{t('Get faster access with the app on your device')}
								</div>
							</div>
							<Button primary onClick={handleInstall}>
								{t('Install')}
							</Button>
						</div>
					)}

					{!notificationsEnabled && canEnableNotifications && (
						<div className="c-hbox py-3 border-bottom">
							<IcNotifications className="mr-3" size={24} />
							<div className="flex-fill">
								<div className="fw-medium">{t('Enable Notifications')}</div>
								<div className="c-hint small">
									{t('Stay updated when someone messages you')}
								</div>
							</div>
							<Button primary onClick={handleEnableNotifications}>
								{t('Enable')}
							</Button>
						</div>
					)}

					{!hasPasskeys && webAuthnSupported && (
						<div className="c-hbox py-3">
							<IcPasskey className="mr-3" size={24} />
							<div className="flex-fill">
								<div className="fw-medium">{t('Add a Passkey')}</div>
								<div className="c-hint small">
									{t('Login faster with fingerprint or face ID')}
								</div>
							</div>
							<Button primary onClick={() => navigate(`${basePath}/security`)}>
								{t('Add')}
							</Button>
						</div>
					)}
				</div>
			)}

			{/* Security Summary */}
			<div className="c-panel">
				<h4 className="c-hbox pb-2">
					<IcSecurity className="mr-2" />
					{t('Security')}
				</h4>

				<div className="c-hbox g-4 py-2">
					<div className="c-hbox">
						<IcPasskey className="mr-2 text-muted" />
						<span>
							{passkeys.length} {t(passkeys.length === 1 ? 'Passkey' : 'Passkeys')}
						</span>
					</div>
					<div className="c-hbox">
						<IcDevice className="mr-2 text-muted" />
						<span>
							{apiKeys.length} {t(apiKeys.length === 1 ? 'Device' : 'Devices')}
						</span>
					</div>
				</div>

				<div className="pt-2">
					<button
						className="c-link c-hbox"
						onClick={() => navigate(`${basePath}/security`)}
					>
						{t('Security Settings')}
						<IcArrow className="ml-1" />
					</button>
				</div>
			</div>

			{/* Quick Actions */}
			<div className="c-panel">
				<h4 className="pb-3">{t('Settings')}</h4>

				<div
					style={{
						display: 'grid',
						gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
						gap: '1rem'
					}}
				>
					<QuickActionCard
						icon={<IcKey size={28} />}
						label={t('Security')}
						onClick={() => navigate(`${basePath}/security`)}
					/>
					<QuickActionCard
						icon={<IcPrivacy size={28} />}
						label={t('Privacy')}
						onClick={() => navigate(`${basePath}/privacy`)}
					/>
					<QuickActionCard
						icon={<IcNotifications size={28} />}
						label={t('Notifications')}
						onClick={() => navigate(`${basePath}/notifications`)}
					/>
					<QuickActionCard
						icon={<IcAppearance size={28} />}
						label={t('Appearance')}
						onClick={() => navigate(`${basePath}/appearance`)}
					/>
					<QuickActionCard
						icon={<IcFiles size={28} />}
						label={t('Files')}
						onClick={() => navigate(`${basePath}/files`)}
					/>
				</div>
			</div>
		</>
	)
}

interface QuickActionCardProps {
	icon: React.ReactNode
	label: string
	onClick: () => void
}

function QuickActionCard({ icon, label, onClick }: QuickActionCardProps) {
	return (
		<button
			className="c-panel text-center p-3"
			onClick={onClick}
			style={{
				cursor: 'pointer',
				border: 'none',
				transition: 'transform 0.15s ease, box-shadow 0.15s ease'
			}}
			onMouseEnter={(e) => {
				e.currentTarget.style.transform = 'translateY(-2px)'
			}}
			onMouseLeave={(e) => {
				e.currentTarget.style.transform = 'translateY(0)'
			}}
		>
			<div className="mb-2 text-primary">{icon}</div>
			<div className="small">{label}</div>
		</button>
	)
}

// vim: ts=4
