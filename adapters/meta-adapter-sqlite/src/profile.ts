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
import { Profile, ProfileStatus, ProfilePerm, ListProfilesOptions, UpdateProfileOptions } from '@cloudillo/server/types/meta-adapter'

import { db, ql } from './db.js'

export async function listProfiles(tnId: number, opts: ListProfilesOptions) {
	const idTag = await getIdentityTag(tnId)
	const q = `SELECT * FROM profiles WHERE tnId = $tnId AND idTag != $ownIdTag`
		+ (opts.status ? ` AND status IN (${opts.status.map(ql).join(',')})` : '')
		+ (opts.type ?
			(opts.type === 'person' ? ' AND type ISNULL' : ` AND type = ${ql(opts.type == 'community' ? 'C' : '')}`)
			: ''
		)
		+ (opts.following ? ' AND following' : '')
		+ (opts.connected === true ? ' AND connected' : opts.connected == 'R' ? ' AND NOT connected' : '')
		+ (opts.q ? ` AND (idTag LIKE ${ql(opts.q + '%')} OR name LIKE ${ql(opts.q + '%')})` : '')
		+ (opts.idTag ? ` AND idTag = ${ql(opts.idTag)}` : '')
	console.log('listProfiles q:', q, tnId)
	const rows = await db.all<{
		idTag: string,
		name: string,
		profilePic?: string,
		status?: ProfileStatus,
		perm?: ProfilePerm,
		type?: 'C',

		following?: boolean,
		connected?: boolean
	}>(q, { $tnId: tnId, $ownIdTag: idTag })

	const res: Profile[] = rows.map(row => ({
		idTag: row.idTag,
		name: row.name,
		profilePic: row.profilePic || undefined,
		status: row.status,
		perm: row.perm || undefined,
		type: row.type == 'C' ? 'community' : 'person',
		following: row.following != null ? !!row.following : undefined,
		connected: row.connected == null ? undefined
			: !row.connected ? 'R'
			: !!row.connected
	}))

	return res
}

export async function readProfile(tnId: number, idTag: string) {
	console.log('readProfile', tnId, idTag)
	const profile = await db.get<{ idTag: string, type: 'U' | 'C', name: string, profilePic?: string, status?: ProfileStatus, perm?: ProfilePerm, following?: boolean, connected?: boolean | 'R' } | undefined>(
		`SELECT idTag, type, name, profilePic, status, perm, following, connected FROM profiles
		WHERE tnId = $tnId AND idTag = $idTag`,
		{ $tnId: tnId, $idTag: idTag }
	)
	console.log('readProfile', { idTag: profile?.idTag, status: profile?.status })
	if (!profile) return

	const ret: Profile = {
		idTag: profile.idTag,
		name: profile.name,
		profilePic: profile.profilePic || undefined,
		status: profile.status,
		perm: profile.perm || undefined,
		type: profile.type == 'C' ? 'community' : 'person',
		following: profile.following !== null ? !!profile.following : undefined,
		connected: profile.connected === null ? undefined
			: !profile.connected ? 'R'
			: !!profile.connected
	}
	return ret
}

export async function getIdentityTag(tnId: number) {
	const res = await db.get<{ idTag: string }>("SELECT idTag FROM tenants WHERE tnId = $tnId", { $tnId: tnId })
	return res?.idTag
}

export async function createProfile(tnId: number, profile: Omit<Profile, 'id'>, eTag?: string | undefined) {
	await db.run(`INSERT INTO profiles (tnId, idTag, name, type, profilePic, eTag, status)
		VALUES ($tnId, $idTag, $name, $type, $profilePic, $eTag, $status)
		ON CONFLICT (tnId, idTag) DO UPDATE SET
			name = $name,
			type = $type,
			profilePic = $profilePic,
			eTag = $eTag
	`, {
		$tnId: tnId,
		$idTag: profile.idTag,
		$name: profile.name,
		$type: profile.type == 'community' ? 'C' : null,
		$profilePic: profile.profilePic,
		$eTag: eTag ? eTag.replace('"', '') : undefined,
		$status: profile.status
	})
}

export async function updateProfile(tnId: number, idTag: string, opts: UpdateProfileOptions) {
	const update: string[] = []

	if (opts.status !== undefined) update.push(`status = ${ql(opts.status)}`)
	if (opts.perm !== undefined) update.push(`perm = ${ql(opts.perm)}`)
	if (opts.synced) update.push('syncedAt = unixepoch()')
	if (opts.following !== undefined) update.push(`following = ${ql(opts.following)}`)
	if (opts.connected !== undefined) update.push(`connected = ${ql(opts.connected == 'R' ? false : opts.connected)}`)

	if (update.length) {
		const res = await db.run(`UPDATE profiles SET
			${update.join(', ')}
			WHERE tnId = $tnId AND idTag = $idTag
		`, { $tnId: tnId, $idTag: idTag })
		console.log('updateProfile', update, { tnId, idTag }, res)
	}
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

export async function processProfileRefresh(callback: (tnId: number, idTag: string, eTag: string | undefined) => Promise<boolean>) {
	let processed = 0

	const profiles = await db.all<{ tnId: number, idTag: string, eTag: string | undefined, name: string }>(
		`SELECT p.tnId, p.idTag, p.eTag, p.name, p.type, p.profilePic, p.status FROM profiles p
			WHERE coalesce(p.syncedAt, 0)<=unixepoch()-$timeDiff ORDER BY p.syncedAt LIMIT 100`,
		{ $timeDiff: 60 * 60 * 24 * 1 /* 1 day */ }
	)
	for (const profile of profiles) {
		console.log('Syncing profile', profile.tnId, profile.idTag)
		try {
			const val = await callback(profile.tnId, profile.idTag, profile.eTag)
			if (val) {
				await db.run('UPDATE profiles SET syncedAt=unixepoch() WHERE tnId = $tnId AND idTag = $idTag', {
					$tnId: profile.tnId,
					$idTag: profile.idTag
				})
				processed++
			}
		} catch (err) {
			console.log('ERROR', err)
		}
	}
	return processed
}

// vim: ts=4
