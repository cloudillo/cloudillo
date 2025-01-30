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
import { Ref, ListRefsOptions, CreateRefOptions } from '@cloudillo/server/types/meta-adapter'

import { db, ql } from './db.js'

export async function listRefs(tnId: number, opts?: ListRefsOptions): Promise<Ref[]> {
	const rows = await db.all<{ refId: string, type: string, description: string, createdAt: number, expiresAt: number, count: number }>(
		`SELECT refId, type, description, createdAt, expiresAt, count FROM refs
		WHERE tnId = $tnId AND type = $type
		${opts?.filter == 'active' ? 'AND (expiresAt ISNULL OR expiresAt > unixepoch()) AND count > 0'
		: opts?.filter == 'used' ? 'AND count = 0'
		: ''}
		ORDER BY createdAt DESC, description`, { $tnId: tnId, $type: opts?.type }
	)
	return rows.map(row => ({
		...row,
		createdAt: new Date(row.createdAt * 1000),
		expiresAt: !row.expiresAt ? undefined : new Date(row.expiresAt * 1000)
	}))
}

export async function createRef(tnId: number, refId: string, opts: CreateRefOptions): Promise<Ref> {
	console.log('createRef', tnId, refId, opts.type)
	const res = await db.get<{ refId: string, type: string, description: string, createdAt: number, expiresAt: number, count: number }>(
		`INSERT INTO refs (tnId, refId, type, description, expiresAt, count)
		VALUES ($tnId, $ref, $type, $description, $expiresAt, $count)
		RETURNING refId, type, description, createdAt`,
		{ $tnId: tnId, $ref: refId, $type: opts.type, $description: opts.description, $expiresAt: opts.expiresAt, $count: opts.count || 1 }
	)
	return {
		...res,
		createdAt: new Date(res.createdAt * 1000),
		expiresAt: !res.expiresAt ? undefined : new Date(res.expiresAt * 1000)
	}
}

export async function getRef(tnId: number, refId: string): Promise<{ refId: string, type: string } | undefined> {
	const row = await db.get<{ refId: string, type: string }>(
		`SELECT refId, type FROM refs
		WHERE tnId = $tnId AND refId = $refId AND (expiresAt ISNULL OR expiresAt > unixepoch()) AND count > 0`,
		{ $tnId: tnId, $refId: refId }
	)
	return !row ? undefined : row
}

export async function useRef(tnId: number, refId: string): Promise<{ count: number }> {
	const row = await db.get<{ count: number}>(
		`UPDATE refs SET count = count - 1
		WHERE tnId = $tnId AND refId = $refId AND count > 0 RETURNING count`,
		{ $tnId: tnId, $refId: refId }
	)
	return row
}

export async function deleteRef(tnId: number, refId: string): Promise<void> {
	await db.run("DELETE FROM refs WHERE tnId = $tnId AND refId = $refId", { $tnId: tnId, $refId: refId })
}

// vim: ts=4
