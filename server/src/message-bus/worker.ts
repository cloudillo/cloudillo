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

import { ActionView } from '@cloudillo/types'
import { determineTnId } from '../auth.js'
import { metaAdapter, messageBusAdapter } from '../adapters.js'
import { sendNotification } from '../notification/index.js'

export async function handleMsg(idTag: string, msgType: string, action: ActionView) {
	console.log('handleMsg', idTag, msgType, action)
	const tnId = +idTag
	if (typeof action.content == 'string') {
		await sendNotification(tnId, {
			title: action.issuer.name ?? '-',
			body: action.content ?? 'No content',
			image: action.issuer.profilePic ? `https://cl-o.${idTag}/${action.issuer.profilePic}` : undefined,
			path: `/app/messages/${action.issuer.idTag ?? ''}`
		})
		return true
	}
	return false
}

export async function initWorker() {
	messageBusAdapter.subscribeOffline('notification-sender', handleMsg)
}

// vim: ts=4
