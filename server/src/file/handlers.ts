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

const TAG_FORBIDDEN_CHARS = [' ', ',', '#', '\t', '\n']

//import { Router } from './index.js'
import path from 'path'
import fs from 'fs/promises'
import crypto from 'crypto'
import { HttpError} from 'koa'
import rawBody from 'raw-body'
import { fileTypeFromBuffer } from 'file-type'
import { nanoid } from 'nanoid'
import * as T from '@symbion/runtype'

import * as Settings from '../settings.js'
import { Context } from '../index.js'
import { validate, validateQS } from '../utils.js'
//import { getStoreFileName, writeStore, readStore, checkStore, init as initDocStore } from '../doc-store.js'
import { storeImage } from '../image.js'
import { metaAdapter, blobAdapter, crdtAdapter } from '../adapters.js'
import { tListFilesOptions } from '../meta-adapter.js'

//////////////////
// API handlers //
//////////////////
export async function listFiles(ctx: Context) {
	const q = validateQS(ctx, tListFilesOptions)
	const tnId = ctx.state.tnId
	console.log('listFiles', ctx.state.auth)
	//if (!ctx.state.user?.u || (ctx.state.user?.u != ctx.state.user?.t)) ctx.throw(403)
	//if (!ctx.state.user?.u || !ctx.state.user?.t) ctx.throw(403)

	const files = await metaAdapter.listFiles(tnId, ctx.state.auth, q)
	console.log('FILES', files.length)
	ctx.body = { files: files.map(f => ({
		...f,
		thumbnail: f.preset === 'gallery' ? `https://${ctx.hostname}/api/store/${f.fileId}/tn.jpg` : undefined,
	})) }
	console.log('auth', ctx.state.auth)
}

export async function getFileMeta(ctx: Context) {
	const { tnId } = ctx.state
	const { variantId } = ctx.params

	const fileList = await metaAdapter.listFiles(tnId, ctx.state.auth, { variantId: variantId })
	console.log('FILES', fileList.length)
	const f = fileList[0]
	ctx.body = f
}

const tCreateFileRequest = T.struct({
	contentType: T.string,
	fileName: T.string,
	tags: T.optional(T.array(T.string))
})
export async function createFile(ctx: Context) {
	if (!ctx.state.auth) ctx.throw(403)
	const p = validate(ctx, tCreateFileRequest)
	console.log('CREATE', p)
	const mediaId = nanoid()

	const createdAt = new Date()
	await metaAdapter.createFile(ctx.state.tnId, mediaId, {
		status: 'M',
		contentType: p.contentType,
		fileName: p.fileName,
		createdAt,
		tags: p.tags
	})
	ctx.body = {
		fileId: mediaId,
		fileName: p.fileName,
		contentType: p.contentType,
		createdAt,
		tags: p.tags
	}
}

const tPostFileQuery = T.struct({
	createdAt: T.optional(T.string),
	tags: T.optional(T.string)
})
export async function postFile(ctx: Context) {
	const { tnId } = ctx.state
	//console.log('Auth header', ctx.headers.authorization)
	//if (ctx.headers.authorization !== 'ByPassFIXME') ctx.throw(403)
	//const tnId = ctx.state.user.t
	const { preset, fileName } = ctx.params
	const { createdAt, tags } = validateQS(ctx, tPostFileQuery)
	console.log('POST', { preset, fileName, contentType: ctx.headers['content-type'] })

	// Store
	try {
		// Store file
		const buf = await rawBody(ctx.req, {
			length: ctx.request.headers['content-length'],
			limit: await Settings.get('upload.max') + 'mb'
		})

		const contentType = ctx.request.headers['content-type'] ?? ''
		if (['image/jpeg', 'image/png'].includes(contentType)) {
			const img = await storeImage(tnId, 'ohst', buf)
			const largestVariant = img.variants.orig || img.variants.hd || img.variants.sd || img.variants.tn
			console.log('LARGEST', largestVariant)
			
			if (largestVariant) {
				const fileId = largestVariant.hash
				await metaAdapter.createFile(tnId, fileId, {
					status: 'P',
					preset,
					contentType,
					fileName,
					createdAt: img.createdAt,
					tags: tags ? tags.split(',') : undefined,
					x: { dim: largestVariant.dim, orientation: largestVariant.orientation }
				})

				if (img.variants.orig) await metaAdapter.createFileVariant(tnId, fileId, img.variants.orig.hash, {
					variant: 'orig', format: img.variants.orig.format, size: img.variants.orig.size
				})
				if (img.variants.tn) await metaAdapter.createFileVariant(tnId, fileId, img.variants.tn.hash, {
					variant: 'tn', format: img.variants.tn.format, size: img.variants.tn.size
				})
				if (img.variants.sd) await metaAdapter.createFileVariant(tnId, fileId, img.variants.sd.hash, {
					variant: 'sd', format: img.variants.sd.format, size: img.variants.sd.size
				})
				if (img.variants.hd) await metaAdapter.createFileVariant(tnId, fileId, img.variants.hd.hash, {
					variant: 'hd', format: img.variants.hd.format, size: img.variants.hd.size
				})
				ctx.body = { fileId, attachment: img.attachment }
			}
		} else {
			/*
			if (mediaId && !await checkStore(tnId, mediaId, '')) {
				await meta.writeMeta(ctx.state.auth, mediaId, {
					status: 'P',
					preset,
					contentType: 'image/jpeg',
					fileName,
					createdAt: img.createdAt,
					tags: tags ? tags.split(',') : undefined
				})
				await writeStore(tnId, mediaId, '', buf)
			}
			ctx.body = { mediaId, attachment: img.attachment }
			*/
		}
	} catch (err) {
		console.log('ERROR', err instanceof HttpError, err)
		ctx.throw(403)
	}
}

export async function getFile(ctx: Context) {
	const { tnId } = ctx.state
	const { fileId, label } = ctx.params

	const m = await metaAdapter.readFileAuth(tnId, ctx.state.auth, fileId)
	if (!m) ctx.throw(404)

	ctx.type = m.contentType
	const variantId = label ? await metaAdapter.getFileVariant(tnId, fileId, label) : fileId
	ctx.body = await blobAdapter.readBlob(tnId, variantId)
}

const tPatchFileRequest = T.struct({
	fileName: T.optional(T.string)
})
export async function patchFile(ctx: Context) {
	const fileId = ctx.params.fileId
	const p = validate(ctx, tPatchFileRequest)
	console.log('PATCH', p)

	await metaAdapter.updateFile(ctx.state.tnId, fileId, {
		fileName: p.fileName
	})
	ctx.body = {
		fileId: fileId,
		fileName: p.fileName
	}
}

export async function deleteFile(ctx: Context) {
	const fileId = ctx.params.fileId
	console.log('DELETE', fileId)
	const file = await metaAdapter.readFile(ctx.state.tnId, fileId)
	if (!file) ctx.throw(404)

	if (file.status == 'M') {
		// Delete CRDT content
		try {
			const res = await crdtAdapter.clearDocument(fileId)
			console.log('CRDT DELETED', fileId)
		} catch (err) {
			console.log('ERROR', err)
		}
	}
	await metaAdapter.deleteFile(ctx.state.tnId, fileId)
	ctx.body = { fileId }
}

//////////
// TAGS //
//////////
const tListTagsQuery = T.struct({
	prefix: T.optional(T.string)
})
export async function listTags(ctx: Context) {
	const { prefix } = validateQS(ctx, tListTagsQuery)
	const tags = await metaAdapter.listTags(ctx.state.tnId, prefix)
	ctx.body = { tags }
}

export async function putFileTag(ctx: Context) {
	const fileId = ctx.params.fileId
	const tag = ctx.params.tag
	if (!ctx.state.user?.u || (ctx.state.user?.u != ctx.state.user?.t) || tag.includes(...TAG_FORBIDDEN_CHARS)) ctx.throw(403)
	const newTags = await metaAdapter.addTag(ctx.state.tnId, fileId, tag)
	ctx.body = { tags: newTags }
	console.log('POST', { fileId, tag, res: ctx.body })
}

export async function deleteFileTag(ctx: Context) {
	const fileId = ctx.params.fileId
	const tag = ctx.params.tag
	if (!ctx.state.user?.u || (ctx.state.user?.u != ctx.state.user?.t)) ctx.throw(403)
	const newTags = await metaAdapter.removeTag(ctx.state.tnId, fileId, tag)
	ctx.body = { tags: newTags }
	console.log('DELETE', { fileId, tag, res: ctx.body, newTags })
}

// vim: ts=4
