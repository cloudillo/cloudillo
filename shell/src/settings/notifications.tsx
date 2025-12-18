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

import { useApi } from '@cloudillo/react'
import { ApiClient } from '@cloudillo/base'

import { UsePWA } from '../pwa.js'
import { useSettings } from './settings.js'
import {
	useLocalNotifySettings,
	LocalNotifySettings
} from '../notifications/useLocalNotifySettings.js'
import { NOTIFICATION_SOUNDS, SOUND_LABELS } from '../notifications/sounds.js'

export async function subscribeNotifications(api: ApiClient | null, pwa: UsePWA) {
	if (!api) throw new Error('Not authenticated')
	const vapid = await api.auth.getVapidPublicKey()
	const subscription = await pwa.askNotify?.(vapid.vapidPublicKey)
	if (subscription) {
		await api.notifications.subscribe({ subscription })
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
		<label className="c-settings-field ms-2">
			<span>{label}</span>
			<select
				className="c-select"
				value={(localSettings[settingKey] as string) || ''}
				onChange={handleChange}
			>
				<option value="">{t('Disabled')}</option>
				{Object.entries(SOUND_LABELS).map(([key, soundLabel]) => (
					<option key={key} value={key}>
						{soundLabel}
					</option>
				))}
			</select>
		</label>
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
		<label className="c-settings-field ms-2">
			<span>{label}</span>
			<span
				style={{
					flex: '0 0 auto',
					display: 'flex',
					alignItems: 'center',
					gap: '0.5rem',
					minWidth: '150px',
					maxWidth: '200px'
				}}
			>
				<input
					type="range"
					min="0"
					max="100"
					step="10"
					value={value}
					onChange={(e) => updateSetting(settingKey, parseInt(e.target.value))}
					style={{ flex: 1 }}
				/>
				<span style={{ minWidth: '3em', textAlign: 'right' }}>{value}%</span>
			</span>
		</label>
	)
}

export function NotificationSettings({ pwa }: { pwa: UsePWA }) {
	const { t } = useTranslation()
	const { api, setIdTag } = useApi()
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

	async function onPushChange(evt: React.ChangeEvent<HTMLInputElement>) {
		if (evt.target.checked) {
			const subscription = await subscribeNotifications(api, pwa)
			if (subscription) setNotificationSubscription(subscription)
		} else {
			await notificationSubscription?.unsubscribe()
			setNotificationSubscription(undefined)
			/*
			if (subscription) {
				await api.delete('', `/notification/subscription${subscription}`)
				await subscription.unsubscribe()
			}
			*/
		}
	}

	if (!settings) return null

	return (
		<>
			<div className="c-panel">
				<label className="c-settings-field">
					<span>{t('Enable push notifications on this device')}</span>
					<input
						className="c-toggle primary"
						name="notify.push"
						type="checkbox"
						checked={!!notificationSubscription}
						onChange={onPushChange}
					/>
				</label>

				<label className="c-settings-field mt-4">
					<span>{t('Enable push notifications')}</span>
					<input
						className="c-toggle primary"
						name="notify.push"
						type="checkbox"
						checked={!!settings['notify.push']}
						onChange={onSettingChange}
					/>
				</label>

				{!!settings['notify.push'] && (
					<>
						<label className="c-settings-field ms-2">
							<span>{t('Notify on direct messages')}</span>
							<input
								className="c-toggle"
								name="notify.push.message"
								type="checkbox"
								checked={!!settings['notify.push.message']}
								onChange={onSettingChange}
							/>
						</label>
						<label className="c-settings-field ms-2">
							<span>{t('Notify on connection requests')}</span>
							<input
								className="c-toggle"
								name="notify.push.connection"
								type="checkbox"
								checked={!!settings['notify.push.connection']}
								onChange={onSettingChange}
							/>
						</label>
						<label className="c-settings-field ms-2">
							<span>{t('Notify when files are shared with you')}</span>
							<input
								className="c-toggle"
								name="notify.push.file_share"
								type="checkbox"
								checked={!!settings['notify.push.file_share']}
								onChange={onSettingChange}
							/>
						</label>
						<label className="c-settings-field ms-2">
							<span>{t('Notify when someone follows you')}</span>
							<input
								className="c-toggle"
								name="notify.push.follow"
								type="checkbox"
								checked={!!settings['notify.push.follow']}
								onChange={onSettingChange}
							/>
						</label>
						<label className="c-settings-field ms-2">
							<span>{t('Notify on comments to your posts')}</span>
							<input
								className="c-toggle"
								name="notify.push.comment"
								type="checkbox"
								checked={!!settings['notify.push.comment']}
								onChange={onSettingChange}
							/>
						</label>
						<label className="c-settings-field ms-2">
							<span>{t('Notify on reactions to your posts')}</span>
							<input
								className="c-toggle"
								name="notify.push.reaction"
								type="checkbox"
								checked={!!settings['notify.push.reaction']}
								onChange={onSettingChange}
							/>
						</label>
						<label className="c-settings-field ms-2">
							<span>{t('Notify when you are mentioned')}</span>
							<input
								className="c-toggle"
								name="notify.push.mention"
								type="checkbox"
								checked={!!settings['notify.push.mention']}
								onChange={onSettingChange}
							/>
						</label>
						<label className="c-settings-field ms-2">
							<span>{t('Notify on new posts from people you follow')}</span>
							<input
								className="c-toggle"
								name="notify.push.post"
								type="checkbox"
								checked={!!settings['notify.push.post']}
								onChange={onSettingChange}
							/>
						</label>
					</>
				)}

				<label className="c-settings-field mt-4">
					<span>{t('Enable email notifications')}</span>
					<input
						className="c-toggle primary"
						name="notify.email"
						type="checkbox"
						checked={!!settings['notify.email']}
						onChange={onSettingChange}
					/>
				</label>

				{!!settings['notify.email'] && (
					<>
						<label className="c-settings-field ms-2">
							<span>{t('Notify on direct messages')}</span>
							<input
								className="c-toggle"
								name="notify.email.message"
								type="checkbox"
								checked={!!settings['notify.email.message']}
								onChange={onSettingChange}
							/>
						</label>
						<label className="c-settings-field ms-2">
							<span>{t('Notify on connection requests')}</span>
							<input
								className="c-toggle"
								name="notify.email.connection"
								type="checkbox"
								checked={!!settings['notify.email.connection']}
								onChange={onSettingChange}
							/>
						</label>
						<label className="c-settings-field ms-2">
							<span>{t('Notify when files are shared with you')}</span>
							<input
								className="c-toggle"
								name="notify.email.file_share"
								type="checkbox"
								checked={!!settings['notify.email.file_share']}
								onChange={onSettingChange}
							/>
						</label>
						<label className="c-settings-field ms-2">
							<span>{t('Notify when someone follows you')}</span>
							<input
								className="c-toggle"
								name="notify.email.follow"
								type="checkbox"
								checked={!!settings['notify.email.follow']}
								onChange={onSettingChange}
							/>
						</label>
						<label className="c-settings-field ms-2">
							<span>{t('Notify on comments to your posts')}</span>
							<input
								className="c-toggle"
								name="notify.email.comment"
								type="checkbox"
								checked={!!settings['notify.email.comment']}
								onChange={onSettingChange}
							/>
						</label>
						<label className="c-settings-field ms-2">
							<span>{t('Notify on reactions to your posts')}</span>
							<input
								className="c-toggle"
								name="notify.email.reaction"
								type="checkbox"
								checked={!!settings['notify.email.reaction']}
								onChange={onSettingChange}
							/>
						</label>
						<label className="c-settings-field ms-2">
							<span>{t('Notify when you are mentioned')}</span>
							<input
								className="c-toggle"
								name="notify.email.mention"
								type="checkbox"
								checked={!!settings['notify.email.mention']}
								onChange={onSettingChange}
							/>
						</label>
						<label className="c-settings-field ms-2">
							<span>{t('Notify on new posts from people you follow')}</span>
							<input
								className="c-toggle"
								name="notify.email.post"
								type="checkbox"
								checked={!!settings['notify.email.post']}
								onChange={onSettingChange}
							/>
						</label>
					</>
				)}

				<h4 className="mt-4">{t('Sound notifications')}</h4>
				<p className="text-muted">
					{t('These settings are stored locally on this device')}
				</p>
				<p className="text-muted">
					{t(
						'Browsers may block sounds until you interact with the page. Click the test button to enable sounds.'
					)}
				</p>
				<div className="c-hbox mt-2 mb-2">
					<button
						className="c-button secondary"
						onClick={() => {
							const firstSound = Object.values(NOTIFICATION_SOUNDS)[0]
							if (firstSound) {
								const audio = new Audio(`/sounds/${firstSound}`)
								audio.play().catch(() => {})
							}
						}}
					>
						{t('Test sound')}
					</button>
				</div>

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

				<label className="c-settings-field mt-4">
					<span>{t('Enable toast notifications')}</span>
					<input
						className="c-toggle primary"
						type="checkbox"
						checked={!!localSettings.toast}
						onChange={(e) => updateSetting('toast', e.target.checked)}
					/>
				</label>

				{!!localSettings.toast && (
					<>
						<label className="c-settings-field ms-2">
							<span>{t('Direct messages')}</span>
							<input
								className="c-toggle"
								type="checkbox"
								checked={!!localSettings['toast.message']}
								onChange={(e) => updateSetting('toast.message', e.target.checked)}
							/>
						</label>
						<label className="c-settings-field ms-2">
							<span>{t('Connection requests')}</span>
							<input
								className="c-toggle"
								type="checkbox"
								checked={!!localSettings['toast.connection']}
								onChange={(e) =>
									updateSetting('toast.connection', e.target.checked)
								}
							/>
						</label>
						<label className="c-settings-field ms-2">
							<span>{t('File sharing')}</span>
							<input
								className="c-toggle"
								type="checkbox"
								checked={!!localSettings['toast.file_share']}
								onChange={(e) =>
									updateSetting('toast.file_share', e.target.checked)
								}
							/>
						</label>
						<label className="c-settings-field ms-2">
							<span>{t('New followers')}</span>
							<input
								className="c-toggle"
								type="checkbox"
								checked={!!localSettings['toast.follow']}
								onChange={(e) => updateSetting('toast.follow', e.target.checked)}
							/>
						</label>
						<label className="c-settings-field ms-2">
							<span>{t('Comments on your posts')}</span>
							<input
								className="c-toggle"
								type="checkbox"
								checked={!!localSettings['toast.comment']}
								onChange={(e) => updateSetting('toast.comment', e.target.checked)}
							/>
						</label>
						<label className="c-settings-field ms-2">
							<span>{t('Reactions to your posts')}</span>
							<input
								className="c-toggle"
								type="checkbox"
								checked={!!localSettings['toast.reaction']}
								onChange={(e) => updateSetting('toast.reaction', e.target.checked)}
							/>
						</label>
						<label className="c-settings-field ms-2">
							<span>{t('Mentions')}</span>
							<input
								className="c-toggle"
								type="checkbox"
								checked={!!localSettings['toast.mention']}
								onChange={(e) => updateSetting('toast.mention', e.target.checked)}
							/>
						</label>
						<label className="c-settings-field ms-2">
							<span>{t('Posts from followed users')}</span>
							<input
								className="c-toggle"
								type="checkbox"
								checked={!!localSettings['toast.post']}
								onChange={(e) => updateSetting('toast.post', e.target.checked)}
							/>
						</label>
					</>
				)}
			</div>
		</>
	)
}

// vim: ts=4
