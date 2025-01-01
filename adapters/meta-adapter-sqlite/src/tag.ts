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

export async function listTags(tnId: number, prefix?: string) {
	const rows = await db.all<{ tag: string, privileged: boolean }>("SELECT tag, perms IS NOT NULL as privileged FROM tags WHERE tnId = $tnId AND tag LIKE $tagLike", { $tnId: tnId, $tagLike: (prefix || '') + '%' })
	return rows
}

export async function addTag(tnId: number, fileId: string, tag: string) {
	await db.run(`INSERT OR IGNORE INTO tags (tnId, tag) VALUES ($tnId, $tag)
		RETURNING permRead, permWrite, permAdmin`,
		{ $tnId: tnId, $tag: tag })
	const res = await db.get<{ tags?: string }>(`
		UPDATE meta SET tags=json_set(coalesce(tags, '[]'), '$[#]', $tag)
		WHERE tnId=$tnId AND fileId=$fileId AND coalesce(tags, '') NOT LIKE '%"'||$tag||'"%'
		RETURNING tags`, { $tnId: tnId, $fileId: fileId, $tag: tag })
	return JSON.parse(res?.tags || '[]')
}

export async function removeTag(tnId: number, fileId: string, tag: string) {
	const res = await db.get<{ tags?: string }>(`UPDATE meta SET tags=json_remove(tags, '$['||tag.key||']')
		FROM json_each(meta.tags) as tag
		WHERE tnId=$tnId AND fileId=$fileId AND tag.value=$tag
		RETURNING tags`,
		{ $tnId: tnId, $fileId: fileId, $tag: tag })
	return JSON.parse(res?.tags || '[]')
}

export async function setTagPerm(tnId: number, tag: string, perm: 'read' | 'write' | 'admin', userId: number) {
	await db.run(`UPDATE tags SET perm${perm}=
		CASE WHEN perm${perm} IS NULL THEN '#'||$userId||'#' ELSE perm${perm}$userId||'#' END
		WHERE tnId=$tnId AND tag=$tag`,
		{ $tnId: tnId, $tag: tag, $userId: userId })
}

// vim: ts=4
