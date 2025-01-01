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

import { validate, validateQS, ServerError } from '../utils.js'
import { App, State, Context, Router } from '../index.js'
//import { getSettings, getSetting, updateSetting } from '../meta-store/settings.js'
import { metaAdapter } from '../adapters.js'

//////////////////
// GET settings //
//////////////////
const tGetSettingsQuery = T.struct({
	prefix: T.optional(T.array(T.string))
})

export async function listSettings(ctx: Context) {
	if (!ctx.state.auth) ctx.throw(403)

	const q = validateQS(ctx, tGetSettingsQuery)
	const settings = await metaAdapter.listSettings(ctx.state.tnId, q)
	ctx.body = { settings }
}

/////////////////
// GET setting //
/////////////////
export async function getSetting(ctx: Context) {
	if (!ctx.state.auth) ctx.throw(403)

	const setting = await metaAdapter.readSetting(ctx.state.tnId, ctx.params.name)
	ctx.body = { setting }
}

/////////////////
// PUT setting //
/////////////////
const tPutSetting = T.struct({
	value: T.optional(T.union(T.string, T.number, T.boolean))
})

export async function putSetting(ctx: Context) {
	const name = ctx.params.name
	if (!ctx.state.auth) ctx.throw(403)

	const p = validate(ctx, tPutSetting)
	console.log('putSetting', p)
	await metaAdapter.updateSetting(ctx.state.tnId, name, p.value)
	ctx.body = {}
}

// vim: ts=4
