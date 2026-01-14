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

/**
 * Image embedder - fetches images and converts to base64 data URLs
 *
 * This module handles image embedding for PDF export by:
 * 1. Collecting all image objects from the document
 * 2. Fetching images via the Cloudillo API
 * 3. Converting them to base64 data URLs for embedding
 */

import { getFileUrl } from '@cloudillo/base'
import type { ImageObject, PrezilloObject, YPrezilloDocument } from '../crdt'

// Use HD variant for PDF quality
const IMAGE_VARIANT = 'vis.hd'

/**
 * Fetch an image and convert it to a base64 data URL
 */
async function fetchImageAsDataURL(url: string): Promise<string> {
	const response = await fetch(url)
	if (!response.ok) {
		throw new Error(`Failed to fetch image: ${response.statusText}`)
	}

	const blob = await response.blob()
	return new Promise((resolve, reject) => {
		const reader = new FileReader()
		reader.onloadend = () => {
			if (typeof reader.result === 'string') {
				resolve(reader.result)
			} else {
				reject(new Error('Failed to convert image to data URL'))
			}
		}
		reader.onerror = reject
		reader.readAsDataURL(blob)
	})
}

/**
 * Collect all image objects from a document
 */
export function collectImageObjects(doc: YPrezilloDocument): ImageObject[] {
	const images: ImageObject[] = []

	doc.o.forEach((stored, id) => {
		// Check if it's an image type
		if (stored.t === 'I' && 'fid' in stored) {
			const obj = {
				id,
				type: 'image' as const,
				fileId: stored.fid,
				x: stored.xy?.[0] ?? 0,
				y: stored.xy?.[1] ?? 0,
				width: stored.wh?.[0] ?? 100,
				height: stored.wh?.[1] ?? 100
			} as ImageObject

			images.push(obj)
		}
	})

	return images
}

/**
 * Collect image objects from a specific set of objects
 */
export function collectImageObjectsFromArray(objects: PrezilloObject[]): ImageObject[] {
	return objects.filter((obj): obj is ImageObject => obj.type === 'image')
}

/**
 * Pre-load all images and create a cache of base64 data URLs
 *
 * @param images - Array of image objects to pre-load
 * @param ownerTag - Owner tag for constructing image URLs
 * @param onProgress - Optional progress callback
 * @returns Map of fileId to base64 data URL
 */
export async function preloadImages(
	images: ImageObject[],
	ownerTag?: string,
	onProgress?: (loaded: number, total: number) => void
): Promise<Map<string, string>> {
	const cache = new Map<string, string>()
	const total = images.length
	let loaded = 0

	// Deduplicate by fileId
	const uniqueFileIds = new Set(
		images.map((img) => img.fileId).filter((id): id is string => Boolean(id))
	)

	const promises = Array.from(uniqueFileIds).map(async (fileId) => {
		try {
			// Skip if no ownerTag available
			if (!ownerTag) {
				console.warn(`Cannot load image ${fileId}: no owner tag`)
				return
			}
			const url = getFileUrl(ownerTag, fileId, IMAGE_VARIANT)
			const dataUrl = await fetchImageAsDataURL(url)
			cache.set(fileId, dataUrl)
		} catch (error) {
			console.error(`Failed to load image ${fileId}:`, error)
			// Don't add to cache, will be handled as missing
		}

		loaded++
		onProgress?.(loaded, total)
	})

	await Promise.all(promises)
	return cache
}

/**
 * Create SVG image element with embedded data URL
 */
export function createImageSVGElement(
	object: ImageObject,
	imageCache: Map<string, string>,
	bounds?: { x: number; y: number; width: number; height: number }
): SVGImageElement | null {
	if (!object.fileId) return null

	const dataUrl = imageCache.get(object.fileId)
	if (!dataUrl) return null

	const x = bounds?.x ?? object.x
	const y = bounds?.y ?? object.y
	const width = bounds?.width ?? object.width
	const height = bounds?.height ?? object.height

	const imageEl = document.createElementNS('http://www.w3.org/2000/svg', 'image')
	imageEl.setAttribute('x', String(x))
	imageEl.setAttribute('y', String(y))
	imageEl.setAttribute('width', String(width))
	imageEl.setAttribute('height', String(height))
	imageEl.setAttribute('href', dataUrl)
	imageEl.setAttribute('preserveAspectRatio', 'xMidYMid slice')

	return imageEl
}

/**
 * Generate SVG image string with embedded data URL
 */
export function generateImageSVG(
	object: ImageObject,
	imageCache: Map<string, string>,
	bounds?: { x: number; y: number; width: number; height: number }
): string {
	if (!object.fileId) {
		return generatePlaceholderSVG(bounds ?? object)
	}

	const dataUrl = imageCache.get(object.fileId)
	if (!dataUrl) {
		return generatePlaceholderSVG(bounds ?? object)
	}

	const x = bounds?.x ?? object.x
	const y = bounds?.y ?? object.y
	const width = bounds?.width ?? object.width
	const height = bounds?.height ?? object.height

	return `<image
		x="${x}"
		y="${y}"
		width="${width}"
		height="${height}"
		href="${dataUrl}"
		preserveAspectRatio="xMidYMid slice"
	/>`
}

/**
 * Generate placeholder SVG for missing images
 */
function generatePlaceholderSVG(bounds: {
	x: number
	y: number
	width: number
	height: number
}): string {
	return `<g>
		<rect
			x="${bounds.x}"
			y="${bounds.y}"
			width="${bounds.width}"
			height="${bounds.height}"
			fill="#f0f0f0"
			stroke="#ccc"
			stroke-width="1"
			stroke-dasharray="4 2"
		/>
		<text
			x="${bounds.x + bounds.width / 2}"
			y="${bounds.y + bounds.height / 2}"
			text-anchor="middle"
			dominant-baseline="middle"
			font-size="14"
			fill="#999"
		>Image not found</text>
	</g>`
}

// vim: ts=4
