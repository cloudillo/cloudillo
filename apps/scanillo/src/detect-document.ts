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
 * Document detection using OpenCV.js with jscanify's detection pipeline.
 *
 * OpenCV.js is loaded lazily on first use (~3.7MB gzipped).
 * The shell provides frames already scaled to the requested maxDimension.
 *
 * Uses jscanify's proven pipeline:
 *   Canny(50, 200) → GaussianBlur(3,3) → threshold(OTSU) → findContours(RETR_CCOMP) → largest contour
 */

// @ts-expect-error - jscanify is UMD without type declarations
import jscanify from 'jscanify/client'

let scanner: Jscanify | null = null
export function getScanner(): Jscanify {
	if (!scanner) scanner = new jscanify() as Jscanify
	return scanner
}

// ============================================
// OpenCV.js lazy loading
// ============================================

let cvReady = false
let cvLoadPromise: Promise<void> | null = null

export function loadOpenCV(): Promise<void> {
	if (cvReady) return Promise.resolve()
	if (cvLoadPromise) return cvLoadPromise

	cvLoadPromise = new Promise<void>((resolve, reject) => {
		// Determine opencv.js URL relative to current script
		const scripts = document.querySelectorAll('script[src*="assets-"]')
		let basePath = ''
		if (scripts.length > 0) {
			const src = scripts[0].getAttribute('src') || ''
			basePath = src.substring(0, src.lastIndexOf('/') + 1)
		}

		const script = document.createElement('script')
		script.src = `${basePath}opencv.js`
		script.async = true

		script.onload = () => {
			// OpenCV.js sets window.cv, but WASM init is async
			if (typeof cv !== 'undefined' && cv.onRuntimeInitialized !== undefined) {
				// Already initialized
				if (cv.Mat) {
					cvReady = true
					resolve()
					return
				}
				// Wait for WASM initialization
				cv.onRuntimeInitialized = () => {
					cvReady = true
					resolve()
				}
			} else if (typeof cv !== 'undefined') {
				// cv is a promise (newer OpenCV.js builds)
				if (typeof cv.then === 'function') {
					cv.then(() => {
						cvReady = true
						resolve()
					})
				} else {
					cvReady = true
					resolve()
				}
			} else {
				reject(new Error('OpenCV.js loaded but cv global not found'))
			}
		}

		script.onerror = () => {
			cvLoadPromise = null
			reject(new Error('Failed to load OpenCV.js'))
		}

		document.head.appendChild(script)
	})

	return cvLoadPromise
}

// ============================================
// Canvas for decoding base64 frames
// ============================================

let decodeCanvas: HTMLCanvasElement | null = null

function getDecodeCanvas(width: number, height: number): HTMLCanvasElement {
	if (!decodeCanvas) {
		decodeCanvas = document.createElement('canvas')
	}
	decodeCanvas.width = width
	decodeCanvas.height = height
	return decodeCanvas
}

// ============================================
// MAIN DETECTION FUNCTION
// ============================================

/**
 * Detect a document quadrilateral in a base64 JPEG image.
 *
 * @param imageData - Base64-encoded JPEG (no data URL prefix)
 * @param width - Frame width
 * @param height - Frame height
 * @returns 4 normalized [x,y] corner points in clockwise order, or null if no document found
 */
export async function detectDocument(
	imageData: string,
	_width: number,
	_height: number
): Promise<[number, number][] | null> {
	await loadOpenCV()

	// Decode base64 to canvas
	const MAX_DETECT_DIM = 1024
	const blob = await (await fetch(`data:image/jpeg;base64,${imageData}`)).blob()
	const bitmap = await createImageBitmap(blob)

	// Scale down for detection if needed (fixed kernel sizes work best at ~640-1024px)
	let detectWidth = bitmap.width
	let detectHeight = bitmap.height
	const maxDim = Math.max(detectWidth, detectHeight)
	if (maxDim > MAX_DETECT_DIM) {
		const scale = MAX_DETECT_DIM / maxDim
		detectWidth = Math.round(bitmap.width * scale)
		detectHeight = Math.round(bitmap.height * scale)
	}

	const canvas = getDecodeCanvas(detectWidth, detectHeight)
	const ctx = canvas.getContext('2d')
	if (!ctx) {
		bitmap.close()
		return null
	}

	ctx.drawImage(bitmap, 0, 0, detectWidth, detectHeight)
	bitmap.close()

	// Run detection at scaled resolution
	const mat = cv.imread(canvas)
	let contour: CvMat | null = null
	try {
		contour = getScanner().findPaperContour(mat)
		if (!contour) return null

		// Check minimum area (10% of frame)
		const contourArea = cv.contourArea(contour)
		const frameArea = detectWidth * detectHeight
		if (contourArea < frameArea * 0.1) {
			return null
		}

		const corners = getScanner().getCornerPoints(contour)
		const { topLeftCorner, topRightCorner, bottomLeftCorner, bottomRightCorner } = corners

		if (!topLeftCorner || !topRightCorner || !bottomLeftCorner || !bottomRightCorner) {
			return null
		}

		console.debug(
			`[scanillo] frame=${detectWidth}x${detectHeight} area=${((contourArea / frameArea) * 100).toFixed(1)}% corners: TL(${topLeftCorner.x},${topLeftCorner.y}) TR(${topRightCorner.x},${topRightCorner.y}) BR(${bottomRightCorner.x},${bottomRightCorner.y}) BL(${bottomLeftCorner.x},${bottomLeftCorner.y})`
		)

		// Normalize to 0-1
		return [
			[topLeftCorner.x / detectWidth, topLeftCorner.y / detectHeight],
			[topRightCorner.x / detectWidth, topRightCorner.y / detectHeight],
			[bottomRightCorner.x / detectWidth, bottomRightCorner.y / detectHeight],
			[bottomLeftCorner.x / detectWidth, bottomLeftCorner.y / detectHeight]
		]
	} finally {
		mat.delete()
		if (contour) contour.delete()
	}
}

// vim: ts=4
