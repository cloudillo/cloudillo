// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Document detection using OpenCV.js with custom detection pipeline.
 *
 * OpenCV.js is loaded lazily on first use (~3.7MB gzipped).
 * The shell provides frames already scaled to the requested maxDimension.
 *
 * Custom pipeline (blur BEFORE Canny for correct behavior at 1024px):
 *   GaussianBlur(5,5) → Canny(50, 200) → findContours(RETR_EXTERNAL) → largest contour
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
// Inline detection pipeline (replaces jscanify)
// ============================================

/**
 * Find the largest paper-like contour in an image.
 * Pipeline: GaussianBlur(5,5) → Canny(50,200) → findContours → largest
 */
function findPaperContour(mat: CvMat): CvMat | null {
	const gray = new cv.Mat()
	const blurred = new cv.Mat()
	const edges = new cv.Mat()
	const contours = new cv.MatVector()
	const hierarchy = new cv.Mat()

	try {
		cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY)
		cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0)
		cv.Canny(blurred, edges, 50, 200)
		cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE)

		let largestContour: CvMat | null = null
		let largestArea = 0

		for (let i = 0; i < contours.size(); i++) {
			const contour = contours.get(i)
			const area = cv.contourArea(contour)
			if (area > largestArea) {
				if (largestContour) largestContour.delete()
				largestArea = area
				// Clone because MatVector.get() returns a view; contours.delete() frees all
				largestContour = contour.clone()
			}
			contour.delete()
		}

		return largestContour
	} finally {
		gray.delete()
		blurred.delete()
		edges.delete()
		contours.delete()
		hierarchy.delete()
	}
}

/**
 * Extract corner points from a contour using minAreaRect center partitioning.
 * Smart edge-aware selection: avoids corners that sit on image boundaries.
 */
function getCornerPoints(contour: CvMat, width: number, height: number): CornerPoints | null {
	const rect = cv.minAreaRect(contour)
	const center = rect.center

	const EDGE_MARGIN = 0.02
	const marginX = width * EDGE_MARGIN
	const marginY = height * EDGE_MARGIN

	// Partition contour points into quadrants relative to rect center
	const topLeft: { x: number; y: number; dist: number }[] = []
	const topRight: { x: number; y: number; dist: number }[] = []
	const bottomLeft: { x: number; y: number; dist: number }[] = []
	const bottomRight: { x: number; y: number; dist: number }[] = []

	const data = contour.data32S
	for (let i = 0; i < data.length; i += 2) {
		const x = data[i]
		const y = data[i + 1]
		const dist = Math.sqrt((x - center.x) ** 2 + (y - center.y) ** 2)
		const point = { x, y, dist }

		if (x <= center.x && y < center.y) topLeft.push(point)
		else if (x > center.x && y < center.y) topRight.push(point)
		else if (x <= center.x && y >= center.y) bottomLeft.push(point)
		else bottomRight.push(point)
	}

	const isOnEdge = (px: number, py: number): boolean =>
		px < marginX || px > width - marginX || py < marginY || py > height - marginY

	// Pick the farthest non-edge point; fall back to farthest overall
	function pickCorner(
		points: { x: number; y: number; dist: number }[]
	): { x: number; y: number } | null {
		if (points.length === 0) return null
		points.sort((a, b) => b.dist - a.dist)
		for (const p of points) {
			if (!isOnEdge(p.x, p.y)) return { x: p.x, y: p.y }
		}
		return { x: points[0].x, y: points[0].y }
	}

	const tl = pickCorner(topLeft)
	const tr = pickCorner(topRight)
	const bl = pickCorner(bottomLeft)
	const br = pickCorner(bottomRight)

	if (!tl || !tr || !bl || !br) return null

	return {
		topLeftCorner: tl,
		topRightCorner: tr,
		bottomLeftCorner: bl,
		bottomRightCorner: br
	}
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

	// Scale down for detection if needed
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
		contour = findPaperContour(mat)
		if (!contour) return null

		// Check minimum area (10% of frame)
		const contourArea = cv.contourArea(contour)
		const frameArea = detectWidth * detectHeight
		if (contourArea < frameArea * 0.1) {
			return null
		}

		const corners = getCornerPoints(contour, detectWidth, detectHeight)
		if (!corners) return null

		const { topLeftCorner, topRightCorner, bottomLeftCorner, bottomRightCorner } = corners

		console.debug(
			`[scanillo] frame=${detectWidth}x${detectHeight} area=${((contourArea / frameArea) * 100).toFixed(1)}% corners: TL(${topLeftCorner.x},${topLeftCorner.y}) TR(${topRightCorner.x},${topRightCorner.y}) BR(${bottomRightCorner.x},${bottomRightCorner.y}) BL(${bottomLeftCorner.x},${bottomLeftCorner.y})`
		)

		// Normalize to 0-1, clamped
		const normalize = (px: number, py: number): [number, number] => [
			Math.max(0, Math.min(1, px / detectWidth)),
			Math.max(0, Math.min(1, py / detectHeight))
		]

		return [
			normalize(topLeftCorner.x, topLeftCorner.y),
			normalize(topRightCorner.x, topRightCorner.y),
			normalize(bottomRightCorner.x, bottomRightCorner.y),
			normalize(bottomLeftCorner.x, bottomLeftCorner.y)
		]
	} finally {
		mat.delete()
		if (contour) contour.delete()
	}
}

// vim: ts=4
