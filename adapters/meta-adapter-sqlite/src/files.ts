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
import { Auth, File, ListFilesOptions, CreateFileOptions, CreateFileVariantOptions, UpdateFileOptions } from '@cloudillo/server/types/meta-adapter'

import { db, ql } from './db.js'

/////////////////////////
// Permission handling //
/////////////////////////
export async function getPermCond(tnId: number, auth: Auth | undefined, perm: 'r' | 'w' | 'a') {
	// Owner always has permission
	//if (auth.tnId === auth.userId) return ''

	// FIXME: All authorized users have read permission for now
	if (perm == 'r') return ''

	let cond: string
	switch (perm) {
		/*
		case 'r':
			cond = "(instr(perm.value, 'r') OR instr(perm.value, 'w') OR instr(perm.value, 'a'))"
			break
		*/
		case 'w':
			cond = "(instr(perm.value, 'w') OR instr(perm.value, 'a'))"
			break
		case 'a':
			cond = "instr(perm.value, 'a')"
			break
	}

	const userRoles = (auth?.roles.length || 0) > 0 ? ', ' + auth?.roles.join(', ') : ''
	const tags = await db.all<{ tag: string }>(`SELECT DISTINCT tag FROM tags, json_each(tags.perms) as perm
		WHERE tnId=$tnId AND perm.key IN ('@' || $userId${userRoles})
		AND ${cond}
	`, { $tnId: tnId, $userTag: auth?.idTag })
	if (tags.length === 0) return ' AND false'

	return ' AND (' + tags.map(t => `tag.value = ${ql(t.tag)}`).join(' OR ') + ')'
	//return ' AND (' + tags.map(t => `instr(tags, ${ql('#' + t.tag +'#')})`).join(' OR ') + ')'
}

function mimeType(format: string) {
	switch (format) {
		case 'avif':
			return 'image/avif'
		case 'webp':
			return 'image/webp'
		case 'jpeg':
			return 'image/jpeg'
		case 'png':
			return 'image/png'
		default:
			return 'application/octet-stream'
	}
}

//////////////
// Handlers //
//////////////
export async function listFiles(tnId: number, auth: Auth | undefined, opts: ListFilesOptions): Promise<(File & { variantId?: string, variant?: string, variantFormat?: string })[]> {
	const permCond = await getPermCond(tnId, auth, 'r')
	console.log('PERM', permCond)

	let statuses = "'M','I','P'"
	switch (opts.filter) {
		case 'mut':
			statuses = "'M'"; break
		case 'imm':
			statuses = "'P','I'"; break
	}

	const q = `SELECT DISTINCT f.*, ${opts.variant || opts.variantId ? 'fv.variantId, fv.format as variantFormat, fv.variant,' : ''}
		p.name as ownerName, p.profilePic as ownerProfilePic,
		t.idTag as tenantTag, t.name as tenantName, t.profilePic as tenantProfilePic
		FROM files f
		LEFT JOIN profiles p ON p.tnId=f.tnId AND p.idTag=f.ownerTag
		LEFT JOIN tenants t ON t.tnId=f.tnId
		LEFT JOIN json_each(f.tags) as tag `
		+ (opts.variant ? `LEFT JOIN file_variants fv ON fv.tnId=f.tnId AND fv.fileId=f.fileId AND fv.variant=${ql(opts.variant)} `
			: opts.variantId ? `LEFT JOIN file_variants fv ON fv.tnId=f.tnId AND fv.fileId=f.fileId AND fv.variantId=${ql(opts.variantId)} `
			: ''
		)
		+ "WHERE f.tnId = $tnId"
		+ (opts.fileId ? " AND f.fileId = $fileId" : '')
		+ (statuses ? " AND f.status IN (" + statuses + ")" : '')
		+ (opts.tag !== undefined ? ` AND ','||f.tags||',' LIKE ${ql('#' + opts.tag + '#')}` : '')
		+ (opts.preset !== undefined ? ` AND preset=${ql(opts.preset)}` : '')
		//+ (!opts.includeVariants ? " AND f.origId IS NULL" : '')
		+ permCond
		+ ` ORDER BY createdAt DESC LIMIT ${opts._limit || 100}`
	console.log(q)
	const rows = await db.all<{
		fileId: string
		tenantTag: string
		ownerTag?: string
		ownerName: string
		ownerProfilePic?: string
		tenantName: string
		tenantProfilePic?: string
		preset?: string
		contentType: string
		fileName: string
		status: 'M' | 'I' | 'P' | 'D'
		createdAt: Date
		tags?: string
		variantId?: string
		variant?: string
		variantFormat?: string
		x?: string
	}>(q, { $tnId: tnId })
	return rows.map(row => ({
		fileId: row.fileId,
		owner: {
			idTag: row.ownerTag || row.tenantTag,
			name: row.ownerName || row.tenantName,
			profilePic: row.ownerProfilePic || (row.tenantProfilePic ? JSON.parse(row.tenantProfilePic)?.ic : undefined),
		},
		preset: row.preset,
		contentType: row.contentType,
		fileName: row.fileName,
		status: row.status,
		createdAt: row.createdAt,
		tags: JSON.parse(row.tags || '[]'),
		variantId: row.variantId,
		variant: row.variant,
		variantFormat: row.variantFormat,
		x: row.x ? JSON.parse(row.x) : undefined
	}))
}

export async function getFileVariant(tnId: number, fileId: string, variant: string) {
	const { variantId } = await db.get<{ variantId?: string }>(`SELECT variantId FROM file_variants
		WHERE tnId = $tnId AND fileId = $fileId AND variant = $variant`,
		{ $tnId: tnId, $fileId: fileId, $variant: variant }
	)
	return variantId
}

export async function readFile(tnId: number, variantId: string) {
	if (variantId.length < 30) { // FIXME
		const row = await db.get<{
			fileId: string,
			variantId: string,
			idTag: string,
			ownerTag?: string,
			preset?: string,
			contentType: string,
			fileName: string,
			status: 'M' | 'I' | 'P' | 'D',
			createdAt: Date,
			tags?: string
			x?: string
		}>(
			`SELECT f.* FROM files f
				LEFT JOIN json_each(f.tags) as tag
				WHERE f.tnId = $tnId AND f.fileId = $fileId
			`, { $tnId: tnId, $fileId: variantId })
		return !row ? undefined : {
			fileId: row.fileId,
			ownerTag: row.ownerTag || row.idTag,
			preset: row.preset,
			contentType: row.contentType,
			fileName: row.fileName,
			status: row.status,
			createdAt: row.createdAt,
			tags: JSON.parse(row.tags || '[]'),
			//tags: row.tags?.split('#').filter(t => t),
			x: row.x ? JSON.parse(row.x) : undefined
		}
	} else {
		const row = await db.get<{
			fileId: string,
			variantId: string,
			idTag: string,
			ownerTag?: string,
			preset?: string,
			contentType: string,
			fileName: string,
			status: 'M' | 'I' | 'P' | 'D',
			createdAt: Date,
			tags?: string
			x?: string
		}>(
			`SELECT f.*, fv.variantId FROM file_variants fv
				JOIN files f ON f.tnId=fv.tnId AND f.fileId=fv.fileId
				LEFT JOIN json_each(f.tags) as tag
				WHERE fv.tnId = $tnId AND fv.variantId = $variantId
			`, { $tnId: tnId, $variantId: variantId })
		return !row ? undefined : {
			fileId: row.fileId,
			variantId: row.variantId,
			ownerTag: row.ownerTag || row.idTag,
			preset: row.preset,
			contentType: row.contentType,
			fileName: row.fileName,
			status: row.status,
			createdAt: row.createdAt,
			tags: JSON.parse(row.tags || '[]'),
			x: row.x ? JSON.parse(row.x) : undefined
		}
	}
}

export async function readFileAuth(tnId: number, auth: Auth | undefined, variantId: string) {
	const permCond = await getPermCond(tnId, auth, 'r')
	console.log('readFileAuth', auth, permCond)

	if (variantId.length < 30) { // FIXME
		const row = await db.get<{
			fileId: string,
			variantId: string,
			idTag: string,
			ownerTag?: string,
			preset?: string,
			contentType: string,
			fileName: string,
			status: 'M' | 'I' | 'P' | 'D',
			createdAt: Date,
			tags?: string
			x?: string
		}>(
			`SELECT f.* FROM files f
				LEFT JOIN json_each(f.tags) as tag
				WHERE f.tnId = $tnId AND f.fileId = $fileId
				${permCond}
			`, { $tnId: tnId, $fileId: variantId })
		return !row ? undefined : {
			fileId: row.fileId,
			ownerTag: row.ownerTag || row.idTag,
			preset: row.preset,
			contentType: row.contentType,
			fileName: row.fileName,
			status: row.status,
			createdAt: row.createdAt,
			tags: JSON.parse(row.tags || '[]'),
			//tags: row.tags?.split('#').filter(t => t),
			x: row.x ? JSON.parse(row.x) : undefined
		}
	} else {
		const row = await db.get<{
			fileId: string,
			variantId: string,
			idTag: string,
			ownerTag?: string,
			preset?: string,
			contentType: string,
			fileName: string,
			status: 'M' | 'I' | 'P' | 'D',
			createdAt: Date,
			tags?: string
			x?: string
		}>(
			`SELECT f.*, fv.variantId FROM file_variants fv
				LEFT JOIN files f ON f.tnId=fv.tnId AND f.fileId=fv.fileId
				LEFT JOIN json_each(f.tags) as tag
				WHERE fv.tnId = $tnId AND fv.variantId = $variantId
				${permCond}
			`, { $tnId: tnId, $variantId: variantId })
		return !row ? undefined : {
			fileId: row.fileId,
			variantId: row.variantId,
			ownerTag: row.ownerTag || row.idTag,
			preset: row.preset,
			contentType: row.contentType,
			fileName: row.fileName,
			status: row.status,
			createdAt: row.createdAt,
			tags: JSON.parse(row.tags || '[]'),
			//tags: row.tags?.split('#').filter(t => t),
			x: row.x ? JSON.parse(row.x) : undefined
		}
	}
}

export async function createFile(tnId: number, fileId: string, { status, ownerTag, preset, contentType, fileName, createdAt, tags, x }: CreateFileOptions) {
	console.log('WRITE', tnId, fileId, preset, contentType, tags)
		const res = await db.run('INSERT OR IGNORE INTO files (tnId, fileId, status, ownerTag, preset, contentType, fileName, createdAt, tags, x) '
			+ 'VALUES ($tnId, $fileId, $status, $ownerTag, $preset, $contentType, $fileName, $createdAt, $tags, $x)', {
			$tnId: tnId,
			$fileId: fileId,
			$status: status,
			$ownerTag: ownerTag,
			$preset: preset,
			$contentType: contentType,
			$fileName: fileName,
			$createdAt: (createdAt || new Date()).toISOString(),
			$tags: tags?.join(','),
			$x: x == null ? null : JSON.stringify(x)
		})
	console.log('INSERT', res)
	//}
}

export async function createFileVariant(tnId: number, fileId: string | undefined, variantId: string, { variant, format, size }: CreateFileVariantOptions) {
	const res = await db.run('INSERT OR IGNORE INTO file_variants (tnId, fileId, variant, variantId, format, size) '
		+ 'VALUES ($tnId, $fileId, $variant, $variantId, $format, $size)', {
		$tnId: tnId,
		$fileId: fileId,
		$variant: variant,
		$variantId: variantId,
		$format: format,
		$size: size
	})
	console.log('INSERT', res)
}

export async function updateFile(tnId: number, fileId: string, { fileName, createdAt, meta, status }: UpdateFileOptions) {
	console.log('UPDATE', tnId, fileId, fileName)
	const actMeta: Record<string, unknown> = JSON.parse((await db.get<{ x?: string }>('SELECT x FROM files WHERE tnId = ? AND fileId = ?', [tnId, fileId])).x || '{}')
	console.log('    META', actMeta, meta, { ...actMeta, ...meta })

	const res = await db.run('UPDATE files SET fileName=coalesce($fileName, fileName), createdAt=coalesce($createdAt, createdAt), status=coalesce($status, status), x=$x WHERE tnId=$tnId AND fileId=$fileId', {
		$fileName: fileName,
		$createdAt: createdAt,
		$status: status,
		$x: JSON.stringify({ ...actMeta, ...meta }),
		$tnId: tnId,
		$fileId: fileId
	})
	console.log('UPDATE', res)
}

export async function deleteFile(tnId: number, fileId: string) {
	console.log('DELETE FILE', tnId, fileId)
	const res = await db.run("UPDATE files SET status='D' WHERE tnId=$tnId AND fileId=$fileId", { $tnId: tnId, $fileId: fileId })
}

export async function processPendingFilesPrepare(callback: (tnId: number, file: File) => Promise<boolean>) {
	let processed = 0

	const rows = await db.all<{
		tnId: number
		fileId: string
		idTag: string
		ownerTag?: string
		preset?: string
		contentType: string
		fileName: string
		status: 'M' | 'I' | 'P' | 'D'
		createdAt: Date
		tags?: string
		x?: string
	}>("SELECT tnId, fileId, preset FROM files WHERE status IN ('P') ORDER BY createdAt DESC LIMIT 100")

	for (const row of rows) {
		if (await callback(row.tnId, {
			fileId: row.fileId,
			owner: {
				idTag: row.ownerTag || row.idTag,
			},
			preset: row.preset,
			contentType: row.contentType,
			fileName: row.fileName,
			status: row.status,
			createdAt: row.createdAt,
			//tags: row.tags?.split('#').filter(t => t),
			tags: JSON.parse(row.tags || '[]'),
			x: row.x ? JSON.parse(row.x) : undefined
		})) {
			processed++
		}
	}
	return processed
}

// vim: ts=4
