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

const URL = 'https://nikita.cloudillo.net/'

import { nanoid } from 'nanoid'
import * as T from '@symbion/runtype'

import { Context } from '../index.js'
import { validateQS } from '../utils.js'
import { metaAdapter } from '../adapters.js'

export async function listRefs(ctx: Context) {
	const tnId = ctx.state.tnId
	const { type } = validateQS(ctx, T.struct({ type: T.optional(T.string) }), ctx.query)
	//if (!ctx.state.user?.u || (ctx.state.user?.u != ctx.state.user?.t)) ctx.throw(403)
	ctx.body = await metaAdapter.listRefs(tnId, type)
}

export async function getRef(ctx: Context) {
	const tnId = ctx.state.tnId
	const ref = await metaAdapter.getRef(tnId, ctx.params.id)

	if (!ref) ctx.throw(404)

	ctx.redirect(`${URL}${ref.type}/${ref.refId}`)
}

export async function postRef(ctx: Context) {
	const tnId = ctx.state.tnId
	const type = ctx.params?.type
	const id = nanoid()
	await metaAdapter.createRef(tnId, id, type)

	ctx.body = { id }
}

// vim: ts=4
