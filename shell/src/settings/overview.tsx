// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { ApiKeyListItem, WebAuthnCredential } from '@cloudillo/core'
import {
	Button,
	HBox,
	IconText,
	Link,
	List,
	ListItem,
	Panel,
	Text,
	useApi,
	useAuth,
	useDialog,
	useToast
} from '@cloudillo/react'
import { browserSupportsWebAuthn } from '@simplewebauthn/browser'
import { useAtomValue } from 'jotai'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
	LuChevronRight as IcArrow,
	LuDatabase as IcDatabase,
	LuMonitor as IcDevice,
	LuDownload as IcInstall,
	LuBell as IcNotifications,
	LuFingerprint as IcPasskey,
	LuRefreshCw as IcRefresh,
	LuDatabaseZap as IcReindex,
	LuShield as IcSecurity,
	LuServerCog as IcServer
} from 'react-icons/lu'

import { activeContextAtom, isContextLeader, useContextAwareApi, useCtx } from '../context/index.js'
import { resetAppCache, type UsePWA } from '../pwa.js'
import { settingsPath, siteAdminPath } from '../routes.js'
import { subscribeNotifications } from './notifications.js'

interface SettingsOverviewProps {
	pwa: UsePWA
}

export function SettingsOverview({ pwa }: SettingsOverviewProps) {
	const { t } = useTranslation()
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
			{hasRecommendations && (
				<Panel title={t('Enhance Your Experience')}>
					<List variant="divided">
						{canInstall && (
							<ListItem
								leading={<IcInstall size={24} />}
								title={t('Install App')}
								subtitle={t('Get faster access with the app on your device')}
								trailing={
									<Button color="primary" onClick={handleInstall}>
										{t('Install')}
									</Button>
								}
							/>
						)}
						{!notificationsEnabled && canEnableNotifications && (
							<ListItem
								leading={<IcNotifications size={24} />}
								title={t('Enable Notifications')}
								subtitle={t('Stay updated when someone messages you')}
								trailing={
									<Button color="primary" onClick={handleEnableNotifications}>
										{t('Enable')}
									</Button>
								}
							/>
						)}
						{!hasPasskeys && webAuthnSupported && (
							<ListItem
								leading={<IcPasskey size={24} />}
								title={t('Add a Passkey')}
								subtitle={t('Login faster with fingerprint or face ID')}
								trailing={
									<Button color="primary" href={`${basePath}/security`}>
										{t('Add')}
									</Button>
								}
							/>
						)}
					</List>
				</Panel>
			)}

			<Panel title={<IconText icon={<IcSecurity />}>{t('Security')}</IconText>}>
				<HBox gap={4} className="py-2">
					<IconText icon={<IcPasskey className="text-muted" />}>
						{passkeys.length} {passkeys.length === 1 ? t('Passkey') : t('Passkeys')}
					</IconText>
					<IconText icon={<IcDevice className="text-muted" />}>
						{apiKeys.length} {apiKeys.length === 1 ? t('Device') : t('Devices')}
					</IconText>
				</HBox>
				<Link href={`${basePath}/security`} className="mt-2">
					{t('Security Settings')}
					<IcArrow />
				</Link>
			</Panel>

			{auth?.roles?.includes('SADM') && (
				<Panel>
					<List>
						<ListItem
							href={siteAdminPath()}
							leading={<IcServer className="text-primary" size={24} />}
							title={t('Server Settings')}
							subtitle={t('Configure server-wide settings and policies')}
						/>
					</List>
				</Panel>
			)}

			<Panel title={t('Troubleshooting')}>
				<List variant="divided">
					<ListItem
						leading={<IcRefresh size={24} />}
						title={t('Reset App Cache')}
						subtitle={t(
							'Clear cached files and reload. Use if the app behaves unexpectedly.'
						)}
						trailing={
							<Button color="secondary" onClick={handleResetCache}>
								{t('Reset')}
							</Button>
						}
					/>
					{canReindex && (
						<ListItem
							leading={<IcReindex size={24} />}
							title={t('Rebuild Search Index')}
							subtitle={t(
								'Re-scan your files and posts. Use if search results are missing or stale.'
							)}
							trailing={
								<Button
									color="secondary"
									onClick={handleReindex}
									loading={reindexing}
								>
									{t('Rebuild')}
								</Button>
							}
						/>
					)}
					{auth?.roles?.includes('SADM') && (
						<ListItem
							leading={<IcDatabase size={24} />}
							title={t('Optimize Database')}
							subtitle={t(
								'Compact the search index and reclaim unused disk space. Affects the whole server.'
							)}
							trailing={
								<Button
									color="secondary"
									onClick={handleOptimizeDb}
									loading={optimizing}
								>
									{t('Optimize')}
								</Button>
							}
						/>
					)}
				</List>
				<Text as="p" size="sm" emphasis="muted" className="pt-2">
					{t('Version')}: {process.env.CLOUDILLO_VERSION}
				</Text>
			</Panel>
		</>
	)
}

// vim: ts=4
