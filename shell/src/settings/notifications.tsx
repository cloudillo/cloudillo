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

export async function subscribeNotifications(api: ApiClient | null, pwa: UsePWA) {
	if (!api) throw new Error('Not authenticated')
	const vapid = await api.auth.getVapidPublicKey()
	const subscription = await pwa.askNotify?.(vapid.vapidPublicKey)
	if (subscription) {
		await api.notifications.subscribe({ subscription })
		return subscription
	}
}

export function NotificationSettings({ pwa }: { pwa: UsePWA }) {
	const { t } = useTranslation()
	const { api, setIdTag } = useApi()
	const { settings, onSettingChange } = useSettings('notify')
	const [notificationSubscription, setNotificationSubscription] = React.useState<PushSubscription | undefined>()

	React.useEffect(function () {
		(async function () {
			const sw = window.Notification?.permission === 'granted' ? await navigator.serviceWorker.ready : undefined
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

	return <>
		<div className="c-panel">
			<label className="c-hbox">
				<span className="flex-fill">{t('Enable push notifications on this device')}</span>
				<input className="c-toggle primary" name="notify.push" type="checkbox"
					checked={!!notificationSubscription}
					onChange={onPushChange}
				/>
			</label>

			<label className="c-hbox mt-4">
				<span className="flex-fill">{t('Enable push notifications')}</span>
				<input className="c-toggle primary" name="notify.push" type="checkbox" checked={!!settings['notify.push']} onChange={onSettingChange}/>
			</label>

			{ !!settings['notify.push'] && <>
				<label className="c-hbox mt-3 ms-2">
					<span className="flex-fill">{t('Notify on direct messages')}</span>
					<input className="c-toggle" name="notify.push.message" type="checkbox" checked={!!settings['notify.push.message']} onChange={onSettingChange}/>
				</label>
				<label className="c-hbox mt-3 ms-2">
					<span className="flex-fill">{t('Notify on connection requests')}</span>
					<input className="c-toggle" name="notify.push.connection" type="checkbox" checked={!!settings['notify.push.connection']} onChange={onSettingChange}/>
				</label>
				<label className="c-hbox mt-3 ms-2">
					<span className="flex-fill">{t('Notify when files are shared with you')}</span>
					<input className="c-toggle" name="notify.push.file_share" type="checkbox" checked={!!settings['notify.push.file_share']} onChange={onSettingChange}/>
				</label>
				<label className="c-hbox mt-3 ms-2">
					<span className="flex-fill">{t('Notify when someone follows you')}</span>
					<input className="c-toggle" name="notify.push.follow" type="checkbox" checked={!!settings['notify.push.follow']} onChange={onSettingChange}/>
				</label>
				<label className="c-hbox mt-3 ms-2">
					<span className="flex-fill">{t('Notify on comments to your posts')}</span>
					<input className="c-toggle" name="notify.push.comment" type="checkbox" checked={!!settings['notify.push.comment']} onChange={onSettingChange}/>
				</label>
				<label className="c-hbox mt-3 ms-2">
					<span className="flex-fill">{t('Notify on reactions to your posts')}</span>
					<input className="c-toggle" name="notify.push.reaction" type="checkbox" checked={!!settings['notify.push.reaction']} onChange={onSettingChange}/>
				</label>
				<label className="c-hbox mt-3 ms-2">
					<span className="flex-fill">{t('Notify when you are mentioned')}</span>
					<input className="c-toggle" name="notify.push.mention" type="checkbox" checked={!!settings['notify.push.mention']} onChange={onSettingChange}/>
				</label>
				<label className="c-hbox mt-3 ms-2">
					<span className="flex-fill">{t('Notify on new posts from people you follow')}</span>
					<input className="c-toggle" name="notify.push.post" type="checkbox" checked={!!settings['notify.push.post']} onChange={onSettingChange}/>
				</label>
			</> }

			<label className="c-hbox mt-4">
				<span className="flex-fill">{t('Enable email notifications')}</span>
				<input className="c-toggle primary" name="notify.email" type="checkbox" checked={!!settings['notify.email']} onChange={onSettingChange}/>
			</label>

			{ !!settings['notify.email'] && <>
				<label className="c-hbox mt-3 ms-2">
					<span className="flex-fill">{t('Notify on direct messages')}</span>
					<input className="c-toggle" name="notify.email.message" type="checkbox" checked={!!settings['notify.email.message']} onChange={onSettingChange}/>
				</label>
				<label className="c-hbox mt-3 ms-2">
					<span className="flex-fill">{t('Notify on connection requests')}</span>
					<input className="c-toggle" name="notify.email.connection" type="checkbox" checked={!!settings['notify.email.connection']} onChange={onSettingChange}/>
				</label>
				<label className="c-hbox mt-3 ms-2">
					<span className="flex-fill">{t('Notify when files are shared with you')}</span>
					<input className="c-toggle" name="notify.email.file_share" type="checkbox" checked={!!settings['notify.email.file_share']} onChange={onSettingChange}/>
				</label>
				<label className="c-hbox mt-3 ms-2">
					<span className="flex-fill">{t('Notify when someone follows you')}</span>
					<input className="c-toggle" name="notify.email.follow" type="checkbox" checked={!!settings['notify.email.follow']} onChange={onSettingChange}/>
				</label>
				<label className="c-hbox mt-3 ms-2">
					<span className="flex-fill">{t('Notify on comments to your posts')}</span>
					<input className="c-toggle" name="notify.email.comment" type="checkbox" checked={!!settings['notify.email.comment']} onChange={onSettingChange}/>
				</label>
				<label className="c-hbox mt-3 ms-2">
					<span className="flex-fill">{t('Notify on reactions to your posts')}</span>
					<input className="c-toggle" name="notify.email.reaction" type="checkbox" checked={!!settings['notify.email.reaction']} onChange={onSettingChange}/>
				</label>
				<label className="c-hbox mt-3 ms-2">
					<span className="flex-fill">{t('Notify when you are mentioned')}</span>
					<input className="c-toggle" name="notify.email.mention" type="checkbox" checked={!!settings['notify.email.mention']} onChange={onSettingChange}/>
				</label>
				<label className="c-hbox mt-3 ms-2">
					<span className="flex-fill">{t('Notify on new posts from people you follow')}</span>
					<input className="c-toggle" name="notify.email.post" type="checkbox" checked={!!settings['notify.email.post']} onChange={onSettingChange}/>
				</label>
			</> }
		</div>
	</>
}

// vim: ts=4
