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

import jwt from 'jsonwebtoken'

import * as T from '@symbion/runtype'

import { sha256 } from '../utils.js'
import { Auth } from '../index.js'
import { ProxyToken, createActionToken, createProxyToken, getIdentityTag } from '../auth/handlers.js'
import { tFullProfile } from '../profile/profile.js'
import { sendNotification } from '../notification/index.js'
import { addTask, cancelWait } from '../worker.js'
import { metaAdapter, blobAdapter } from '../adapters.js'
import { handleInboundAction, handleInboundActionToken } from './hooks-inbound.js'

// Inbox //
///////////
export async function processInboundActionTokens() {
	//console.log('processInboundActions')
	return metaAdapter.processPendingInboundActions(async function processInboundAction(tnId: number, actionId: string, token: string) {
		const idTag = await getIdentityTag(tnId)
		//const actionId = sha256(action.token)
		try {
			await handleInboundActionToken(tnId, actionId, token)
		} catch (err) {
			console.log('ERROR', err)
			throw err
		}
		return true
	})
}

// Outbox //
////////////
export async function processOutboundActions() {
	//console.log('processOutboundActions')
	return metaAdapter.processPendingOutboundActions(async function processOutboundAction(tnId: number, actionId: string, type: string, token: string, recipientTag: string) {
		const url = `https://cl-o.${recipientTag}/api/inbox`
		let related: string | undefined

		if (type == 'ACK') {
			const actionData = await metaAdapter.getActionData(tnId, actionId)
			if (actionData?.subject) related = await metaAdapter.getActionToken(tnId, actionData.subject)
			console.log('ACK', actionId, actionData, related)
		}

		const res = await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ token, related: related ? [related] : undefined })
		})
		console.log('STATUS', url, res.status)
		if (res.ok) {
			return true
		} else {
			return false
		}
	})
}

export async function actionWorker(): Promise<boolean> {
	//console.log('ACTION WORKER start')
	let ret = await processInboundActionTokens()
	ret = await processOutboundActions() || ret
	//console.log('ACTION WORKER end', ret)
	return !!ret
}

export async function initWorker() {
	addTask(actionWorker)
}

// vim: ts=4
