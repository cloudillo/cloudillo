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

const HD_SIZE = 1440
const SD_SIZE = 720
const TN_SIZE = 240
const IC_SIZE = 60

import crypto from 'crypto'
import sharp from 'sharp'
import exif from 'exif-reader'

import { blobAdapter } from './adapters.js'

export interface ImageHash {
	orig?: string
	hd?: string
	sd?: string
	tn?: string
	ic?: string
}

export interface ImageVariant {
	hash: string
	dim: [number, number]
	size: number,
	orientation?: number
	format: string
}

export interface ImageVariants {
	orig?: ImageVariant
	hd?: ImageVariant
	sd?: ImageVariant
	tn?: ImageVariant
	ic?: ImageVariant
}

export interface StoredImage {
	createdAt: Date
	//hash: ImageHash
	variants: ImageVariants
	attachment: string
}

// sizes: o: original, h: HD (1440), s: SD (720), t: thumbnail (240)
export async function storeImage(tnId: number, sizes: string, buf: Buffer): Promise<StoredImage> {
	let t = Date.now()
	const img = sharp(buf, { failOn: 'none' })
	const imgMeta = await img.metadata()
	console.log(`Image loaded: ${Date.now() - t}ms`)
	const rot = (imgMeta.orientation || 0) >= 5
	let createdAt: Date

	if (!imgMeta.height || !imgMeta.width) throw new Error('Invalid image')

	if (imgMeta.exif) {
		const exifData = exif(imgMeta.exif)
		if (exifData?.Image?.DateTime) createdAt = exifData.Image.DateTime
		createdAt = exifData.Image?.DateTime ?? exifData.Photo?.DateTimeOriginal ?? exifData.Photo?.DateTimeDigitized ?? new Date()
		//console.log('exif', exifData)
	} else {
		createdAt = new Date()
	}

	/*
	const meta: ImageVariant = {
		orientation: imgMeta.orientation || 0,
		dim: (imgMeta.orientation || 0) >= 5 ? [imgMeta.height, imgMeta.width] : [imgMeta.width, imgMeta.height],
	}
	console.log('Image dim:', meta.dim)
	*/

	//const hash: ImageHash = {}
	const variants: ImageVariants = {}
	// Original
	if (sizes.includes('o')) {
		/*
		const origBuf = await img
			.rotate()
			.toFormat('jpeg')
			.toBuffer()
		*/
		const origBuf = buf
		//hash.orig = crypto.createHash('sha256').update(origBuf).digest('base64url')
		variants.orig = {
			hash: crypto.createHash('sha256').update(origBuf).digest('base64url'),
			dim: rot ? [imgMeta.height, imgMeta.width] : [imgMeta.width, imgMeta.height],
			size: origBuf.length,
			format: imgMeta.format || '-'
		}
		console.log(`Orig[${variants.orig.hash}] dim: ${variants.orig.dim}`)
		//console.log('hash.orig', hash.orig)
		await blobAdapter.writeBlob(tnId, variants.orig.hash, '', origBuf, { public: true }) // FIXME
	}

	// IC
	//if (sizes.includes('i') && (imgMeta.height > IC_SIZE || imgMeta.width > IC_SIZE)) {
	if (sizes.includes('i')) {
		t = Date.now()
		const icVar = await img
			.rotate()
			.resize(IC_SIZE, IC_SIZE, { fit: 'inside' })
			//.webp({ quality: 80, lossless: ['png', 'gif'].includes(imgMeta.format || '') })
			.avif({ quality: 50, bitdepth: 8, effort: 4, lossless: ['png', 'gif'].includes(imgMeta.format || '') })
			.toBuffer({ resolveWithObject: true })
		console.log(`	IC: ${Date.now() - t}ms`)
		//hash.tn = crypto.createHash('sha256').update(tnBuf).digest('base64url')
		variants.ic = {
			hash: crypto.createHash('sha256').update(icVar.data).digest('base64url'),
			dim: rot ? [imgMeta.height, imgMeta.width] : [imgMeta.width, imgMeta.height],
			size: icVar.info.size,
			//format: 'webp'
			format: 'avif'
		}
		console.log(`TN[${variants.ic.hash}] dim: ${variants.ic.dim}`)
		//console.log('hash.ic', hash.ic)
		await blobAdapter.writeBlob(tnId, variants.ic.hash, '', icVar.data, { public: true }) // FIXME
	}

	// TN
	//if (sizes.includes('t') && (imgMeta.height > TN_SIZE || imgMeta.width > TN_SIZE)) {
	if (sizes.includes('t')) {
		t = Date.now()
		const tnVar = await img
			.rotate()
			.resize(TN_SIZE, TN_SIZE, { fit: 'inside', withoutEnlargement: true })
			//.webp({ quality: 80, lossless: ['png', 'gif'].includes(imgMeta.format || '') })
			.avif({ quality: 50, bitdepth: 8, effort: 4, lossless: ['png', 'gif'].includes(imgMeta.format || '') })
			.toBuffer({ resolveWithObject: true })
		console.log(`	TN: ${Date.now() - t}ms`)
		//hash.tn = crypto.createHash('sha256').update(tnBuf).digest('base64url')
		variants.tn = {
			hash: crypto.createHash('sha256').update(tnVar.data).digest('base64url'),
			dim: rot ? [imgMeta.height, imgMeta.width] : [imgMeta.width, imgMeta.height],
			size: tnVar.info.size,
			//format: 'webp'
			format: 'avif'
		}
		console.log(`TN[${variants.tn.hash}] dim: ${variants.tn.dim}`)
		//console.log('hash.tn', hash.tn)
		await blobAdapter.writeBlob(tnId, variants.tn.hash, '', tnVar.data, { public: true }) // FIXME
	}

	// SD
	//if (sizes.includes('s') && (imgMeta.height > SD_SIZE || imgMeta.width > SD_SIZE)) {
	if (sizes.includes('s')) {
		t = Date.now()
		const sdVar = await img
			.rotate()
			//.resize(SD_SIZE, SD_SIZE, { fit: 'inside', withoutEnlargement: true })
			.resize(SD_SIZE, SD_SIZE, { fit: 'inside' })
			//.webp({ quality: 80, lossless: ['png', 'gif'].includes(imgMeta.format || '') })
			.avif({ quality: 50, bitdepth: 8, effort: 4, lossless: ['png', 'gif'].includes(imgMeta.format || '') })
			.toBuffer({ resolveWithObject: true })
		console.log(`	SD: ${Date.now() - t}ms`)
		//hash.sd = crypto.createHash('sha256').update(sdVar.data).digest('base64url')
		variants.sd = {
			hash: crypto.createHash('sha256').update(sdVar.data).digest('base64url'),
			dim: rot ? [sdVar.info.height, sdVar.info.width] : [sdVar.info.width, sdVar.info.height],
			size: sdVar.info.size,
			//format: 'webp'
			format: 'avif'
		}
		console.log(`SD[${variants.sd.hash}] dim: ${variants.sd.dim}`)
		//console.log('hash.sd', hash.sd)
		await blobAdapter.writeBlob(tnId, variants.sd.hash, '', sdVar.data, { public: true }) // FIXME
	}

	// HD
	if (sizes.includes('h') && (!sizes.includes ('s') || (imgMeta.height > HD_SIZE || imgMeta.width > HD_SIZE))) {
		t = Date.now()
		const hdVar = await img
			.rotate()
			.resize(HD_SIZE, HD_SIZE, { fit: 'inside', withoutEnlargement: true })
			//.webp({ quality: 80, lossless: ['png', 'gif'].includes(imgMeta.format || '') })
			.avif({ quality: 50, bitdepth: 8, effort: 4, lossless: ['png', 'gif'].includes(imgMeta.format || '') })
			.toBuffer({ resolveWithObject: true })
		console.log(`	HD: ${Date.now() - t}ms`)
		//hash.hd = crypto.createHash('sha256').update(hdVar.data).digest('base64url')
		variants.hd = {
			hash: crypto.createHash('sha256').update(hdVar.data).digest('base64url'),
			dim: rot ? [hdVar.info.height, hdVar.info.width] : [hdVar.info.width, hdVar.info.height],
			size: hdVar.info.size,
			//format: 'webp'
			format: 'avif'
		}
		console.log(`HD[${variants.hd.hash}] dim: ${variants.hd.dim}`)
		//console.log('hash.hd', hash.hd)
		await blobAdapter.writeBlob(tnId, variants.hd.hash, '', hdVar.data, { public: true }) // FIXME
	}

	return {
		createdAt,
		//hash,
		variants,
		attachment: imageHash(variants)
	}
}

//export function imageHash(hashData: ImageHash) {
export function imageHash(variants: ImageVariants) {
	let ver = ''
	const hashes: string[] = []

	if (variants.orig?.hash) {
		hashes.push(variants.orig.hash)
		ver += 'o'
	}
	if (variants.hd?.hash) {
		hashes.push(variants.hd.hash)
		ver += 'h'
	}
	if (variants.sd?.hash) {
		hashes.push(variants.sd.hash)
		ver += 's'
	}
	if (variants.tn?.hash) {
		hashes.push(variants.tn.hash)
		ver += 't'
	}
	return ver + ':' + hashes.join(',')
}

// vim: ts=4
