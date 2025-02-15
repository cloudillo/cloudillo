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

const TAG_FORBIDDEN_CHARS = [' ', ',', '#', '\t', '\n']

//import { Router } from './index.js'
import { HttpError} from 'koa'
import { nanoid } from 'nanoid'
import * as T from '@symbion/runtype'

import { tActionType, tActionStatus, tNewAction } from '@cloudillo/types'

import { Context } from '../index.js'
import { validate, validateQS, sha256 } from '../utils.js'
import { createAction, acceptAction, rejectAction } from './action.js'
import { tProfile, getProfile } from '../profile/profile.js'
import { metaAdapter } from '../adapters.js'

//////////////////
// API handlers //
//////////////////
const tListActionsQuery = T.struct({
	types: T.optional(T.string),
	statuses: T.optional(T.array(tActionStatus)),
	audience: T.optional(T.string),
	involved: T.optional(T.string),
	parentId: T.optional(T.string),
	rootId: T.optional(T.string),
	subject: T.optional(T.string)
})

export async function listActions(ctx: Context) {
	//if (!ctx.state.user?.u || (ctx.state.user?.u != ctx.state.user?.t)) ctx.throw(403)
	const tnId = ctx.state.tnId
	console.log('GET', ctx.hostname, tnId)
	console.log('VALIDATE', ctx.query)
	const q = validateQS(ctx, tListActionsQuery)

	const qTypes = typeof ctx.query.types === 'string' ? ctx.query.types : undefined
	const fTypes = qTypes ? T.decode(T.array(tActionType), qTypes.split(',')) : T.ok(undefined)
	if (fTypes && T.isErr(fTypes)) {
		console.log('ERROR', ctx.query, qTypes, qTypes?.split(','), fTypes)
		ctx.throw(422)
	}

	const actions = await metaAdapter.listActions(tnId, ctx.state.auth, {
		...q,
		types: fTypes.ok,
		//parentId: q.parentId,
		//rootId: q.rootId
	})
	ctx.body = { actions }
}

export async function postAction(ctx: Context) {
	const { tnId, tenantTag } = ctx.state
	const expire = +(ctx.query.expire || 365)
	const action = validate(ctx, tNewAction)
	console.log('POST', JSON.stringify(action))

	const actionId = await createAction(tnId, {
		...action,
		//issuerTag: tenantTag,
		//createdAt: Math.trunc(Date.now() / 10) / 100,
		expiresAt: Date.now() / 1000 + expire * 24 * 3600
	})
	const tenant = await metaAdapter.readTenant(tnId)
	const audience = action.audienceTag ? await getProfile(tnId, action.audienceTag) : undefined

	// HOOKS?
	switch (action.type) {
		case 'FLLW':
			if (!audience) break

			console.log('FOLLOW', audience)
			if (!action.subType && !audience?.following) {
				metaAdapter.updateProfile(tnId, audience.idTag, { following: true })
			} else if (action.subType == 'DEL') {
				metaAdapter.updateProfile(tnId, audience.idTag, { following: null })
			}
			break
		case 'CONN':
			if (!audience) break

			const request = await metaAdapter.getActionByKey(tnId, `CONN:${audience.idTag}:${tenantTag}`)
			if (!action.subType && !audience?.connected) {
				metaAdapter.updateProfile(tnId, audience.idTag, {
					following: true,
					connected: request && !request.subType ? true
						: !request || request.subType == 'DEL' ? 'R'
						: null
				})
			} else if (action.subType == 'DEL') {
				metaAdapter.updateProfile(tnId, audience.idTag, { connected: null })
			}
			break
			/*
			if (audience && (!audience?.status || audience?.status == 'B')) {
				metaAdapter.updateProfile(tnId, audience.idTag, { status: 'F' })
			}
			break
			*/
	}
	// / HOOKS

	ctx.body = {
		...action,
		actionId,
		audienceTag: undefined,
		audience: audience ? {
			idTag: audience?.idTag,
			name: audience?.name,
			profilePic: audience?.profilePic
		} : undefined,
		issuer: {
			idTag: tenant?.idTag,
			name: tenant?.name,
			profilePic: tenant?.profilePic?.ic
		},
		createdAt: new Date(),
	}
}

const tPostActionStat = T.struct({
	commentsRead: T.optional(T.number)
})
export async function postActionStat(ctx: Context) {
	const { tnId } = ctx.state
	const { actionId } = ctx.params
	const d = validate(ctx, tPostActionStat)
	await metaAdapter.updateActionData(tnId, actionId, d)
	ctx.body = {}
}

export async function postActionAccept(ctx: Context) {
	const { tnId } = ctx.state
	const { actionId } = ctx.params
	await acceptAction(tnId, actionId)
	ctx.body = {}
}

export async function postActionReject(ctx: Context) {
	const { tnId } = ctx.state
	console.log('REJECT', ctx.params)
	const { actionId } = ctx.params
	await rejectAction(tnId, actionId)
	ctx.body = {}
}

const tPostInboundAction = T.struct({
	token: T.string,
	related: T.optional(T.array(T.string))
})
export async function postInboundAction(ctx: Context) {
	const tnId = ctx.state.tnId
	const { token, related } = validate(ctx, tPostInboundAction)
	console.log('INBOX', ctx.hostname, { tnId, token, related })

	const actionId = sha256(token)
	await metaAdapter.createInboundAction(tnId, actionId, token)
	if (related) for (const r of related) {
		const relActionId = sha256(r)
		await metaAdapter.createInboundAction(tnId, relActionId, r, token)
	}
	ctx.body = {}
}

// vim: ts=4
