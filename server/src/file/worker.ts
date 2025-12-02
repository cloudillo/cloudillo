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

import sharp from 'sharp'
import exif from 'exif-reader'

import { MetaAdapter } from '../meta-adapter.js'
import { addTask } from '../worker.js'
import { metaAdapter, blobAdapter } from '../adapters.js'

/////////////
// Presets //
/////////////
interface ImageVariantOpts {
	plugin: 'image'
	label: string
	cover: [number, number]
	quality: number
	format: 'jpeg' | 'png'
	public?: boolean
}

const presets: Record<string, ImageVariantOpts[]> = {
	gallery: [
		{
			plugin: 'image',
			label: 'tn.jpg',
			cover: [100, 100],
			quality: 90,
			format: 'jpeg',
			public: true
		},
		{
			plugin: 'image',
			label: 'lg.jpg',
			cover: [800, 800],
			quality: 90,
			format: 'jpeg',
			public: true
		}
	],
	pdf: [],
	xlsx: [],
	txt: []
}

async function ImageVariant(varOpts: ImageVariantOpts, buf: Buffer, tnId: number, fileId: string) {
	try {
		const img = sharp(buf)
		const imgMeta = await img.metadata()
		let createdAt: Date | undefined
		//console.log('meta', imgMeta)

		if (imgMeta.exif) {
			const exifData = exif(imgMeta.exif)
			if (exifData?.Image?.DateTime) createdAt = exifData.Image.DateTime
			createdAt =
				exifData.Image?.DateTime ??
				exifData.Photo?.DateTimeOriginal ??
				exifData.Photo?.DateTimeDigitized
			//console.log('exif', exifData)
		}

		const meta = {
			orientation: imgMeta.orientation || 0,
			//dim: [imgMeta.width, imgMeta.height],
			dim:
				(imgMeta.orientation || 0) >= 5
					? [imgMeta.height, imgMeta.width]
					: [imgMeta.width, imgMeta.height]
		}
		const convBuf = await img
			.rotate()
			.resize(varOpts.cover[0], varOpts.cover[1], { fit: 'outside' })
			.toFormat(varOpts.format)
			.toBuffer()
		//console.log('meta', meta)

		await blobAdapter.writeBlob(tnId, fileId, varOpts.label, convBuf, {
			public: varOpts.public,
			force: true
		})
		await metaAdapter.updateFile(tnId, fileId, { meta, createdAt, status: 'I' })
	} catch (err) {
		console.log('ERROR', err)
	}
}

///////////////
// File task //
///////////////
async function fileTask() {
	//const prepareList = await listMetaToPrepare()
	return !!(await metaAdapter.processPendingFilesPrepare(async function processMeta(tnId, file) {
		console.log('PREPARE', file)
		const presetOpts = presets[file.preset || '']
		if (presetOpts?.length) {
			const buf = await blobAdapter.readBlob(tnId, file.fileId)

			for (const variant of presetOpts) {
				switch (variant.plugin) {
					case 'image':
						//await ImageVariant(variant, buf, tnId, file.fileId)
						break
					default:
						console.log('Variant plugin error:', variant.plugin)
				}
			}
		}
		await metaAdapter.updateFile(tnId, file.fileId, { status: 'I' })
		return true
	}))
}

export async function initWorker() {
	addTask(fileTask)
}

// vim: ts=4
