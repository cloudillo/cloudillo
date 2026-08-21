// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { ApiKeyListItem, WebAuthnCredential } from '@cloudillo/core'
import { Button, useApi, useAuth, useDialog, useToast } from '@cloudillo/react'
import { browserSupportsWebAuthn } from '@simplewebauthn/browser'
import { useAtomValue } from 'jotai'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
	LuPalette as IcAppearance,
	LuChevronRight as IcArrow,
	LuCalendar as IcCalendar,
	LuDatabase as IcDatabase,
	LuMonitor as IcDevice,
	LuHardDrive as IcFiles,
	LuDownload as IcInstall,
	LuKeyRound as IcKey,
	LuLoaderCircle as IcLoading,
	LuBell as IcNotifications,
	LuFingerprint as IcPasskey,
	LuEye as IcPrivacy,
	LuRefreshCw as IcRefresh,
	LuDatabaseZap as IcReindex,
	LuShield as IcSecurity,
	LuServerCog as IcServer,
	LuGlobe as IcSite
} from 'react-icons/lu'
import { useNavigate } from 'react-router-dom'

import { activeContextAtom, isContextLeader, useContextAwareApi, useCtx } from '../context/index.js'
import { resetAppCache, type UsePWA } from '../pwa.js'
import { settingsPath, siteAdminPath } from '../routes.js'
import { subscribeNotifications } from './notifications.js'

interface SettingsOverviewProps {
	pwa: UsePWA
}

export function SettingsOverview({ pwa }: SettingsOverviewProps) {
	const { t } = useTranslation()
	const navigate = useNavigate()
	const dialog = useDialog()
	const { toast } = useToast()
	const { api } = useApi()
	const [auth] = useAuth()
	const activeContext = useAtomValue(activeContextAtom)
	// The reindex sweeps the tenant the request authenticates as, so it must go through
	// the active context's proxy token — `useApi()` above is bound to the user's own
	// idTag and would rebuild the wrong tenant in a community.
	const { api: contextApi } = useContextAwareApi()
	const basePath = settingsPath(useCtx().base)

	// Security data
	const [passkeys, setPasskeys] = React.useState<WebAuthnCredential[]>([])
	const [apiKeys, setApiKeys] = React.useState<ApiKeyListItem[]>([])
	const [notificationSubscription, setNotificationSubscription] = React.useState<
		PushSubscription | undefined
	>()
	const [reindexing, setReindexing] = React.useState(false)
	const [optimizing, setOptimizing] = React.useState(false)

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
			if (!api || !auth) return

			// Catch each independently: a single Promise.all rejection would
			// blank both lists, and `hasPasskeys` would then read as false and
			// prompt the user to add a passkey they already have.
			async function load() {
				await Promise.all([
					api!.auth
						.listWebAuthnCredentials()
						.then(setPasskeys)
						.catch((err) => console.error('Failed to load passkeys:', err)),
					api!.auth
						.listApiKeys()
						.then(setApiKeys)
						.catch((err) => console.error('Failed to load API keys:', err))
				])
			}
			load()
		},
		[api, auth]
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
	// Mirrors the backend's `require_leader` on POST /api/search/reindex.
	const canReindex = isContextLeader(activeContext, auth?.idTag)

	// Handlers
	async function handleInstall() {
		if (pwa.doInstall) {
			await pwa.doInstall()
		}
	}

	async function handleResetCache() {
		const confirmed = await dialog.confirm(
			t('Reset App Cache'),
			t(
				'This will clear cached files and reload the page. Your data and login will not be affected. Continue?'
			)
		)
		if (confirmed) {
			await resetAppCache()
		}
	}

	// The 202 only says the sweep was scheduled; the outcome arrives over the WS bus,
	// which `useSearchReindexNotifications` toasts globally. The spinner therefore
	// covers the request, not the minutes-long sweep behind it.
	async function handleReindex() {
		const confirmed = await dialog.confirm(
			t('Rebuild Search Index'),
			t(
				'This re-scans all files, documents, profiles and posts to rebuild the search index. It runs in the background and may take several minutes. Continue?'
			)
		)
		if (!confirmed || !contextApi) return
		setReindexing(true)
		try {
			await contextApi.search.reindex()
			toast({
				variant: 'info',
				title: t('Rebuilding search index'),
				message: t('This runs in the background. You will be notified when it finishes.')
			})
		} catch (err: unknown) {
			if (err instanceof Error) await dialog.tell(t('Error'), err.message)
		} finally {
			setReindexing(false)
		}
	}

	// Server-wide, so it goes through the plain `api` rather than `contextApi`: the
	// metadata database is one file shared by every tenant. Same fire-and-forget shape
	// as the reindex — the outcome arrives on the WS bus.
	async function handleOptimizeDb() {
		const confirmed = await dialog.confirm(
			t('Optimize Database'),
			t(
				'This merges search index segments and reclaims unused disk space across the whole server. It runs in the background and may briefly slow down writes. Continue?'
			)
		)
		if (!confirmed || !api) return
		setOptimizing(true)
		try {
			await api.admin.dbMaintenance()
			toast({
				variant: 'info',
				title: t('Optimizing database'),
				message: t('This runs in the background. You will be notified when it finishes.')
			})
		} catch (err: unknown) {
			if (err instanceof Error) await dialog.tell(t('Error'), err.message)
		} finally {
			setOptimizing(false)
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
							<IcInstall className="me-3" size={24} />
							<div className="flex-fill">
								<div className="font-medium">{t('Install App')}</div>
								<div className="c-hint small">
									{t('Get faster access with the app on your device')}
								</div>
							</div>
							<Button variant="primary" onClick={handleInstall}>
								{t('Install')}
							</Button>
						</div>
					)}

					{!notificationsEnabled && canEnableNotifications && (
						<div className="c-hbox py-3 border-bottom">
							<IcNotifications className="me-3" size={24} />
							<div className="flex-fill">
								<div className="font-medium">{t('Enable Notifications')}</div>
								<div className="c-hint small">
									{t('Stay updated when someone messages you')}
								</div>
							</div>
							<Button variant="primary" onClick={handleEnableNotifications}>
								{t('Enable')}
							</Button>
						</div>
					)}

					{!hasPasskeys && webAuthnSupported && (
						<div className="c-hbox py-3">
							<IcPasskey className="me-3" size={24} />
							<div className="flex-fill">
								<div className="font-medium">{t('Add a Passkey')}</div>
								<div className="c-hint small">
									{t('Login faster with fingerprint or face ID')}
								</div>
							</div>
							<Button
								variant="primary"
								onClick={() => navigate(`${basePath}/security`)}
							>
								{t('Add')}
							</Button>
						</div>
					)}
				</div>
			)}

			{/* Security Summary */}
			<div className="c-panel">
				<h4 className="c-hbox pb-2">
					<IcSecurity className="me-2" />
					{t('Security')}
				</h4>

				<div className="c-hbox g-4 py-2">
					<div className="c-hbox">
						<IcPasskey className="me-2 text-muted" />
						<span>
							{passkeys.length} {passkeys.length === 1 ? t('Passkey') : t('Passkeys')}
						</span>
					</div>
					<div className="c-hbox">
						<IcDevice className="me-2 text-muted" />
						<span>
							{apiKeys.length} {apiKeys.length === 1 ? t('Device') : t('Devices')}
						</span>
					</div>
				</div>

				<div className="pt-2">
					<button
						className="c-link c-hbox"
						onClick={() => navigate(`${basePath}/security`)}
					>
						{t('Security Settings')}
						<IcArrow className="ms-1" />
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
						icon={<IcCalendar size={28} />}
						label={t('Calendar')}
						onClick={() => navigate(`${basePath}/calendar`)}
					/>
					<QuickActionCard
						icon={<IcFiles size={28} />}
						label={t('Files')}
						onClick={() => navigate(`${basePath}/files`)}
					/>
					<QuickActionCard
						icon={<IcSite size={28} />}
						label={t('Site')}
						onClick={() => navigate(`${basePath}/site`)}
					/>
				</div>
			</div>

			{/* Server Settings Link (for admins) */}
			{auth?.roles?.includes('SADM') && (
				<div className="c-panel">
					<button
						className="c-hbox align-items-center p-2 w-100 text-start"
						onClick={() => navigate(siteAdminPath())}
						style={{ cursor: 'pointer', border: 'none', background: 'transparent' }}
					>
						<IcServer className="text-primary me-3" size={24} />
						<div className="flex-fill">
							<div className="font-medium">{t('Server Settings')}</div>
							<div className="c-hint small">
								{t('Configure server-wide settings and policies')}
							</div>
						</div>
						<IcArrow className="text-muted" />
					</button>
				</div>
			)}

			{/* Troubleshooting */}
			<div className="c-panel">
				<h4 className="pb-2">{t('Troubleshooting')}</h4>
				<div className="c-hbox py-3 border-bottom">
					<IcRefresh className="me-3" size={24} />
					<div className="flex-fill">
						<div className="font-medium">{t('Reset App Cache')}</div>
						<div className="c-hint small">
							{t(
								'Clear cached files and reload. Use if the app behaves unexpectedly.'
							)}
						</div>
					</div>
					<Button variant="secondary" onClick={handleResetCache}>
						{t('Reset')}
					</Button>
				</div>
				{canReindex && (
					<div className="c-hbox py-3 border-bottom">
						<IcReindex className="me-3" size={24} />
						<div className="flex-fill">
							<div className="font-medium">{t('Rebuild Search Index')}</div>
							<div className="c-hint small">
								{t(
									'Re-scan your files and posts. Use if search results are missing or stale.'
								)}
							</div>
						</div>
						<Button variant="secondary" onClick={handleReindex} disabled={reindexing}>
							{reindexing ? (
								<IcLoading className="animate-rotate-cw" />
							) : (
								t('Rebuild')
							)}
						</Button>
					</div>
				)}
				{auth?.roles?.includes('SADM') && (
					<div className="c-hbox py-3">
						<IcDatabase className="me-3" size={24} />
						<div className="flex-fill">
							<div className="font-medium">{t('Optimize Database')}</div>
							<div className="c-hint small">
								{t(
									'Compact the search index and reclaim unused disk space. Affects the whole server.'
								)}
							</div>
						</div>
						<Button
							variant="secondary"
							onClick={handleOptimizeDb}
							disabled={optimizing}
						>
							{optimizing ? (
								<IcLoading className="animate-rotate-cw" />
							) : (
								t('Optimize')
							)}
						</Button>
					</div>
				)}
				<div className="c-hint small pt-2">
					{t('Version')}: {process.env.CLOUDILLO_VERSION}
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
