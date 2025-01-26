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

import WebPush from 'web-push'

import * as T from '@symbion/runtype'

import { determineTnId, getVapidKeys } from '../auth/handlers.js'
import { metaAdapter } from '../adapters.js'

export interface Notification {
	title: string
	body: string
	path?: string
	image?: string
}

export async function sendNotification(tnId: number, notification: Notification) {
	const vapidKeys = await getVapidKeys(tnId)
	const subscriptions = await metaAdapter.listSubscriptions(tnId)
	console.log('subscriptions', subscriptions)

	for (const subscription of subscriptions) {
		console.log('subscriptions', subscription.subscription)
		try {
			const res = await WebPush.sendNotification(subscription.subscription, JSON.stringify(notification), {
				vapidDetails: {
					subject: 'https://cl-o.' + subscription.idTag,
					publicKey: vapidKeys.vapidPublicKey,
					privateKey: vapidKeys.vapidPrivateKey
				}
			})
		} catch (e) {
			const err = e as { statusCode: number; body: string }
			console.log('Sent notification', err.statusCode, err.body, 400 <= err.statusCode, err.statusCode < 500)
			if (400 <= err.statusCode && err.statusCode < 500) {
				console.log('Deleting subscription', subscription.id)
				await metaAdapter.deleteSubscription(tnId, subscription.id)
			}
		}
	}
}

// vim: ts=4
