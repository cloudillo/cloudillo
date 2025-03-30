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

import { registerActionType, ActionContext, Action, NewAction, createAction } from "../action.js";
import { metaAdapter } from '../../adapters.js'

import * as T from '@symbion/runtype'

const tCmnt = T.struct({
	iss: T.string,
	k: T.string,
	t: T.literal('CMNT'),
	st: T.optional(T.literal('DEL')),
	c: T.string,
	p: T.string,
	a: T.optional(T.array(T.string)),
	aud: T.optional(T.string),
	sub: T.undefinedValue,
	iat: T.number,
	exp: T.optional(T.number)
})

const tReact = T.struct({
	iss: T.string,
	k: T.string,
	t: T.literal('REACT'),
	st: T.optional(T.literal('LIKE', 'DEL')),
	c: T.undefinedValue,
	p: T.string,
	a: T.optional(T.array(T.string)),
	aud: T.optional(T.string),
	sub: T.undefinedValue,
	iat: T.number,
	exp: T.optional(T.number)
})

async function handleReactionOrComment({ tnId, idTag }: ActionContext, actionId: string, action: Action) {
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

export function generateKey(actionId: string, action: NewAction & { issuerTag: string }) {
	return `${action.type}:${action.parentId}:${action.issuerTag}`
}

export default function init() {
	registerActionType('REACT', {
		t: tReact,
		generateKey,
		allowUnknown: true,
		inboundHook: handleReactionOrComment,
	})
	registerActionType('CMNT', {
		t: tCmnt,
		generateKey,
		allowUnknown: true,
		inboundHook: handleReactionOrComment,
	})
}

// vim: ts=4
