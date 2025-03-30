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

const tMsg = T.struct({
	iss: T.string,
	k: T.string,
	t: T.literal('MSG'),
	st: T.optional(T.literal('DEL')),
	c: T.optional(T.string),
	p: T.optional(T.string),
	a: T.optional(T.array(T.string)),
	aud: T.string,
	sub: T.undefinedValue,
	iat: T.number,
	exp: T.optional(T.number)
})

async function handleMsg({ tnId, idTag }: ActionContext, actionId: string, action: Action) {
	console.log('MSG', action.issuerTag, action.audienceTag, idTag)
}

export default function init() {
	registerActionType('MSG', {
		t: tMsg,
		inboundHook: handleMsg,
	})
}

// vim: ts=4
