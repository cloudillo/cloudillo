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

const tRepost = T.struct({
	iss: T.string,
	k: T.string,
	t: T.literal('REPOST'),
	st: T.optional(T.literal('TEXT', 'DEL')),
	c: T.string,
	p: T.undefinedValue,
	a: T.optional(T.array(T.string)),
	aud: T.optional(T.string),
	sub: T.string,
	iat: T.number,
	exp: T.optional(T.number)
})

async function handleRepost({ tnId, idTag }: ActionContext, actionId: string, action: Action) {
	console.log('REPOST', action.issuerTag, action.audienceTag, idTag)
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

export default function init() {
	registerActionType('REPOST', {
		t: tRepost,
		broadcast: true,
		inboundHook: handleRepost,
	})
}

// vim: ts=4
