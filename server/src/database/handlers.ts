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

import { nanoid } from 'nanoid'
import * as T from '@symbion/runtype'

import { Context } from '../index.js'
import { validate, validateQS } from '../utils.js'
import { databaseAdapter, metaAdapter } from '../adapters.js'

//////////////////
// API handlers //
//////////////////
export async function listData(ctx: Context) {
	const { tnId } = ctx.state
	console.log('listData', ctx.state.user)
	const q = ctx.query

	const meta = await metaAdapter.readFile(tnId, ctx.params.fileId)
	if (!meta) ctx.throw(404)

	console.log('listData', ctx.state.auth)

	const data = await databaseAdapter.listData(tnId, ctx.params.fileId, `data`, q)
	//console.log('data', data)
	ctx.body = {
		data: Object.values<{ _tm?: number }>(data).sort((a, b) => (b._tm ?? 0) - (a._tm ?? 0))
	}
}

const tPostDataRequest = T.unknownObject

export async function postData(ctx: Context) {
	const { tnId } = ctx.state
	const p = validate(ctx, tPostDataRequest)
	console.log('POST', p)
	const d = { ...p, _tm: Date.now(), _ip: ctx.request.ip }

	//const createdAt = new Date()
	const dataId = await databaseAdapter.addData(tnId, ctx.params.fileId, `data`, d)
	ctx.body = {
		id: dataId
	}
}

export async function getData(ctx: Context) {
	const { tnId } = ctx.state
	const { fileId, dataId } = ctx.params
	console.log('GET', fileId, dataId)

	const data = await databaseAdapter.readData(tnId, fileId, `${tnId}/db/${fileId}/data/${dataId}`)
	if (!data) ctx.throw(404)

	ctx.body = data
}

// vim: ts=4
