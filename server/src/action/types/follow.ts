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

import { registerActionType, CreateActionContext, ActionContext, Action, NewAction, AudienceInfo } from "../action.js";
import { metaAdapter } from '../../adapters.js'

import * as T from '@symbion/runtype'

const tConnect = T.struct({
	iss: T.string,
	k: T.string,
	t: T.literal('FLLW'),
	st: T.optional(T.literal('DEL')),
	c: T.optional(T.string),
	p: T.undefinedValue,
	a: T.undefinedValue,
	aud: T.string,
	sub: T.undefinedValue,
	iat: T.number,
	exp: T.optional(T.number)
})

async function createHook({ tnId, tenantTag }: CreateActionContext, action: NewAction, audience?: AudienceInfo) {
	if (!audience) return

	console.log('FOLLOW', audience)
	if (!action.subType && !audience?.following) {
		metaAdapter.updateProfile(tnId, audience.idTag, { following: true })
	} else if (action.subType == 'DEL') {
		metaAdapter.updateProfile(tnId, audience.idTag, { following: null })
	}
}

export function generateKey(actionId: string, action: NewAction & { issuerTag: string }) {
	return `${action.type}:${action.issuerTag}:${action.audienceTag}`
}

export default function init() {
	registerActionType('FLLW', {
		t: tConnect,
		generateKey,
		allowUnknown: true,
		createHook
	})
}

// vim: ts=4
