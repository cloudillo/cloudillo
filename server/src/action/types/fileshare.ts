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

import { registerActionType, ActionContext, Action, NewAction, ActionView, createAction } from "../action.js";
import { metaAdapter } from '../../adapters.js'

import * as T from '@symbion/runtype'

const tFshrContent = T.struct({
		contentType: T.string,
		fileName: T.string
})

const tFshr = T.struct({
	iss: T.string,
	k: T.string,
	t: T.literal('FSHR'),
	st: T.optional(T.literal('DEL')),
	c: tFshrContent,
	p: T.undefinedValue,
	a: T.undefinedValue,
	aud: T.string,
	sub: T.string,
	iat: T.number,
	exp: T.optional(T.number)
})

async function handleFileShare(ctx: ActionContext, actionId: string, action: Action) {
	console.log('FSHR', action.issuerTag, action.audienceTag, ctx.idTag)
	if (action.audienceTag == ctx.idTag && action.subType !== 'DEL') {
		ctx.busAction.status = 'C'
		await metaAdapter.updateActionData(ctx.tnId, actionId, { status: 'C' })
	}
}

async function acceptHook(tnId: number, action: ActionView) {
	const content = T.decode(tFshrContent, action.content)
	if (!action?.subject || T.isErr(content)) return

	await metaAdapter.createFile(tnId, action.subject, { ...content.ok, ownerTag: action.issuer.idTag, status: 'M' })
}

export function generateKey(actionId: string, action: NewAction & { issuerTag: string }) {
	return `${action.type}:${action.subject}:${action.audienceTag}`
}

export default function init() {
	registerActionType('FSHR', {
		t: tFshr,
		generateKey,
		inboundHook: handleFileShare,
		acceptHook,
	})
}

// vim: ts=4
