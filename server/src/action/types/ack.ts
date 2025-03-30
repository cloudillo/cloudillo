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

import { registerActionType, ActionContext, Action, handleInboundActionToken } from "../action.js";
import { metaAdapter } from '../../adapters.js'

import * as T from '@symbion/runtype'

const tAck = T.struct({
	iss: T.string,
	k: T.string,
	t: T.literal('ACK'),
	st: T.optional(T.literal('DEL')),
	c: T.undefinedValue,
	p: T.undefinedValue,
	a: T.undefinedValue,
	aud: T.string,
	sub: T.string,
	iat: T.number,
	exp: T.optional(T.number)
})

async function handleAck({ tnId, idTag }: ActionContext, actionId: string, action: Action) {
	console.log(action.type, action.issuerTag, idTag, action)
	if (action.subject) {
		const token = await metaAdapter.getActionToken(tnId, action.subject)
		if (token) {
			await handleInboundActionToken(tnId, action.subject, token, { ack: true })
			await metaAdapter.updateInboundAction(tnId, action.subject, { status: 'R' })
		}
	}
}

export default function init() {
	registerActionType('ACK', {
		t: tAck,
		broadcast: true,
		inboundHook: handleAck,
	})
}

// vim: ts=4
