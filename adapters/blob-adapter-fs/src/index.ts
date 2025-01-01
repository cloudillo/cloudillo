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

import path from 'path'
import fs from 'fs/promises'
import { ReadStream } from 'fs'
import crypto from 'crypto'
import * as T from '@symbion/runtype'

import { BlobAdapter, BlobData } from '@cloudillo/server/types/blob-adapter'

let privateDir: string
let publicDir: string

/*********************/
/* Utility Functions */
/*********************/
export function objDir(tnId: number, mediaId: string) {
	return path.join(privateDir, '' + tnId, mediaId.substring(0, 2))
	//return path.join(config.privateDir, '' + tnId, mediaId.substring(0, 2), mediaId.substring(2, 4))
}

export function objPublicDir(tnId: number, mediaId: string) {
	return path.join(publicDir, '' + tnId, mediaId.substring(0, 2))
	//return path.join(config.publicDir, '' + tnId, mediaId.substring(0, 2), mediaId.substring(2, 4))
}

// Storage
export function getStoreFileName(tnId: number, mediaId: string, label?: string): string {
	const dir = objDir(tnId, mediaId)
	return path.join(dir, `${mediaId}${label ? '.' + label : ''}`)
}

/*****************/
/* API Functions */
/*****************/
export async function writeBlob(tnId: number, mediaId: string, label: string, data: BlobData, opts: { force?: boolean, public?: boolean } = {}) {
	const dir = objDir(tnId, mediaId)
	const fn = `${mediaId}${label ? '.' + label : ''}`
	await fs.mkdir(dir, { recursive: true })
	try {
	await fs.writeFile(path.join(dir, fn), data, { flag: opts.force ? 'w' : 'wx' })
	} catch (err) {
		if ((err as { code?: string })?.code != 'EEXIST') throw err
	}
	if (opts.public) {
		const publicDir = objPublicDir(tnId, mediaId)
		await fs.mkdir(publicDir, { recursive: true })
		try {
			await fs.link(path.join(dir, fn), path.join(publicDir, fn))
		} catch (err) {
			console.log('LINK ERROR:', err instanceof Error ? err.toString(): err)
		}
	}
}

export async function readBlob(tnId: number, mediaId: string, label?: string): Promise<Buffer> {
	const dir = objDir(tnId, mediaId)
	return await fs.readFile(path.join(dir, `${mediaId}${label ? '.' + label : ''}`))
}

export async function openBlob(tnId: number, mediaId: string, label?: string): Promise<ReadStream> {
	const dir = objDir(tnId, mediaId)
	const fd = await fs.open(path.join(dir, `${mediaId}${label ? '.' + label : ''}`))
	const stream = fd.createReadStream()
	return stream
}

export async function checkBlob(tnId: number, mediaId: string, label?: string): Promise<boolean> {
	const dir = objDir(tnId, mediaId)
	try {
		const fn = await fs.open(path.join(dir, `${mediaId}${label ? '.' + label : ''}`), 'r')
		await fn.close()
		return true
	} catch (err) {
		return false
	}
}


interface FsBlobAdapterInitOptions {
	privateDir: string
	publicDir: string
}

export async function init(opts: FsBlobAdapterInitOptions) {
	privateDir = opts.privateDir
	publicDir = opts.publicDir

	await fs.mkdir(opts.privateDir, { recursive: true })
	await fs.mkdir(opts.publicDir, { recursive: true })

	return {
		checkBlob,
		readBlob,
		openBlob,
		writeBlob
	}
}

// vim: ts=4
