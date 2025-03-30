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

import { registerActionType, CreateActionContext, ActionContext, Action, NewAction, ActionView, AudienceInfo, createAction, startFollowing } from "../action.js";
import { metaAdapter } from '../../adapters.js'

import * as T from '@symbion/runtype'

const tConn = T.struct({
	iss: T.string,
	k: T.string,
	t: T.literal('CONN'),
	st: T.optional(T.literal('DEL')),
	c: T.optional(T.string),
	p: T.undefinedValue,
	a: T.undefinedValue,
	aud: T.string,
	sub: T.undefinedValue,
	iat: T.number,
	exp: T.optional(T.number)
})

async function createConnect({ tnId, tenantTag }: CreateActionContext, action: Action, audience?: AudienceInfo) {
	if (!audience) return

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
}

async function handleConnect(ctx: ActionContext, actionId: string, action: Action) {
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

function generateKey(actionId: string, action: NewAction & { issuerTag: string }) {
	return `${action.type}:${action.issuerTag}:${action.audienceTag}`
}

async function acceptHook(tnId: number, action: ActionView) {
	if (action.subType == 'DEL' || !action.audience) return

	const req = await metaAdapter.getActionByKey(tnId, `CONN:${action.audience.idTag}:${action.issuer.idTag}`)
	if (req && !req?.subType) {
	} else {
		await createAction(tnId, { type: 'CONN', audienceTag: action.issuer.idTag })
	}
	await metaAdapter.updateProfile(tnId, action.issuer.idTag, { connected: true, following: true })
}

export default function init() {
	registerActionType('CONN', {
		t: tConn,
		generateKey,
		allowUnknown: true,
		inboundHook: handleConnect,
		acceptHook,
	})
}

// vim: ts=4
