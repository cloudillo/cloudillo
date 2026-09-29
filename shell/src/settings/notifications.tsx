// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { ApiClient } from '@cloudillo/core'
import {
	Button,
	Field,
	Heading,
	List,
	LoadingSpinner,
	NativeSelect,
	Panel,
	Slider,
	Text,
	useApi,
	useToast
} from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import {
	clearPushSubscriptionId,
	loadPushSubscriptionId,
	savePushSubscriptionId
} from '../notifications/pushSubscriptionId.js'
import { NOTIFICATION_SOUNDS, SOUND_LABELS } from '../notifications/sounds.js'
import {
	type LocalNotifySettings,
	useLocalNotifySettings
} from '../notifications/useLocalNotifySettings.js'
import type { UsePWA } from '../pwa.js'
import { SwitchRow, useSettings } from './settings.js'

export async function subscribeNotifications(api: ApiClient | null, pwa: UsePWA) {
	if (!api) throw new Error('Not authenticated')
	const vapid = await api.auth.getVapidPublicKey()
	const subscription = await pwa.askNotify?.(vapid.vapidPublicKey)
	if (subscription) {
		// The id is the ONLY handle on the server-side row - DELETE keys on it, it cannot be
		// re-derived from the browser subscription, and there is no GET endpoint - so it is
		// persisted the moment we get it.
		const result = await api.notifications.subscribe({ subscription })
		savePushSubscriptionId(api.idTag, result.id)
		return subscription
	}
}

function SoundSelect({
	label,
	settingKey,
	localSettings,
	updateSetting,
	t
}: {
	label: string
	settingKey: keyof LocalNotifySettings
	localSettings: LocalNotifySettings
	updateSetting: (key: keyof LocalNotifySettings, value: string | boolean | number) => void
	t: (key: string) => string
}) {
	function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
		const soundKey = e.target.value
		updateSetting(settingKey, soundKey)
		// Play preview sound when selected
		if (soundKey && NOTIFICATION_SOUNDS[soundKey]) {
			const audio = new Audio(`/sounds/${NOTIFICATION_SOUNDS[soundKey]}`)
			audio.play().catch(() => {
				// Silently fail if blocked by browser autoplay policy
			})
		}
	}

	return (
		<Field label={label} orientation="horizontal">
			<NativeSelect
				value={(localSettings[settingKey] as string) || ''}
				onChange={handleChange}
			>
				<option value="">{t('Disabled')}</option>
				{Object.entries(SOUND_LABELS).map(([key, soundLabel]) => (
					<option key={key} value={key}>
						{soundLabel}
					</option>
				))}
			</NativeSelect>
		</Field>
	)
}

function VolumeSlider({
	label,
	settingKey,
	localSettings,
	updateSetting
}: {
	label: string
	settingKey: keyof LocalNotifySettings
	localSettings: LocalNotifySettings
	updateSetting: (key: keyof LocalNotifySettings, value: string | boolean | number) => void
}) {
	const value = (localSettings[settingKey] as number) ?? 50
	return (
		<Field label={label} orientation="horizontal">
			<Slider
				min={0}
				max={100}
				step={10}
				value={value}
				format={(v) => `${v}%`}
				onChange={(e) => updateSetting(settingKey, parseInt(e.target.value, 10))}
			/>
		</Field>
	)
}

export function NotificationSettings({ pwa }: { pwa: UsePWA }) {
	const { t } = useTranslation()
	const { api } = useApi()
	const { error: toastError } = useToast()
	const { settings, onSettingChange } = useSettings('notify')
	const { settings: localSettings, updateSetting } = useLocalNotifySettings()
	const [notificationSubscription, setNotificationSubscription] = React.useState<
		PushSubscription | undefined
	>()

	React.useEffect(function () {
		;(async function () {
			const sw =
				window.Notification?.permission === 'granted'
					? await navigator.serviceWorker.ready
					: undefined
			const subscription = (await sw?.pushManager?.getSubscription()) || undefined
			setNotificationSubscription(subscription)
		})()
	}, [])

	// `onChange` cannot await, so anything thrown here would be an unhandled
	// rejection and the toggle would just snap back with no explanation.
	async function onPushChange(evt: React.ChangeEvent<HTMLInputElement>) {
		try {
			if (evt.target.checked) {
				const subscription = await subscribeNotifications(api, pwa)
				if (subscription) setNotificationSubscription(subscription)
			} else {
				// Server first, browser second: if the DELETE fails the catch below reports it and
				// the browser subscription is left intact, so a retry is possible - rather than
				// leaving an invisible server row that nothing on this device can ever revoke.
				const subscriptionId = api ? loadPushSubscriptionId(api.idTag) : undefined
				if (api && subscriptionId !== undefined) {
					await api.notifications.unsubscribe(subscriptionId)
					clearPushSubscriptionId(api.idTag)
				}
				// No stored id: the subscription predates this change, so its server row is
				// unreachable from here and is left to the backend's own dead-endpoint pruning.
				// There is no GET endpoint to look the id up with.
				await notificationSubscription?.unsubscribe()
				setNotificationSubscription(undefined)
			}
		} catch (err) {
			console.error('Failed to update push subscription:', err)
			toastError(
				err instanceof Error && err.message
					? err.message
					: t('Failed to update push notifications')
			)
		}
	}

	if (!settings) return <LoadingSpinner className="auto-bg" />

	return (
		<>
			<Panel title={t('Push notifications')}>
				<List variant="divided">
					<SwitchRow
						name="notify.push"
						checked={!!notificationSubscription}
						onChange={onPushChange}
						label={t('Enable push notifications on this device')}
					/>
					<SwitchRow
						name="notify.push"
						checked={!!settings['notify.push']}
						onChange={onSettingChange}
						label={t('Enable push notifications')}
					/>
				</List>
				{!!settings['notify.push'] && (
					<List variant="divided">
						<SwitchRow
							name="notify.push.message"
							checked={!!settings['notify.push.message']}
							onChange={onSettingChange}
							label={t('Notify on direct messages')}
						/>
						<SwitchRow
							name="notify.push.connection"
							checked={!!settings['notify.push.connection']}
							onChange={onSettingChange}
							label={t('Notify on connection requests')}
						/>
						<SwitchRow
							name="notify.push.file_share"
							checked={!!settings['notify.push.file_share']}
							onChange={onSettingChange}
							label={t('Notify when files are shared with you')}
						/>
						<SwitchRow
							name="notify.push.follow"
							checked={!!settings['notify.push.follow']}
							onChange={onSettingChange}
							label={t('Notify when someone follows you')}
						/>
						<SwitchRow
							name="notify.push.comment"
							checked={!!settings['notify.push.comment']}
							onChange={onSettingChange}
							label={t('Notify on comments to your posts')}
						/>
						<SwitchRow
							name="notify.push.reaction"
							checked={!!settings['notify.push.reaction']}
							onChange={onSettingChange}
							label={t('Notify on reactions to your posts')}
						/>
						<SwitchRow
							name="notify.push.post"
							checked={!!settings['notify.push.post']}
							onChange={onSettingChange}
							label={t('Notify on new posts from people you follow')}
						/>
					</List>
				)}
			</Panel>

			<Panel title={t('Email notifications')}>
				<List variant="divided">
					<SwitchRow
						name="notify.email"
						checked={!!settings['notify.email']}
						onChange={onSettingChange}
						label={t('Enable email notifications')}
					/>
				</List>
				{!!settings['notify.email'] && (
					<>
						<Text as="p" emphasis="muted">
							{t(
								'While you’re away, we email you about the first item in each group, then pause for a day so your inbox stays calm.'
							)}
						</Text>

						<Heading level={4} size="sm" className="mt-2">
							{t('Direct')}
						</Heading>
						<List variant="divided">
							<SwitchRow
								name="notify.email.message"
								checked={!!settings['notify.email.message']}
								onChange={onSettingChange}
								label={t('Notify on direct messages')}
							/>
							<SwitchRow
								name="notify.email.connection"
								checked={!!settings['notify.email.connection']}
								onChange={onSettingChange}
								label={t('Notify on connection requests')}
							/>
							<SwitchRow
								name="notify.email.file_share"
								checked={!!settings['notify.email.file_share']}
								onChange={onSettingChange}
								label={t('Notify when files are shared with you')}
							/>
						</List>

						<Heading level={4} size="sm" className="mt-2">
							{t('Engagement')}
						</Heading>
						<List variant="divided">
							<SwitchRow
								name="notify.email.comment"
								checked={!!settings['notify.email.comment']}
								onChange={onSettingChange}
								label={t('Notify on comments to your posts')}
							/>
							<SwitchRow
								name="notify.email.reaction"
								checked={!!settings['notify.email.reaction']}
								onChange={onSettingChange}
								label={t('Notify on reactions to your posts')}
							/>
						</List>

						<Heading level={4} size="sm" className="mt-2">
							{t('Social')}
						</Heading>
						<List variant="divided">
							<SwitchRow
								name="notify.email.follow"
								checked={!!settings['notify.email.follow']}
								onChange={onSettingChange}
								label={t('Notify when someone follows you')}
							/>
							<SwitchRow
								name="notify.email.post"
								checked={!!settings['notify.email.post']}
								onChange={onSettingChange}
								label={t('Notify on new posts from people you follow')}
							/>
						</List>
					</>
				)}
			</Panel>

			<Panel
				title={t('Sound notifications')}
				description={t('These settings are stored locally on this device')}
			>
				<Text as="p" emphasis="muted">
					{t(
						'Browsers may block sounds until you interact with the page. Click the test button to enable sounds.'
					)}
				</Text>
				<Button
					color="secondary"
					className="mt-2 mb-2"
					onClick={() => {
						const firstSound = Object.values(NOTIFICATION_SOUNDS)[0]
						if (firstSound) {
							const audio = new Audio(`/sounds/${firstSound}`)
							audio.play().catch(() => {})
						}
					}}
				>
					{t('Test sound')}
				</Button>

				<VolumeSlider
					label={t('Volume when tab is active')}
					settingKey="volume.active"
					localSettings={localSettings}
					updateSetting={updateSetting}
				/>
				<VolumeSlider
					label={t('Volume when tab is inactive (background)')}
					settingKey="volume.inactive"
					localSettings={localSettings}
					updateSetting={updateSetting}
				/>

				<SoundSelect
					label={t('Direct messages')}
					settingKey="sound.message"
					localSettings={localSettings}
					updateSetting={updateSetting}
					t={t}
				/>
				<SoundSelect
					label={t('Connection requests')}
					settingKey="sound.connection"
					localSettings={localSettings}
					updateSetting={updateSetting}
					t={t}
				/>
				<SoundSelect
					label={t('File sharing')}
					settingKey="sound.file_share"
					localSettings={localSettings}
					updateSetting={updateSetting}
					t={t}
				/>
				<SoundSelect
					label={t('New followers')}
					settingKey="sound.follow"
					localSettings={localSettings}
					updateSetting={updateSetting}
					t={t}
				/>
				<SoundSelect
					label={t('Comments on your posts')}
					settingKey="sound.comment"
					localSettings={localSettings}
					updateSetting={updateSetting}
					t={t}
				/>
				<SoundSelect
					label={t('Reactions to your posts')}
					settingKey="sound.reaction"
					localSettings={localSettings}
					updateSetting={updateSetting}
					t={t}
				/>
				<SoundSelect
					label={t('Mentions')}
					settingKey="sound.mention"
					localSettings={localSettings}
					updateSetting={updateSetting}
					t={t}
				/>
				<SoundSelect
					label={t('Posts from followed users')}
					settingKey="sound.post"
					localSettings={localSettings}
					updateSetting={updateSetting}
					t={t}
				/>
			</Panel>

			<Panel title={t('Toast notifications')}>
				<List variant="divided">
					<SwitchRow
						checked={!!localSettings.toast}
						onChange={(e) => updateSetting('toast', e.target.checked)}
						label={t('Enable toast notifications')}
					/>
				</List>
				{!!localSettings.toast && (
					<List variant="divided">
						<SwitchRow
							checked={!!localSettings['toast.message']}
							onChange={(e) => updateSetting('toast.message', e.target.checked)}
							label={t('Direct messages')}
						/>
						<SwitchRow
							checked={!!localSettings['toast.connection']}
							onChange={(e) => updateSetting('toast.connection', e.target.checked)}
							label={t('Connection requests')}
						/>
						<SwitchRow
							checked={!!localSettings['toast.file_share']}
							onChange={(e) => updateSetting('toast.file_share', e.target.checked)}
							label={t('File sharing')}
						/>
						<SwitchRow
							checked={!!localSettings['toast.follow']}
							onChange={(e) => updateSetting('toast.follow', e.target.checked)}
							label={t('New followers')}
						/>
						<SwitchRow
							checked={!!localSettings['toast.comment']}
							onChange={(e) => updateSetting('toast.comment', e.target.checked)}
							label={t('Comments on your posts')}
						/>
						<SwitchRow
							checked={!!localSettings['toast.reaction']}
							onChange={(e) => updateSetting('toast.reaction', e.target.checked)}
							label={t('Reactions to your posts')}
						/>
						<SwitchRow
							checked={!!localSettings['toast.post']}
							onChange={(e) => updateSetting('toast.post', e.target.checked)}
							label={t('Posts from followed users')}
						/>
					</List>
				)}
			</Panel>
		</>
	)
}

// vim: ts=4
