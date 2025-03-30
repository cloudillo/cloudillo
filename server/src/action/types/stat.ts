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

import * as T from '@symbion/runtype'

import { registerActionType, ActionContext, Action, NewAction, createAction } from "../action.js";
import { metaAdapter } from '../../adapters.js'

const tStatContent = T.type({
	r: T.optional(T.number),
	c: T.optional(T.number)
})

const tStat = T.struct({
	iss: T.string,
	k: T.string,
	t: T.literal('STAT'),
	st: T.undefinedValue,
	c: tStatContent,
	p: T.string,
	a: T.undefinedValue,
	aud: T.undefinedValue,
	sub: T.undefinedValue,
	iat: T.number,
	exp: T.optional(T.number)
})

async function handleStat({ tnId, idTag }: ActionContext, actionId: string, action: Action) {
	console.log('STAT', action.issuerTag, action.audienceTag, idTag, action.content)
	const contentRes = T.decode(tStatContent, action.content)
	if (T.isOk(contentRes)) {
		const { r, c } = contentRes.ok
		if (action.parentId) await metaAdapter.updateActionData(tnId, action.parentId, { reactions: r, comments: c })
	}
}

export function generateKey(actionId: string, action: NewAction & { issuerTag: string }) {
	return `${action.type}:${action.parentId}`
}

export default function init() {
	registerActionType('STAT', {
		t: tStat,
		generateKey,
		broadcast: true,
		inboundHook: handleStat,
	})
}

// vim: ts=4
