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

import { HttpError} from 'koa'
import rawBody from 'raw-body'
import * as T from '@symbion/runtype'

import * as Settings from '../settings.js'
import { storeImage } from '../image.js'
import { Context } from '../index.js'
import { validate, validateQS } from '../utils.js'
import { getAuthProfile, getAuthProfileFull } from '../auth.js'
//import * as meta from '../meta-store/index.js'
import { metaAdapter } from '../adapters.js'

//////////////////
// API handlers //
//////////////////

/* Own Profile */
export const tProfile = T.struct({
	idTag: T.string,
	name: T.string,
	profilePic: T.optional(T.string)
})
export type Profile = T.TypeOf<typeof tProfile>

export const tProfileKeys = T.struct({
	idTag: T.string,
	name: T.string,
	profilePic: T.optional(T.string),
	coverPic: T.optional(T.string),
	keys: T.array(T.struct({
		keyId: T.string,
		publicKey: T.string,
		expires: T.optional(T.date)
	}))
})
export type ProfileKeys = T.TypeOf<typeof tProfileKeys>

export const tFullProfile = T.struct({
	idTag: T.string,
	name: T.string,
	profilePic: T.optional(T.struct({
		ic: T.string,
		sd: T.string,
		hd: T.optional(T.string)
	})),
	coverPic: T.optional(T.struct({
		sd: T.string,
		hd: T.optional(T.string)
	})),
	x: T.optional(T.record(T.string))
})
export type FullProfile = T.TypeOf<typeof tFullProfile>

export async function getOwnProfile(ctx: Context) {
	const profile = await metaAdapter.readTenant(ctx.state.tnId)
	console.log('PROFILE', ctx.state.tenantTag, profile)

	if (!profile) return ctx.throw(404)

	const ret: Profile = {
		idTag: profile.idTag,
		name: profile.name,
		profilePic: profile.profilePic?.ic,
	}
	ctx.body = ret
	console.log('BODY', ctx.body)
}

export async function getOwnProfileKeys(ctx: Context) {
	const { tnId, tenantTag } = ctx.state
	const authProfile = await getAuthProfileFull(tenantTag)
	const profile = await metaAdapter.readTenant(tnId)
	console.log('PROFILE', tenantTag, authProfile)

	ctx.body = {
		...profile,
		...authProfile
	}
}

export async function getOwnProfileFull(ctx: Context) {
	const profile = await metaAdapter.readTenant(ctx.state.tnId)
	console.log('PROFILE', ctx.state.tenantTag, profile)

	ctx.body = {
		...profile
	}
}

export const tProfilePatch = T.struct({
	name: T.optional(T.string),
	x: T.optional(T.struct({
		category: T.nullable(T.string),
		intro: T.nullable(T.string)
	}))
})

export async function patchOwnProfile(ctx: Context) {
	const { tnId } = ctx.state
	if (!ctx.state.auth) ctx.throw(403)
	const profilePatch = validate(ctx, tProfilePatch)
	//console.log('PATCH PROFILE', tnId, profilePatch)

	const profile = await metaAdapter.updateTenant(tnId, profilePatch)
	console.log('PATCH PROFILE', tnId, profilePatch, profile)
	ctx.body = {
		profile
	}
}

export async function putOwnProfileImage(ctx: Context) {
	const { tnId } = ctx.state
	console.log('PUT PROFILE IMAGE', tnId, ctx.state.user)
	if (!ctx.state.auth) ctx.throw(403)

	console.log('PROFILE IMAGE PUT', { contentType: ctx.headers['content-type'] })

	// Store
	try {
		// Store file
		const buf = await rawBody(ctx.req, {
			length: ctx.request.headers['content-length'],
			limit: await Settings.get('upload.max') + 'mb'
		})

		const contentType = ctx.request.headers['content-type'] ?? ''
		if (['image/jpeg', 'image/png'].includes(contentType)) {
			const img = await storeImage(tnId, 'ohsti', buf)
			const largestVariant = img.variants.orig || img.variants.hd || img.variants.sd || img.variants.tn
			console.log('LARGEST', largestVariant)
			if (!img.variants.ic?.hash) ctx.throw(400)
			
			if (largestVariant) {
				const fileId = largestVariant.hash
				await metaAdapter.createFile(tnId, fileId, {
					status: 'P',
					preset: 'profile',
					contentType,
					fileName: 'profile',
					createdAt: img.createdAt,
					x: { dim: largestVariant.dim, orientation: largestVariant.orientation }
				})

				if (img.variants.orig) await metaAdapter.createFileVariant(tnId, fileId, img.variants.orig.hash, {
					variant: 'orig', format: img.variants.orig.format, size: img.variants.orig.size
				})
				if (img.variants.hd) await metaAdapter.createFileVariant(tnId, fileId, img.variants.hd.hash, {
					variant: 'hd', format: img.variants.hd.format, size: img.variants.hd.size
				})
				if (img.variants.sd) await metaAdapter.createFileVariant(tnId, fileId, img.variants.sd.hash, {
					variant: 'sd', format: img.variants.sd.format, size: img.variants.sd.size
				})
				if (img.variants.tn) await metaAdapter.createFileVariant(tnId, fileId, img.variants.tn.hash, {
					variant: 'tn', format: img.variants.tn.format, size: img.variants.tn.size
				})
				if (img.variants.ic) await metaAdapter.createFileVariant(tnId, fileId, img.variants.ic.hash, {
					variant: 'ic', format: img.variants.ic.format, size: img.variants.ic.size
				})
				const ret = {
					hd: img.variants.hd?.hash,
					sd: img.variants.sd?.hash,
					tn: img.variants.tn?.hash,
					ic: img.variants.ic?.hash
				}
				await metaAdapter.updateTenant(tnId, { profilePic: ret })
				ctx.body = ret
			}
		} else {
			ctx.throw(400)
		}
	} catch (err) {
		console.log('ERROR', err instanceof HttpError, err)
		ctx.throw(403)
	}
}

export async function putOwnCoverImage(ctx: Context) {
	const { tnId } = ctx.state
	console.log('PUT COVER IMAGE', tnId, ctx.state.user)
	if (!ctx.state.user) ctx.throw(403)

	// Store
	try {
		// Store file
		const buf = await rawBody(ctx.req, {
			length: ctx.request.headers['content-length'],
			limit: await Settings.get('upload.max') + 'mb'
		})

		const contentType = ctx.request.headers['content-type'] ?? ''
		if (['image/jpeg', 'image/png'].includes(contentType)) {
			const img = await storeImage(tnId, 'hs', buf)
			const largestVariant = img.variants.hd || img.variants.sd
			console.log('LARGEST', largestVariant)
			if (!img.variants.sd?.hash) ctx.throw(400)
			
			if (largestVariant) {
				const fileId = largestVariant.hash
				await metaAdapter.createFile(tnId, fileId, {
					status: 'P',
					preset: 'cover',
					contentType,
					fileName: 'cover',
					createdAt: img.createdAt,
					x: { dim: largestVariant.dim, orientation: largestVariant.orientation }
				})

				if (img.variants.hd) await metaAdapter.createFileVariant(tnId, fileId, img.variants.hd.hash, {
					variant: 'hd', format: img.variants.hd.format, size: img.variants.hd.size
				})
				if (img.variants.sd) await metaAdapter.createFileVariant(tnId, fileId, img.variants.sd.hash, {
					variant: 'sd', format: img.variants.sd.format, size: img.variants.sd.size
				})
				const ret = {
					hd: img.variants.hd?.hash,
					sd: img.variants.sd?.hash,
				}
				await metaAdapter.updateTenant(tnId, { coverPic: ret })
				ctx.body = ret
			}
		} else {
			ctx.throw(400)
		}
	} catch (err) {
		console.log('ERROR', err instanceof HttpError, err)
		ctx.throw(403)
	}
}

/* Connected Profiles */
const tListProfilesQuery = T.struct({
	idTag: T.optional(T.string),
	type: T.optional(T.literal('U', 'C')),
	status: T.optional(T.array(T.literal('B', 'F', 'C', 'T'))),
	q: T.optional(T.string)
})
export async function listProfiles(ctx: Context) {
	if (!ctx.state.auth) ctx.throw(403)
	const filt = validateQS(ctx, tListProfilesQuery)
	console.log('GET profiles', filt)

	const profiles = await metaAdapter.listProfiles(ctx.state.tnId, filt)
	ctx.body = { profiles }
}

export async function getProfile(ctx: Context) {
	if (ctx.state.auth) ctx.throw(403)
	const idTag = ctx.params.idTag
	const profile = await metaAdapter.readProfile(ctx.state.tnId, idTag)
	ctx.body = profile
}

const tPatchProfile = T.struct({
	status: T.optional(T.literal('B', 'F', 'C', 'T'))
})

export async function patchProfile(ctx: Context) {
	if (!ctx.state.auth) ctx.throw(403)
	const p = validate(ctx, tPatchProfile)
	const idTag = ctx.params.idTag

	await metaAdapter.updateProfile(ctx.state.tnId, idTag, {
		status: p.status
	})
	ctx.body = {}
}

// vim: ts=4
