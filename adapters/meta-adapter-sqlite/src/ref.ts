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

import { db, ql } from './db.js'

export async function listRefs(tnId: number, type?: string): Promise<string[]> {
	const rows = await db.all<{ refId: string }>("SELECT refId FROM refs WHERE tnId = $tnId AND type = $type", { $tnId: tnId, $type: type })
	return rows.map(row => row.refId)
}

export async function createRef(tnId: number, refId: string, refType: string): Promise<void> {
	console.log('createRef', tnId, refId, refType)
	await db.run("INSERT INTO refs (tnId, refId, type) VALUES ($tnId, $ref, $type)", { $tnId: tnId, $ref: refId, $type: refType })
}

export async function getRef(tnId: number, refId: string) {
	const row = await db.get<{ refId: string, type: string }>("SELECT refId, type FROM refs WHERE tnId = $tnId AND refId = $refId", { $tnId: tnId, $refId: refId })
	return !row ? undefined : { ...row }
}

export async function useRef(tnId: number, refId: string): Promise<{ count: number }> {
	const row = await db.get<{ count: number}>("UPDATE refs SET count = count - 1 WHERE tnId = $tnId AND refId = $refId RETURNING count", { $tnId: tnId, $refId: refId })
	return row
}

export async function deleteRef(tnId: number, refId: string): Promise<void> {
	await db.run("UPDATE refs SET count = 0 WHERE tnId = $tnId AND refId = $refId", { $tnId: tnId, $refId: refId })
}

// vim: ts=4
