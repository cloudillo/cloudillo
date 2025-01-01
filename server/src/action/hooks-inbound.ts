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

import { Action, NewAction } from '@cloudillo/types'
import { metaAdapter, blobAdapter, messageBusAdapter } from '../adapters.js'
import { ProxyToken, createActionToken, createProxyToken, getIdentityTag } from '../auth/handlers.js'
//import { sendWsBusMsg } from '../ws.js'
import { createAction, checkToken, generateActionKey } from './action.js'

export interface ActionContext {
	tnId: number
	idTag: string
}

export async function handleAck({ tnId, idTag }: ActionContext, actionId: string, action: Action) {
	console.log(action.type, action.issuerTag, idTag, action)
	if (action.subject) {
		const token = await metaAdapter.getActionToken(tnId, action.subject)
		if (token) {
			await handleInboundActionToken(tnId, action.subject, token, { ack: true })
			await metaAdapter.updateInboundAction(tnId, action.subject, { status: 'A' })
		}
	}
}

export async function handlePost({ tnId, idTag }: ActionContext, actionId: string, action: Action) {
	console.log('POST', action.issuerTag, action.audienceTag, idTag)
	if (action.issuerTag != idTag && action.audienceTag == idTag) {
		const issuerProfile = await metaAdapter.readProfile(tnId, action.issuerTag)
		console.log('ACK?', action.type, issuerProfile?.status, { issuerTag: action.issuerTag, idTag })

		if (!['T', 'A'].includes(issuerProfile?.status as string)) {
			throw new Error('Unknown issuer')
		}

		const ackAction: Action = {
			type: 'ACK',
			issuerTag: idTag,
			subject: actionId,
			createdAt: Math.trunc(Date.now() / 10) / 100
		}
		await createAction(tnId, ackAction)
	}
}

export async function handleMsg({ tnId, idTag }: ActionContext, actionId: string, action: Action) {
	const issuer = await metaAdapter.readProfile(tnId, action.issuerTag)
	const audience = action.audienceTag ? await metaAdapter.readProfile(tnId, action.audienceTag) : undefined
	// FIXME
	const cnt = await messageBusAdapter.sendMessage('' + tnId, 'ACTION', {
		actionId,
		type: action.type,
		subType: action.subType,
		parentId: action.parentId,
		rootId: action.rootId,
		issuer,
		audience,
		createdAt: action.createdAt,
		expiresAt: action.expiresAt,
		content: action.content,
		attachments: action.attachments
	})
	console.log('WS BUS sent', cnt)
	/*
	if (!cnt) 
		await sendNotification(tnId, {
			title: user?.name ?? '-',
			body: action.c ?? 'No content',
			image: user?.profilePic ? `https://cl-o.${idTag}/${user.profilePic}` : undefined,
			path: `/app/messages/${action.iss ?? ''}`
		})
	}
	*/
}

export async function handleInboundAction(ctx: ActionContext, actionId: string, action: Action) {
	switch (action.type) {
		case 'ACK':
			return handleAck(ctx, actionId, action)
		case 'POST':
			return handlePost(ctx, actionId, action)
		case 'MSG':
			return handleMsg(ctx, actionId, action)
		default:
			return
	}
}

export async function handleInboundActionToken(tnId: number, actionId: string, token: string, opts?: { ack?: boolean}) {
	const idTag = await getIdentityTag(tnId)
	//const actionId = sha256(action.token)
	try {
		// Check and decode token
		const act = await checkToken(tnId, token)
		console.log('ACTION', tnId, JSON.stringify(act))

		// Check if issuer has permission
		const issuerProfile = await metaAdapter.readProfile(tnId, act.iss)
		if (!opts?.ack && !['FLLW', 'CONN'].includes(act.t) && !['C', 'F', 'T', 'A', 'M'].includes(issuerProfile?.status as string)) {
			console.log('Unknown issuer', issuerProfile)
			throw new Error('Unknown issuer')
		}

		// Sync attachments if needed
		console.log(act.iss, idTag, act.sub)
		if (act.iss !== idTag && act.sub == idTag) {
			const proxyToken = await createProxyToken(tnId, act.iss)
			if (!proxyToken) throw new Error('Failed to create proxy token')

			for (const attachment of act.a || []) {
				const [flags, fileIdsStr] = attachment.split(':')
				const fileIds = fileIdsStr.split(',')
				console.log('Syncing attachment', flags, fileIds)
				for (const fileId of fileIds) {
					console.log('Syncing attachment', fileId)
					const binRes = await fetch(`https://cl-o.${act.iss}/api/store/${fileId}`, {
						headers: { 'Authorization': `Bearer ${proxyToken}` },
						credentials: 'include'
					})
					const metaRes = await fetch(`https://cl-o.${act.iss}/api/store?id=${fileId}`, {
						headers: { 'Authorization': `Bearer ${proxyToken}` },
						credentials: 'include'
					})
					const buf = Buffer.from(await binRes.arrayBuffer())
					const meta = await metaRes.json()
					await blobAdapter.writeBlob(tnId, fileId, '', buf)
					await metaAdapter.createFile(tnId, fileId, {
						status: 'I', contentType: binRes.headers.get('Content-Type') || '',
						fileName: meta.fileName, createdAt: meta.createdAt,
						//variant: 'tn', origId: img.hash.orig,
						//origId: fileIds[0],
						tags: meta.tags?.length ? meta.tags : undefined
					})
				}
			}
		}

		// Split type
		const [type, subType] = (act as any).st ? [act.t, (act as any).st]  : act.t.split(':')
		// Determine rootId
		const rootId = act.p ? await metaAdapter.getActionRootId(tnId, act.p) : undefined

		const action: Action = {
			type: type,
			subType: subType,
			parentId: act.p,
			rootId,
			issuerTag: act.iss,
			audienceTag: act.aud,
			subject: act.sub,
			content: act.c,
			createdAt: act.iat,
			expiresAt: act.exp,
			//createdAt: new Date(act.iat * 1000),
			//expiresAt: act.exp ? new Date(act.exp * 1000) : undefined,
			attachments: act.a
		}
		await metaAdapter.createAction(tnId, actionId, action, generateActionKey(actionId, action))
		await handleInboundAction({ tnId, idTag }, actionId, action)
	} catch (err) {
		console.log('ERROR', err)
		throw err
	}
	return true
}

// vim: ts=4
