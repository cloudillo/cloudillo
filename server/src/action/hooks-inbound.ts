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

import dayjs from 'dayjs'
import * as T from '@symbion/runtype'

import { Action, NewAction, ActionView } from '@cloudillo/types'
import { sha256 } from '../utils.js'
import { metaAdapter, blobAdapter, messageBusAdapter } from '../adapters.js'
import { ProxyToken, createActionToken, createProxyToken, getIdentityTag } from '../auth/handlers.js'
import { getProfile } from '../profile/profile.js'
//import { sendWsBusMsg } from '../ws.js'
import { createAction, createInboundActions, checkToken, generateActionKey } from './action.js'

export interface ActionContext {
	tnId: number
	idTag: string
	busAction: ActionView
}

export async function handleAck({ tnId, idTag }: ActionContext, actionId: string, action: Action) {
	console.log(action.type, action.issuerTag, idTag, action)
	if (action.subject) {
		const token = await metaAdapter.getActionToken(tnId, action.subject)
		if (token) {
			await handleInboundActionToken(tnId, action.subject, token, { ack: true })
			await metaAdapter.updateInboundAction(tnId, action.subject, { status: 'R' })
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

		const ackAction: NewAction = {
			type: 'ACK',
			subject: actionId
		}
		await createAction(tnId, ackAction)
	}
}

export async function handleMsg({ tnId, idTag }: ActionContext, actionId: string, action: Action) {
	/*
	const issuer = await metaAdapter.readProfile(tnId, action.issuerTag)
	const audience = action.audienceTag ? await metaAdapter.readProfile(tnId, action.audienceTag) : undefined
	// FIXME
	if (action.audienceTag) {
		const cnt = await messageBusAdapter.sendMessage(action.audienceTag, 'ACTION', {
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
	}
	*/
}

export async function handleReactionOrComment({ tnId, idTag }: ActionContext, actionId: string, action: Action) {
	// Generate stat action
	if (
		((action.type == 'CMNT' || (action.type == 'REACT')) && action.parentId)
		&& ((action.audienceTag || action.issuerTag) == idTag)
	) {
		const parentAction = await metaAdapter.getActionData(tnId, action.parentId)
		if (parentAction) {
			await createAction(tnId, {
				type: 'STAT',
				//issuerTag: idTag,
				parentId: action.parentId,
				content: { r: parentAction.reactions, c: parentAction.comments },
				//createdAt: Math.trunc(Date.now() / 1000)
			})
		}
	}
}

const tStatContent = T.type({
	r: T.optional(T.number),
	c: T.optional(T.number)
})
export async function handleStat({ tnId, idTag }: ActionContext, actionId: string, action: Action) {
	console.log('STAT', action.issuerTag, action.audienceTag, idTag, action.content)
	const contentRes = T.decode(tStatContent, action.content)
	if (T.isOk(contentRes)) {
		const { r, c } = contentRes.ok
		if (action.parentId) await metaAdapter.updateActionData(tnId, action.parentId, { reactions: r, comments: c })
	}
}

export async function handleFollow(ctx: ActionContext, actionId: string, action: Action) {
	console.log('FLLW', action.issuerTag, action.audienceTag, ctx.idTag)
	if (action.audienceTag == ctx.idTag) {
		if (action.subType == 'DEL') {
			ctx.busAction.status = 'N'
			await metaAdapter.updateProfile(ctx.tnId, action.issuerTag, { connected: null, following: null })
		} else {
			ctx.busAction.status = 'N'
			await metaAdapter.updateProfile(ctx.tnId, action.issuerTag, { following: true })
		}
	}
}

export async function handleConn(ctx: ActionContext, actionId: string, action: Action) {
	const tenant = await metaAdapter.readTenant(ctx.tnId)
	console.log('CONN', action.issuerTag, action.audienceTag, ctx.idTag)

	if (action.audienceTag == ctx.idTag) {
		// Check if the current action is a response to a request we sent earlier
		const req = await metaAdapter.getActionByKey(ctx.tnId, `CONN:${ctx.idTag}:${action.issuerTag}`)
		switch (action.subType) {
			case undefined:
				if (req && req?.subType != 'DEL') {
					// Conn action received and found a pending local conn req
					// --> update profile to connected
					await metaAdapter.updateProfile(ctx.tnId, action.issuerTag, { connected: true, following: true })
					ctx.busAction.status = 'N'
					await metaAdapter.updateActionData(ctx.tnId, actionId, { status: 'N' })
					await startFollowing(ctx.tnId, action.issuerTag)
				} else {
					// Conn action received and no pending local conn req
					if (tenant?.type == 'community') {
						// Community profile accepts connection automatically for now
						// FIXME: settings.openCommunity
						const connAction: NewAction = {
							type: 'CONN',
							audienceTag: action.issuerTag
						}
						await createAction(ctx.tnId, connAction)
						const profile = await metaAdapter.readProfile(ctx.tnId, action.issuerTag)
						await metaAdapter.updateProfile(ctx.tnId, action.issuerTag, { connected: true, following: true, perm: profile?.perm || 'W' })
					} else {
						// Notify user about the request
						ctx.busAction.status = 'C'
						await metaAdapter.updateActionData(ctx.tnId, actionId, { status: 'C' })
					}
				}
				break
			case 'DEL':
				if (req && !req?.subType) {
					// CONN:DEL request received and we have a local conn req
					// --> update profile to not connected
					await metaAdapter.updateProfile(ctx.tnId, action.issuerTag, { connected: null })
					ctx.busAction.status = 'N'
					await metaAdapter.updateActionData(ctx.tnId, req.actionId, { status: 'N' })
					await metaAdapter.updateActionData(ctx.tnId, actionId, { status: 'N' })
				}
		}
	}
}

export async function handleFileShare(ctx: ActionContext, actionId: string, action: Action) {
	console.log('FSHR', action.issuerTag, action.audienceTag, ctx.idTag)
	if (action.audienceTag == ctx.idTag && action.subType !== 'DEL') {
		ctx.busAction.status = 'C'
		await metaAdapter.updateActionData(ctx.tnId, actionId, { status: 'C' })
	}
}

export async function handleInboundAction(tnId: number, idTag: string, actionId: string, action: Action) {
	const issuer = (await metaAdapter.readProfile(tnId, action.issuerTag))!
	const audience = action.audienceTag ? await metaAdapter.readProfile(tnId, action.audienceTag) : undefined
	const busAction: ActionView = {
		actionId,
		type: action.type,
		subType: action.subType,
		parentId: action.parentId,
		rootId: action.rootId,
		issuer,
		audience,
		createdAt: new Date(action.createdAt * 1000).toISOString(),
		expiresAt: action.expiresAt ? new Date(action.expiresAt * 1000).toISOString() : undefined,
		content: action.content,
		status: 'A',
		attachments: undefined // FIXME
		//attachments: action.attachments
	}
	const ctx: ActionContext = {
		tnId,
		idTag,
		busAction
	}

	switch (action.type) {
		case 'ACK':
			await handleAck(ctx, actionId, action)
			break
		case 'POST':
			await handlePost(ctx, actionId, action)
			break
		case 'MSG':
			await handleMsg(ctx, actionId, action)
			break
		case 'REACT':
		case 'CMNT':
			await handleReactionOrComment(ctx, actionId, action)
			break
		case 'STAT':
			await handleStat(ctx, actionId, action)
			break
		case 'CONN':
			await handleConn(ctx, actionId, action)
			break
		case 'FLLW':
			await handleFollow(ctx, actionId, action)
			break
		case 'FSHR':
			await handleFileShare(ctx, actionId, action)
			break
		default:
			return
	}
	const cnt = await messageBusAdapter.sendMessage(ctx.idTag, 'ACTION', busAction)
	console.log('WS BUS sent', cnt)
}

export async function handleInboundActionToken(tnId: number, actionId: string, token: string, opts?: { ack?: boolean}) {
	const idTag = await getIdentityTag(tnId)
	//const actionId = sha256(action.token)
	try {
		// Check and decode token
		const act = await checkToken(tnId, token)
		console.log('INBOUND ACTION', tnId, JSON.stringify(act))

		// Check if issuer has permission
		const issuerProfile = await metaAdapter.readProfile(tnId, act.iss)
		//if (!opts?.ack && !['FLLW', 'CONN'].includes(act.t) && !['C', 'F', 'T', 'A', 'M'].includes(issuerProfile?.status as string)) {

		let allowed = false
		if (opts?.ack) allowed = true
		// Allow followers and connection requests
		if (['FLLW', 'CONN'].includes(act.t)) allowed = true
		// Allow comments, reactions
		if (['CMNT', 'REACT'].includes(act.t) && act.aud == idTag) {
			const parentAction = await metaAdapter.listActions(tnId, undefined, {
				actionId: act.p,
				audience: act.aud || act.iss
			})
			console.log('PARENT ACTION', parentAction)
			if (parentAction.length) allowed = true
		}
		if (issuerProfile?.following || issuerProfile?.connected) allowed = true

		//if (!opts?.ack && !['FLLW', 'CONN'].includes(act.t) && !issuerProfile?.following && !issuerProfile?.connected) {
		if (!allowed) {
			console.log('Unknown issuer', issuerProfile)
			throw new Error('Unknown issuer')
		}
		if (!issuerProfile) await getProfile(tnId, act.iss)

		// Sync attachments if needed
		if (act.a && act.iss !== idTag) {
			const syncVariants =
				act.aud == idTag ? ['h', 's', 't']	// We are the audience, sync all HD and SD versions
				: ['s', 't'] // Sync only SD and thumbnail (FIXME: setting)

			console.log('SYNC ATTACHMENTS', act.iss, '->', idTag, act)
			const proxyToken = await createProxyToken(tnId, act.iss)
			if (!proxyToken) throw new Error('Failed to create proxy token')

			for (const attachment of act.a || []) {
				let [flags, variantIdsStr] = attachment.split(':')
				const variantIds = variantIdsStr.split(',')
				console.log('Syncing attachment', flags, variantIds)
				let meta: { fileId: string, contentType: string, fileName?: string, createdAt?: number, tags?: string[], x?: Record<string, unknown> } | undefined
				for (const variantId of variantIds) {
					console.log('Syncing attachment', variantId)
					const binRes = await fetch(`https://cl-o.${act.iss}/api/store/${variantId}`, {
						headers: { 'Authorization': `Bearer ${proxyToken}` },
						credentials: 'include'
					})
					if (!meta) {
						const metaRes = await fetch(`https://cl-o.${act.iss}/api/store/${variantId}/meta`, {
							headers: { 'Authorization': `Bearer ${proxyToken}` },
							credentials: 'include'
						})
						try {
							meta = await metaRes.json()
							console.log('META', meta)
						} catch (err) {
						}
					}
					const buf = Buffer.from(await binRes.arrayBuffer())
					await blobAdapter.writeBlob(tnId, variantId, '', buf)
					console.log('WRITE', variantId, buf.byteLength, !!meta, flags[0])
					if (meta && syncVariants.includes(flags[0])) await metaAdapter.createFileVariant(tnId, meta.fileId, variantId, {
						variant: flags[0] == 'h' ? 'hd' : flags[0] == 's' ? 'sd' : flags[0] == 't' ? 'tn' : 'orig',
						format: 'avif', // FIXME
						size: buf.byteLength
					})
					flags = flags.slice(1)
				}
				if (meta) {
					await metaAdapter.createFile(tnId, meta.fileId, {
						status: 'I',
						contentType: meta.contentType,
						fileName: meta.fileName,
						createdAt: meta.createdAt ? new Date(meta.createdAt) : undefined,
						tags: meta.tags?.length ? meta.tags : undefined,
						x: meta.x
					})
				}
			}
		}

		// Split type
		const [type, subType] = (act as any).st ? [act.t, (act as any).st]  : act.t.split(':')
		// Determine rootId
		const rootId = act.p ? await metaAdapter.getActionRootId(tnId, act.p) : undefined

		const action: Action = {
			actionId,
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
		await metaAdapter.createAction(tnId, action, generateActionKey(actionId, action))
		await handleInboundAction(tnId, idTag, actionId, action)
	} catch (err) {
		console.log('ERROR', err)
		throw err
	}
	return true
}

export async function startFollowing(tnId: number, idTag: string) {
	const proxyToken = await createProxyToken(tnId, idTag)
	if (!proxyToken) throw new Error('Failed to create proxy token')

	const res = await fetch(`https://cl-o.${idTag}/api/action/tokens?createdAfter=${dayjs().subtract(1, 'month').unix() / 1000}&_limit=10`, {
		headers: { 'Authorization': `Bearer ${proxyToken}` },
		credentials: 'include'
	})
	if (!res.ok) throw new Error('Failed to fetch feed')
	const d: { actions: string[] } = await res.json()
	for (const token of d.actions) {
		await createInboundActions(tnId, token)
	}
}

// vim: ts=4
