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

import { ActionType, Action, NewAction, tFileShareAction } from '@cloudillo/types'

import { sha256 } from '../utils.js'
import { Auth } from '../index.js'
import { cancelWait } from '../worker.js'
import { ProxyToken, createActionToken, createProxyToken } from '../auth/handlers.js'
import { tAuthProfile, ActionToken, tActionToken } from '../auth-adapter.js'
//import { sendWsBusMsg } from '../ws.js'
//import { sendNotification } from '../notification/index.js'

import { metaAdapter } from '../adapters.js'

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

export function generateActionKey(actionId: string, action: NewAction & { issuerTag: string }) {
	let key: string | undefined
	switch (action.type) {
		case 'REACT':
			key = `${action.type}:${action.parentId}:${action.issuerTag}`
			break
		case 'STAT':
			key = `${action.type}:${action.parentId}`
			break
		case 'FLLW':
		case 'CONN':
			key = `${action.type}:${action.issuerTag}:${action.audienceTag}`
			break
		case 'FSHR':
			key = `${action.type}:${action.subject}`
			break
	}
	console.log('generateActionKey', key)
	return key
}

// Types //
///////////

/*
export const tActionToken = T.taggedUnion('t')({
	POST: T.struct({
		iss: T.string,
		k: T.string,
		t: T.literal('POST'),
		st: T.optional(T.literal('TEXT', 'IMG', 'VID')),
		c: T.string,
		p: T.undefinedValue,
		a: T.optional(T.array(T.string)),
		aud: T.optional(T.string),
		sub: T.optional(T.string),
		//sub: T.undefinedValue,
		iat: T.number,
		exp: T.number
	}),
	REPOST: T.struct({
		iss: T.string,
		k: T.string,
		t: T.literal('REPOST'),
		//st: T.undefinedValue,
		c: T.optional(T.string),
		p: T.string, // Parent ID (user@tag:actionId)
		a: T.optional(T.array(T.string)),
		aud: T.optional(T.string),
		sub: T.undefinedValue,
		iat: T.number,
		exp: T.number
	}),
	CMNT: T.struct({
		iss: T.string,
		k: T.string,
		t: T.literal('CMNT'),
		//st: T.undefinedValue,
		c: T.string,
		p: T.string, // Parent ID (user@tag:actionId)
		a: T.optional(T.array(T.string)),
		aud: T.undefinedValue,
		sub: T.undefinedValue,
		iat: T.number,
		exp: T.number
	}),
	FLLW: T.struct({
		iss: T.string,
		k: T.string,
		t: T.literal('FLLW'),
		//st: T.undefinedValue,
		c: T.undefinedValue,
		p: T.undefinedValue,
		a: T.undefinedValue,
		aud: T.undefinedValue,
		sub: T.string,
		iat: T.number,
		exp: T.number
	}),
	REACT: T.struct({
		iss: T.string,
		k: T.string,
		t: T.literal('REACT'),
		//st: T.undefinedValue,
		c: T.undefinedValue,
		p: T.string, // Parent ID (user@tag:actionId)
		a: T.undefinedValue,
		aud: T.undefinedValue,
		sub: T.undefinedValue,
		iat: T.number,
		exp: T.number
	}),

	PROXY: T.struct({
		iss: T.string,
		k: T.string,
		t: T.literal('PROXY'),
		//st: T.undefinedValue,
		c: T.undefinedValue,
		p: T.undefinedValue,
		a: T.undefinedValue,
		aud: T.string,
		sub: T.undefinedValue,
		iat: T.number,
		exp: T.number
	}),
	SHRE: T.struct({
		iss: T.string,
		k: T.string,
		t: T.literal('SHRE'),
		//st: T.undefinedValue,
		c: T.optional(T.string),
		p: T.undefinedValue,
		a: T.undefinedValue,
		aud: T.string,
		sub: T.string,
		iat: T.number,
		exp: T.number
	}),

	MSG: T.struct({
		iss: T.string,
		k: T.string,
		t: T.literal('MSG'),
		st: T.optional(T.literal('TEXT', 'IMG', 'VID')),
		c: T.string,
		p: T.undefinedValue,
		a: T.optional(T.array(T.string)),
		aud: T.optional(T.string),
		sub: T.optional(T.string),
		//sub: T.undefinedValue,
		iat: T.number,
		exp: T.number
	}),
})
export type ActionToken = T.TypeOf<typeof tActionToken>
*/

export async function createAction(tnId: number, action: Action) {
	try {
		const issuerTag = await metaAdapter.getTenantIdentityTag(tnId)
		if (!issuerTag) return
		const act = { ...action, createdAt: Math.trunc(Date.now() / 1000), issuerTag }
		const token = await createActionToken(tnId, tnId, act)
		if (!token) return
		//const { iss, iat, exp } = jwt.decode(token) as { iss: string, iat: number, exp: number }
		//const actionId = token?.split('.')[2]
		const actionId = sha256(token)

		// Determine rootId
		const rootId = action.parentId ? await metaAdapter.getActionRootId(tnId, action.parentId) : undefined
		const key = generateActionKey(actionId, { ...action, issuerTag })
		console.log('ROOT', rootId)

		await metaAdapter.createAction(tnId, actionId, act, key)

		if (['POST', 'ACK', 'STAT'].includes(action.type) && action.issuerTag == issuerTag) {
			// FIXME: filter followers by access
			await metaAdapter.createOutboundAction(tnId, actionId, token, {
				followTag: issuerTag,
				audienceTag: action.audienceTag
			})
		} else if (action.audienceTag && action.audienceTag != issuerTag) {
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
	console.log('ACTION', action)
	const content = T.decode(tFileShareAction.props.content, action.content)
	console.log('ACTION.content', content)
	if (!action?.subject || T.isErr(content)) return

	await metaAdapter.createFile(tnId, action.subject, { ...content.ok, ownerTag: action.issuer.idTag, status: 'M' })
	await metaAdapter.updateActionData(tnId, actionId, { status: undefined })
}

export async function rejectAction(tnId: number, actionId: string) {
	await metaAdapter.updateActionData(tnId, actionId, { status: 'D' })
}

// vim: ts=4
