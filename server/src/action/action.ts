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
import jwt from 'jsonwebtoken'

import * as T from '@symbion/runtype'

import { ActionType, ActionView, Action, NewAction, tFileShareAction } from '@cloudillo/types'

import { sha256 } from '../utils.js'
import { Auth } from '../index.js'
import { cancelWait } from '../worker.js'
import { ProxyToken, createActionToken, createProxyToken, getIdentityTag } from '../auth/handlers.js'
import { tAuthProfile, ActionToken, tActionToken } from '../auth-adapter.js'
import { ProfileStatus } from '../meta-adapter.js'
import { getProfile } from '../profile/profile.js'
//import { sendWsBusMsg } from '../ws.js'
//import { sendNotification } from '../notification/index.js'

import { metaAdapter, blobAdapter, messageBusAdapter } from '../adapters.js'

export { ActionType, ActionView, Action, NewAction, ProfileStatus }

import initAck from './types/ack.js'
import initConnect from './types/connect.js'
import initFileShare from './types/fileshare.js'
import initFollow from './types/follow.js'
import initMsg from './types/msg.js'
import initPost from './types/post.js'
import initReact from './types/react.js'
import initRepost from './types/repost.js'
import initStat from './types/stat.js'

// Utility functions //
///////////////////////
export async function checkToken(tnId: number, token: string): Promise<ActionToken> {
	const decoded = jwt.decode(token) as { t: string, iss: string, k: string }
	if (decoded && decoded.iss && decoded.k && typeof decoded.t === 'string') {
		//const { iss: issuerTag, k } = jwt.decode(token) as { iss: string, k: string }
		let key = await metaAdapter.getProfilePublicKey(tnId, decoded.iss, decoded.k)
		//console.log('KEY', decoded.iss, decoded.k, key)
		if (!key) {
			const res = await fetch(`https://cl-o.${decoded.iss}/api/me/keys`)
			if (res.ok) {
				const profile = T.decode(tAuthProfile, await res.json(), { unknownFields: 'drop' })
				if (T.isOk(profile)) {
					//console.log('PROFILE', profile.ok)
					key = profile.ok.keys.find(k => k.keyId == decoded.k)
					if (key) await metaAdapter.addProfilePublicKey(tnId, decoded.iss, {
						keyId: decoded.k,
						publicKey: key.publicKey,
						expires: key.expires ? dayjs(key.expires).unix() : undefined
					})
				} else {
					console.log('IDENTITY KEY ERROR', JSON.stringify(profile, null, 4))
				}
			} else {
				console.log('RES', res.status)
			}
		}
		//console.trace('KEY', key)
		if (!key) throw new Error('Invalid key')
		const keyPEM = `-----BEGIN PUBLIC KEY-----\n${key.publicKey}\n-----END PUBLIC KEY-----`
		//console.log('TOKEN', token, keyPEM)
		const rawJSON = jwt.verify(token, keyPEM)
		const [t, st] = decoded.t.split(':')
		//const act = T.decode(tActionToken, { ...decoded, t, st })
		const tAction = actionHooks[t]?.t || tActionToken
		const act = { ...T.decode(tActionToken, decoded), t, st }
		if (T.isErr(act)) console.log('ERROR token', JSON.stringify(act.err, null, 4))
		if (T.isOk(act)) {
			//console.log('ACTION', JSON.stringify(act.ok, null, 4))
			return act.ok
		}
	}
	console.log('Decoded token:', decoded)
	throw new Error('Invalid token')
}

// Action type hooks //
///////////////////////
export interface CreateActionContext {
	tnId: number
	tenantTag: string
}

export interface ActionContext {
	tnId: number
	idTag: string
	busAction: ActionView
}

export interface AudienceInfo {
    idTag: string;
    name: string;
    profilePic?: string | undefined;
    status?: ProfileStatus;
    following?: boolean;
    connected?: boolean;
}

export interface ActionHook {
	// Runtype for the action token
	t: T.Type<any>,
	// How to generate DB key for the action
	generateKey?: (actionId: string, action: NewAction & { issuerTag: string }) => string
	// Broadcat the action to followers
	broadcast?: boolean
	// Allow from unknown profiles
	allowUnknown?: boolean
	// Hook called when action is created
	createHook?: (ctx: CreateActionContext, action: NewAction, audience: AudienceInfo | undefined) => Promise<void>
	// Hook called when action is received
	inboundHook?: (ctx: ActionContext, actionId: string, action: Action) => Promise<void>
	// Hook called when action is accepted (in notifications)
	acceptHook?: (tnId: number, action: ActionView) => Promise<void>
	// Hook called when action is rejected (in notifications)
	rejectHook?: (tnId: number, action: ActionView) => Promise<void>
}

export const actionHooks: Record<string, ActionHook | undefined> = {}

export function registerActionType(type: string, actionHook: ActionHook) {
	console.log('Register action type:', type)
	actionHooks[type] = actionHook
}

export function generateActionKey(actionId: string, action: NewAction & { issuerTag: string }) {
	return actionHooks[action.type]?.generateKey?.(actionId, action)
}

// Types //
///////////

export async function createAction(tnId: number, action: NewAction) {
	try {
		const issuerTag = await metaAdapter.getTenantIdentityTag(tnId)
		if (!issuerTag) return

		const act = { ...action, createdAt: Math.trunc(Date.now() / 1000), issuerTag }
		const token = await createActionToken(tnId, tnId, act)
		/*
			...act,
			issuerTag,
			createdAt: Math.trunc(Date.now() / 1000)
		})
		*/
		if (!token) return
		//const { iss, iat, exp } = jwt.decode(token) as { iss: string, iat: number, exp: number }
		//const actionId = token?.split('.')[2]
		const actionId = sha256(token)

		// Determine rootId
		const rootId = action.parentId ? await metaAdapter.getActionRootId(tnId, action.parentId) : undefined
		const key = generateActionKey(actionId, { ...action, issuerTag })
		console.log('ROOT', rootId)

		await metaAdapter.createAction(tnId, { ...act, actionId }, key)

		const actionHook = actionHooks[action.type]
		if (actionHook?.broadcast && !action.audienceTag) {
			// Broadcast action to followers
			// FIXME: filter followers by access
			await metaAdapter.createOutboundAction(tnId, actionId, token, {
				followTag: issuerTag,
				//audienceTag: action.audienceTag
			})
		} else if (action.audienceTag && action.audienceTag != issuerTag) {
			// Send to audience
			await metaAdapter.createOutboundAction(tnId, actionId, token, {
				audienceTag: action.audienceTag
			})
		}

		cancelWait()
		return actionId
	} catch (err) {
		console.log('TOKEN ERROR', err)
	}
}

export async function acceptAction(tnId: number, actionId: string) {
	const action = (await metaAdapter.listActions(tnId, undefined, { actionId }))?.[0]
	if (!action) return
	console.log('acceptAction', action.type, action.subType, action.issuer?.idTag, action.audience?.idTag)
	const actionHook = actionHooks[action.type]

	await actionHook?.acceptHook?.(tnId, action)
	await metaAdapter.updateActionData(tnId, actionId, { status: null })
}

export async function rejectAction(tnId: number, actionId: string) {
	const action = (await metaAdapter.listActions(tnId, undefined, { actionId }))?.[0]
	if (!action) return
	const actionHook = actionHooks[action.type]

	await actionHook?.rejectHook?.(tnId, action)
	await metaAdapter.updateActionData(tnId, actionId, { status: 'D' })
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
export async function createInboundActions(tnId: number, token: string, relatedTokens?: string[]) {
	const actionId = sha256(token)
	await metaAdapter.createInboundAction(tnId, actionId, token)
	if (relatedTokens) for (const r of relatedTokens) {
		const relActionId = sha256(r)
		await metaAdapter.createInboundAction(tnId, relActionId, r, token)
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

	const actionHook = actionHooks[action.type]
	if (actionHook) console.log('CALLING ACTION HOOK...', action.type)
	if (actionHook?.inboundHook) {
		await actionHook.inboundHook(ctx, actionId, action)
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
		const actionHook = actionHooks[act.t]
		console.log('INBOUND ACTION', tnId, JSON.stringify(act))

		// Check if issuer has permission
		const issuerProfile = await metaAdapter.readProfile(tnId, act.iss)

		let allowed = false
		if (opts?.ack) allowed = true
		// Allow followers and connection requests
		if (actionHook?.allowUnknown) {
			if (!act.p) {
				// E.g. CONN, FLLW
				allowed = true
			} else {
				// E.g. REACT, CMNT
				const parentAction = await metaAdapter.listActions(tnId, undefined, {
					actionId: act.p,
					audience: act.aud || act.iss
				})
				console.log('PARENT ACTION', parentAction)
				if (parentAction.length) allowed = true
			}
		}
		if (issuerProfile?.following || issuerProfile?.connected) allowed = true

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

export async function init() {
	initAck()
	initConnect()
	initFileShare()
	initFollow()
	initMsg()
	initPost()
	initReact()
	initRepost()
	initStat()
}

// vim: ts=4
