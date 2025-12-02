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

import { metaAdapter, blobAdapter } from '../adapters.js'
import { ProfileStatus } from '../meta-adapter.js'
import { sha256 } from '../utils.js'

// Types //
///////////
export const tProfile = T.struct({
	idTag: T.string,
	name: T.string,
	profilePic: T.optional(T.string)
})
export type Profile = T.TypeOf<typeof tProfile>

export const tProfileKeys = T.struct({
	idTag: T.string,
	name: T.string,
	type: T.optional(T.literal('community')),
	profilePic: T.optional(T.string),
	keys: T.array(
		T.struct({
			keyId: T.string,
			publicKey: T.string,
			expires: T.optional(T.number)
		})
	)
})
export type ProfileKeys = T.TypeOf<typeof tProfileKeys>

export const tFullProfile = T.struct({
	idTag: T.string,
	name: T.string,
	profilePic: T.optional(
		T.struct({
			ic: T.string,
			sd: T.string,
			hd: T.optional(T.string)
		})
	),
	coverPic: T.optional(
		T.struct({
			sd: T.string,
			hd: T.optional(T.string)
		})
	),
	x: T.optional(T.record(T.string))
})
export type FullProfile = T.TypeOf<typeof tFullProfile>

// Functions //
///////////////
export async function syncProfile(
	tnId: number,
	idTag: string,
	eTag?: string
): Promise<(T.TypeOf<typeof tProfileKeys> & { status?: ProfileStatus }) | undefined> {
	console.log(`https://cl-o.${idTag}/api/me`, eTag)
	const res = await fetch(`https://cl-o.${idTag}/api/me`, {
		headers: eTag ? { 'If-None-Match': '"' + eTag + '"' } : undefined
	})
	console.log('res', res.ok, res.status)
	if (res.status == 200) {
		const profileRes = T.decode(tProfileKeys, await res.json())
		if (T.isOk(profileRes)) {
			//console.log('PROFILE', profileRes)
			const profile = { ...profileRes.ok, status: 'A' as const }
			if (profile.profilePic) {
				const variant = await metaAdapter.readFile(tnId, profile.profilePic)
				if (!variant) {
					console.log('Syncing profilePic')
					const binRes = await fetch(
						`https://cl-o.${idTag}/api/store/${profile.profilePic}`
					)
					const buf = Buffer.from(await binRes.arrayBuffer())
					const hash = sha256(buf)
					if (hash == profile.profilePic) {
						await blobAdapter.writeBlob(tnId, profile.profilePic, '', buf)
						const contentType = binRes.headers.get('content-type')
						await metaAdapter.createFileVariant(tnId, undefined, profile.profilePic, {
							variant: 'ic',
							size: buf.length,
							format:
								contentType == 'image/jpeg'
									? 'jpg'
									: contentType == 'image/avif'
										? 'avif'
										: contentType == 'image/webp'
											? 'webp'
											: 'unkn'
						})
					} else {
						console.error('Profile pic hash mismatch', hash, profile.profilePic)
					}
				}
			}
			await metaAdapter.createProfile(
				tnId,
				profile,
				res.headers.get('ETag')?.replaceAll('"', '') || undefined
			)
			return profile
		} else {
			console.log('ERROR', profileRes.err)
		}
	} else if (res.status == 304) {
		await metaAdapter.updateProfile(tnId, idTag, { synced: true })
	} else {
		console.log('ERROR: profile fetch: ', res)
	}
}

export async function getProfile(
	tnId: number,
	idTag: string
): Promise<
	| (T.TypeOf<typeof tProfile> & {
			status?: ProfileStatus
			following?: boolean
			connected?: boolean
	  })
	| undefined
> {
	// Get local profile
	let profile = await metaAdapter.readProfile(tnId, idTag)
	console.log('Local profile', idTag, profile)
	if (profile)
		return {
			...profile,
			connected: profile.connected === true
		}

	// Download if not found
	return await syncProfile(tnId, idTag)
}

// vim: ts=4
