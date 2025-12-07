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

import { AceBase } from 'acebase'
import fs from 'fs/promises'
import * as T from '@symbion/runtype'

import { DatabaseAdapter, ListDataOptions } from '@cloudillo/server/types/database-adapter'

let db: AceBase

async function listData(
	tnId: number,
	fileId: string,
	path: string,
	{ filter, tag, preset }: ListDataOptions = {}
) {
	//const permCond = await getPermCond(auth, 'r')

	const snap = await db.ref(`${tnId}/db/${fileId}/${path}`).get()
	console.log('snap', snap.val)
	return snap.val() || []
}

export async function addData(tnId: number, fileId: string, path: string, data: unknown) {
	//const permCond = await getPermCond(auth, 'w')

	const ref = await db.ref(`${tnId}/db/${fileId}/${path}`).push(data)
	return ref.key
}

async function readData(tnId: number, fileId: string, path: string) {
	//const permCond = await getPermCond(auth, 'r')

	const snap = await db.ref(`${tnId}/db/${fileId}/${path}`).get()
	return snap.val()
}

export async function init({ dir }: { dir: string }): Promise<DatabaseAdapter> {
	await fs.mkdir(dir, { recursive: true })
	db = new AceBase('data', { storage: { path: dir } })
	db.ready(function () {
		console.log('DB ready')
	})

	return {
		listData,
		addData,
		readData
	}
}

// vim: ts=4
