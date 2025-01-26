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

import { UsePWA } from '../pwa.js'
import { useSettings } from './settings.js'

export async function subscribeNotifications(api: ReturnType<typeof useApi>, pwa: UsePWA) {
	const vapid = await api.get<{ vapidPublicKey: string }>('', '/auth/vapid')
	console.log('vapid', vapid)
	const subscription = await pwa.askNotify?.(vapid.vapidPublicKey)
	console.log('subscription', subscription)
	if (subscription) {
		await api.post('', '/notification/subscription', { data: { subscription }})
	}
}

export function NotificationSettings({ pwa }: { pwa: UsePWA }) {
	const { t } = useTranslation()
	const api = useApi()
	const { settings, onSettingChange } = useSettings('notify')

	async function onPushChange(evt: React.ChangeEvent<HTMLInputElement>) {
		if (evt.target.checked) {
			subscribeNotifications(api, pwa)
		}
	}

	if (!settings) return null

	return <>
		<div className="c-panel">
			<label className="c-hbox">
				<span className="flex-fill">{t('Enable push notifications on this device')}</span>
				<input className="c-toggle primary" name="notify.push" type="checkbox"
					checked={window.Notification?.permission === 'granted'}
					onChange={onPushChange}
				/>
			</label>

			<label className="c-hbox mt-4">
				<span className="flex-fill">{t('Enable push notifications')}</span>
				<input className="c-toggle primary" name="notify.push" type="checkbox" checked={!!settings['notify.push']} onChange={onSettingChange}/>
			</label>

			{ !!settings['notify.push'] && <>
				<label className="c-hbox mt-3 ms-2">
					<span className="flex-fill">{t('Notify on connection requests')}</span>
					<input className="c-toggle" name="notify.push.connect" type="checkbox" checked={!!settings['notify.push.connect']} onChange={onSettingChange}/>
				</label>
				<label className="c-hbox mt-3 ms-2">
					<span className="flex-fill">{t('Notify on new messages')}</span>
					<input className="c-toggle" name="notify.push.message" type="checkbox" checked={!!settings['notify.push.message']} onChange={onSettingChange}/>
				</label>
			</> }

			<label className="c-hbox mt-4">
				<span className="flex-fill">{t('Enable email notifications')}</span>
				<input className="c-toggle primary" name="notify.email" type="checkbox" checked={!!settings['notify.email']} onChange={onSettingChange}/>
			</label>

			{ !!settings['notify.email'] && <>
				<label className="c-hbox mt-3 ms-2">
					<span className="flex-fill">{t('Notify on connection requests')}</span>
					<input className="c-toggle" name="notify.email.connect" type="checkbox" checked={!!settings['notify.email.connect']} onChange={onSettingChange}/>
				</label>
				<label className="c-hbox mt-3 ms-2">
					<span className="flex-fill">{t('Notify on new messages')}</span>
					<input className="c-toggle" name="notify.email.message" type="checkbox" checked={!!settings['notify.email.message']} onChange={onSettingChange}/>
				</label>
			</> }
		</div>
	</>
}

// vim: ts=4
