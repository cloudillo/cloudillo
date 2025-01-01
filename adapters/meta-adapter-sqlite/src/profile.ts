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
import { Profile, ProfileStatus, ListProfilesOptions, UpdateProfileOptions } from '@cloudillo/server/types/meta-adapter'

import { db, ql } from './db.js'

export async function listProfiles(tnId: number, opts: ListProfilesOptions) {
	const q = `SELECT * FROM profiles WHERE tnId = $tnId`
		+ (opts.status ? ` AND status IN (${opts.status.map(ql).join(',')})` : '')
		+ (opts.type ?
			(opts.type === 'U' ? ' AND type ISNULL' : ` AND type = ${ql(opts.type)}`)
			: ''
		)
		+ (opts.q ? ` AND (idTag LIKE ${ql(opts.q + '%')} OR name LIKE ${ql(opts.q + '%')})` : '')
		+ (opts.idTag ? ` AND idTag = ${ql(opts.idTag)}` : '')
	console.log('listProfiles q:', q, tnId)
	const rows = await db.all<{ identId: number, idTag: string, name: string, profilePic?: string, status?: 'B' | 'F' | 'C' | 'T' }>(q, { $tnId: tnId })

	const res: Profile[] = rows.map(row => ({
		id: row.identId,
		idTag: row.idTag,
		name: row.name,
		profilePic: row.profilePic,
		status: row.status
	}))

	return res
}

export async function readProfile(tnId: number, idTag: string) {
	console.log('readProfile', tnId, idTag)
	const profile = await db.get<{ idTag: string, type: 'U' | 'C', name: string, profilePic?: string, status?: ProfileStatus }>(
		`SELECT idTag, type, name, profilePic, status FROM profiles
		WHERE tnId = $tnId AND idTag = $idTag`,
		{ $tnId: tnId, $idTag: idTag }
	)
	return profile
}

export async function getIdentityTag(tnId: number) {
	const res = await db.get<{ idTag: string }>("SELECT idTag FROM tenants WHERE tnId = $tnId", { $tnId: tnId })
	return res?.idTag
}

export async function createProfile(tnId: number, profile: Omit<Profile, 'id'>) {
	await db.run('INSERT INTO profiles (tnId, idTag, name, profilePic, status) VALUES ($tnId, $idTag, $name, $profilePic, $status)', {
		$tnId: tnId,
		$idTag: profile.idTag,
		$idName: profile.name,
		$profilePic: profile.profilePic,
		$status: profile.status
	})
}

export async function updateProfile(tnId: number, idTag: string, opts: UpdateProfileOptions) {
	await db.run('UPDATE profiles SET status = $status WHERE tnId = $tnId AND idTag = $idTag', {
		$tnId: tnId,
		$idTag: idTag,
		$status: opts.status
	})
}

export async function getProfilePublicKey(tnId: number, idTag: string, keyId: string) {
	const key = await db.get<{ publicKey: string, expires: number }>(
		"SELECT kc.publicKey, kc.expire as expires FROM key_cache kc WHERE idTag = $idTag AND keyId = $keyId",
		{ $idTag: idTag, $keyId: keyId }
	)
	return key
}

export async function addProfilePublicKey(tnId: number, idTag: string, key: { keyId: string, publicKey: string, expires?: number }) {
	await db.run('INSERT OR REPLACE INTO key_cache (idTag, keyId, publicKey) VALUES ($idTag, $keyId, $publicKey)', {
		$idTag: idTag,
		$keyId: key.keyId,
		$publicKey: key.publicKey,
		$expire: key.expires
	})
}

// vim: ts=4
