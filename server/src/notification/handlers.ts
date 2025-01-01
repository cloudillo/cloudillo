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

import WebPush from 'web-push'

import * as T from '@symbion/runtype'

import { determineTnId } from '../auth.js'
import { validate, validateQS, ServerError } from '../utils.js'
import { App, State, Context, Router } from '../index.js'
import { metaAdapter } from '../adapters.js'

///////////////////////
// POST notification //
///////////////////////
export const tPostNotificationSubscription = T.struct({
	subscription: T.struct({
		endpoint: T.string,
		expirationTime: T.nullable(T.number),
		options: T.optional(T.unknown),
		keys: T.optional(T.unknown)
	})
})

export async function postNotificationSubscription(ctx: Context) {
	console.log('POST NOTIFICATION SUBSCRIPTION', ctx.state.user)
	if (!ctx.state.auth) ctx.throw(403)

	const p = validate(ctx, tPostNotificationSubscription)
	await metaAdapter.createSubscription(ctx.state.tnId, JSON.stringify(p.subscription))
	ctx.body = {}
}

// vim: ts=4
