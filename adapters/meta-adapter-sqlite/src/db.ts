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

import fs from 'fs/promises'
import path from 'path'
import sqlite from 'sqlite3'
import { AsyncDatabase } from 'promised-sqlite3'

import * as T from '@symbion/runtype'

import { MetaAdapter } from '@cloudillo/server/types/meta-adapter'

export let db: AsyncDatabase

export function ql(v: unknown): string {
	return v === null || v === undefined ? 'NULL'
		: v === true ? 'true'
		: v === false ? 'false'
		: Array.isArray(v) ? v.map( v => ql(v) ).join(', ') //ql('' + v).replace(/^'(.*)'$/, (match, p1) => `'{${p1}}'`)
		: typeof v == 'object' ? ql(JSON.stringify(v))
		: "'" + ('' + v).replace(/'/g, "''") + "'"
}

export function cleanRes(res: unknown): unknown {
	if (Array.isArray(res)) {
		for (let i = 0; i < res.length; i++) {
			if (res[i] === null) {
				delete res[i]
			} else cleanRes(res[i])
		}
	} else if (typeof res == 'object') {
		for (const k in res) {
			if ((res as Record<string, unknown>)[k] === null) {
				delete (res as Record<string, unknown>)[k]
			} else cleanRes((res as Record<string, unknown>)[k])
		}
	} else {
		return res === null ? undefined : res
	}
	return res
}

//export async function update<T extends Record<string, unknown>>(table: string, keys: (keyof T & string)[], data: T, returning?: string[]): Promise<T | undefined> {
export async function update<R extends {} = any, T extends {} = any>(table: string, keys: (keyof T & string)[], data: T, returning?: string | string[]): Promise<R | undefined> {
	const flds = Object.keys(data).filter(f => !keys.includes(f as keyof T & string) && data[f as keyof T] !== undefined)

	const query = `UPDATE ${table} SET `
		+ flds.map(f => f + '=' + ql(data[f as keyof T])).join(', ')
		+ ' WHERE '
		+ keys.map(f => f + (data[f] === null ? 'ISNULL' : '=' + ql(data[f]))).join(' AND ')
		+ (returning?.length
			? ` RETURNING ${Array.isArray(returning) ? returning.map(f => f).join(', ') : returning}`
			: ''
	)
	console.log('Query', query)
	return db.get<R>(query)
}

export async function init({ dir, sqliteBusyTimeout }: { dir: string, sqliteBusyTimeout?: number }) {
	sqlite.verbose()
	await fs.mkdir(dir, { recursive: true })
	console.log('INIT MetaAdapter:', path.join(dir, 'meta.db'))
	db = await AsyncDatabase.open(path.join(dir, 'meta.db'))
	db.inner.configure('busyTimeout', sqliteBusyTimeout ?? 300)

	/***********/
	/* Init DB */
	/***********/

	// Tenants //
	/////////////
	await db.run(`CREATE TABLE IF NOT EXISTS tenants (
		tnId integer NOT NULL,
		idTag text NOT NULL,
		name text,
		profilePic json,
		coverPic json,
		x json,
		createdAt datetime DEFAULT current_timestamp,
		PRIMARY KEY(tnId)
	)`)
	// profileData:
	//		coverPic text,
	//		intro text,
	//		-- contact
	//		phone text,
	//		-- address
	//		country text,
	//		postCode text,
	//		city text,
	//		address text,

	await db.run(`CREATE TABLE IF NOT EXISTS tenant_data (
		tnId integer NOT NULL,
		name text NOT NULL,
		value text,
		PRIMARY KEY(tnId, name)
	)`)
		
	await db.run(`CREATE TABLE IF NOT EXISTS settings (
		tnId integer NOT NULL,
		name text NOT NULL,
		value text,
		PRIMARY KEY(tnId, name)
	)`)
	await db.run(`CREATE TABLE IF NOT EXISTS subscriptions (
		tnId integer NOT NULL,
		subsId integer NOT NULL,
		createdAt datetime DEFAULT current_timestamp,
		subscription json,
		PRIMARY KEY(subsId)
	)`)
	await db.run('CREATE INDEX IF NOT EXISTS idx_subscriptions_tnId ON subscriptions(tnId)')

	// Profiles //
	//////////////
	await db.run(`CREATE TABLE IF NOT EXISTS profiles (
		tnId integer NOT NULL,
		identId integer NOT NULL,
		idTag text,
		name text NOT NULL,
		type char(1),				-- NULL: User, 'C': Community
		profilePic text,
		status char(1),
		following boolean,
		connected boolean,
		roles json,
		createdAt datetime DEFAULT current_timestamp,
		syncedAt datetime,
		eTag text,
		PRIMARY KEY(tnId, idTag)
	)`)
	await db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_tnId_idTag ON profiles(tnId, idTag)')

	// Metadata //
	//////////////
	/*
	await db.run('CREATE TABLE IF NOT EXISTS meta_type ('
		+ 'tnId integer, '
		+ 'fileTp integer, '
		+ 'class text, '
		+ 'contentType text, '
		+ 'descr text, '
		+ 'PRIMARY KEY(tnId, fileTp)'
	+ ')')
	*/
	/*
	INSERT INTO meta_type (tnId, fileTp, class, contentType, descr) VALUES
		-- Immutable types
		(1,   1, 'doc', NULL, 'Quillo document'),

		-- Mutable types
		(1, 101, 'image', 'image/jpeg', 'JPEG image'),
		(1, 102, 'image', 'image/png', 'PNG image')
		(1, 190, 'doc', 'application/pdf', 'PDF document');
	*/

	await db.run('CREATE TABLE IF NOT EXISTS tags ('
		+ 'tnId integer, '
		+ 'tag text, '
		+ 'perms json, '
		//+ 'permRead json, '
		//+ 'permWrite json, '
		//+ 'permAdmin json, '
		+ 'PRIMARY KEY(tnId, tag)'
	+ ')')

	// Files
	await db.run(`CREATE TABLE IF NOT EXISTS files (
		tnId integer,
		fileId text,
		fileTp integer,
		status char(1),				-- 'M' - Mutable, 'I' - Immutable,
									-- 'P' - immutable under Processing, 'D' - Deleted
		ownerTag text,
		preset text,
		contentType text,
		fileName text,
		createdAt datetime,
		modifiedAt datetime,
		tags json,
		x json,
		PRIMARY KEY(tnId, fileId)
	)`)
	await db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_files_fileId ON files(fileId, tnId)')

	await db.run(`CREATE TABLE IF NOT EXISTS file_variants (
		tnId integer,
		variantId text,
		fileId text,
		variant text,				-- 'orig' - original, 'hd' - high density, 'sd' - small density, 'tn' - thumbnail, 'ic' - icon
		format text,
		size integer,
		global boolean,				-- true: stored in global cache
		PRIMARY KEY(variantId, tnId)
	)`)
	await db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_file_variants_fileId ON file_variants(fileId, variant, tnId)')

	// Refs //
	//////////
	await db.run(`CREATE TABLE IF NOT EXISTS refs (
		tnId integer NOT NULL,
		refId text NOT NULL,
		type text NOT NULL,
		count integer,
		PRIMARY KEY(tnId, refId)
	)`)

	//console.log('SQL', await db.all("SELECT DISTINCT x FROM x, json_each(x.x) as tag WHERE tag.value = 1"))
	//console.log('SQL', await db.all("SELECT p.key, p.value FROM tags, json_each(tags.perms) as p"))
	//console.log('PERM', await getPermCond(auth, 'r'))
	//console.log('SQL', await db.all("SELECT x FROM x WHERE x->'1' = 2"))

	// Event store //
	/////////////////
	await db.run(`CREATE TABLE IF NOT EXISTS key_cache (
		idTag text,
		keyId text,
		tnId integer,
		expire integer,
		publicKey text,
		PRIMARY KEY(idTag, keyId)
	)`)

	await db.run(`CREATE TABLE IF NOT EXISTS actions (
		tnId integer NOT NULL,
		actionId text NOT NULL,
		key text NOT NULL,
		type text NOT NULL,
		subType text,
		parentId text,
		rootId text,
		idTag text NOT NULL,
		status char(1),				-- 'A' - Active, 'P' - Processing, 'D' - Deleted
		audience text,
		subject text,
		content json,
		createdAt datetime NOT NULL,
		expiresAt datetime,
		attachments json,
		comments integer,
		reactions integer,
		PRIMARY KEY(tnId, actionId)
	)`)
	await db.run('CREATE INDEX IF NOT EXISTS idx_actions_key ON actions(key, tnId)')

	await db.run(`CREATE TABLE IF NOT EXISTS action_outbox (
		actionId text NOT NULL,
		tnId integer NOT NULL,
		token text NOT NULL,
		next integer,
		PRIMARY KEY(actionId)
	)`)
	await db.run(`CREATE TABLE IF NOT EXISTS action_outbox_queue (
		actionId text NOT NULL,
		tnId integer NOT NULL,
		idTag text NOT NULL,
		next datetime,
		PRIMARY KEY(actionId, tnId, idTag)
	)`)
	await db.run(`CREATE TABLE IF NOT EXISTS action_inbox (
		actionId text NOT NULL,
		tnId integer NOT NULL,
		status char(1),
		token text NOT NULL,
		ack text,
		next integer,
		PRIMARY KEY(actionId, tnId)
	)`)
}

// vim: ts=4
