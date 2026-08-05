// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Document detection using OpenCV.js with custom detection pipeline.
 *
 * OpenCV.js is loaded lazily on first use (~3.7MB gzipped).
 * The shell provides frames already scaled to the requested maxDimension.
 *
 * Custom pipeline (blur BEFORE Canny for correct behavior at 1024px):
 *   GaussianBlur(5,5) → Canny(50, 200) → morphologyEx(CLOSE) →
 *   findContours(RETR_EXTERNAL) → largest contour → optional local corner refinement
 */

// @ts-expect-error - jscanify is UMD without type declarations
import jscanify from 'jscanify/client'

import type { CornerSource, CropPoints } from './types.js'
import { type GrayImage, refineQuad } from './utils/refine-quad.js'

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
		// TODO: cv.imread() reads back via getImageData() every frame, so
		// `{ willReadFrequently: true }` may win. It has to go here — context attributes
		// are fixed by the first getContext() call. Measure on a real device first.
		decodeCanvas = document.createElement('canvas')
	}
	decodeCanvas.width = width
	decodeCanvas.height = height
	return decodeCanvas
}

/** Integer BT.601 luma — close enough to cv.COLOR_RGBA2GRAY for gradient work. */
function toLuma(rgba: Uint8ClampedArray, width: number, height: number): GrayImage {
	const data = new Uint8ClampedArray(width * height)
	for (let i = 0, p = 0; i < data.length; i++, p += 4) {
		data[i] = (77 * rgba[p] + 150 * rgba[p + 1] + 29 * rgba[p + 2]) >> 8
	}
	return { data, width, height }
}

// ============================================
// Inline detection pipeline (replaces jscanify)
// ============================================

/**
 * Find the largest paper-like contour in an image.
 * Pipeline: GaussianBlur(5,5) → Canny(50,200) → morphologyEx(CLOSE) → findContours → largest
 *
 * The contour count is returned separately from the contour itself: findContours traces
 * edge pixels, so an image full of open curves yields contours whose contourArea collapses
 * toward zero. Without the count, that case is indistinguishable from "no contours at all".
 */
function findPaperContour(mat: CvMat): { contour: CvMat | null; contourCount: number } {
	const gray = new cv.Mat()
	const blurred = new cv.Mat()
	const edges = new cv.Mat()
	const closed = new cv.Mat()
	const contours = new cv.MatVector()
	const hierarchy = new cv.Mat()
	let kernel: CvMat | null = null

	try {
		cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY)
		cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0)
		cv.Canny(blurred, edges, 50, 200)

		// Bridge small Canny gaps so a boundary that breaks at a low-contrast spot still
		// traces as one closed loop instead of an area-collapsing out-and-back polygon.
		// Scale-relative on purpose (3px @640 preview, 5px @1024 capture): an absolute
		// kernel makes the preview and the full-res pass disagree.
		const k = 2 * Math.round(Math.max(mat.rows, mat.cols) / 400) + 1
		kernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(k, k))
		cv.morphologyEx(edges, closed, cv.MORPH_CLOSE, kernel)

		cv.findContours(closed, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE)

		let largestContour: CvMat | null = null
		let largestArea = 0
		const contourCount = contours.size()

		for (let i = 0; i < contourCount; i++) {
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

		return { contour: largestContour, contourCount }
	} finally {
		gray.delete()
		blurred.delete()
		edges.delete()
		closed.delete()
		contours.delete()
		hierarchy.delete()
		if (kernel) kernel.delete()
	}
}

/**
 * Extract corner points from a contour using minAreaRect center partitioning.
 * Smart edge-aware selection: avoids corners that sit on image boundaries.
 *
 * `fallbackCount` is how many of the four corners had to fall back to the farthest point
 * regardless of the edge-margin rule. Two or more means most corners are pinned to the
 * image border and the "detection" is really a full-frame quad in disguise.
 *
 * Exported for its unit test: the gate it feeds sits inside `detectDocumentDetailed`,
 * which needs OpenCV and a real canvas and so cannot be driven from a suite.
 */
export function getCornerPoints(
	contour: CvMat,
	width: number,
	height: number
): { corners: CornerPoints; fallbackCount: number } | null {
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

		// Mixed strict/loose comparisons, but still a valid partition (no gaps, no double
		// counting). A perfectly axis-aligned contour whose points all sit on the centre
		// lines can leave a quadrant empty, which makes this return null.
		if (x <= center.x && y < center.y) topLeft.push(point)
		else if (x > center.x && y < center.y) topRight.push(point)
		else if (x <= center.x && y >= center.y) bottomLeft.push(point)
		else bottomRight.push(point)
	}

	const isOnEdge = (px: number, py: number): boolean =>
		px < marginX || px > width - marginX || py < marginY || py > height - marginY

	// Pick the farthest non-edge point; fall back to farthest overall. Single max-scan
	// rather than a sort — this runs per quadrant per frame at 5fps.
	function pickCorner(
		points: { x: number; y: number; dist: number }[]
	): { x: number; y: number; fallback: boolean } | null {
		let best: { x: number; y: number; dist: number } | null = null
		let farthest: { x: number; y: number; dist: number } | null = null
		for (const p of points) {
			if (!farthest || p.dist > farthest.dist) farthest = p
			if (!isOnEdge(p.x, p.y) && (!best || p.dist > best.dist)) best = p
		}
		if (best) return { x: best.x, y: best.y, fallback: false }
		if (farthest) return { x: farthest.x, y: farthest.y, fallback: true }
		return null
	}

	const tl = pickCorner(topLeft)
	const tr = pickCorner(topRight)
	const bl = pickCorner(bottomLeft)
	const br = pickCorner(bottomRight)

	if (!tl || !tr || !bl || !br) return null

	return {
		corners: {
			topLeftCorner: { x: tl.x, y: tl.y },
			topRightCorner: { x: tr.x, y: tr.y },
			bottomLeftCorner: { x: bl.x, y: bl.y },
			bottomRightCorner: { x: br.x, y: br.y }
		},
		fallbackCount:
			(tl.fallback ? 1 : 0) +
			(tr.fallback ? 1 : 0) +
			(bl.fallback ? 1 : 0) +
			(br.fallback ? 1 : 0)
	}
}

// ============================================
// MAIN DETECTION FUNCTION
// ============================================

/** Why a detection pass ended the way it did. Every exit path reports one. */
export type DetectReason = 'ok' | 'decode-failed' | 'no-contour' | 'small-area' | 'no-corners'

export interface DetectOutcome {
	quad: CropPoints | null
	source: CornerSource
	reason: DetectReason
	areaFraction: number | null
	refinedEdges: number
	maxShiftPx: number
}

// Working resolution. The refine cap is separate so it can be raised to 2048 in one line if
// corner precision at 1024 (~0.3px there, ~1px on a 3000px original) proves insufficient on
// real devices; full resolution would mean a 48MB ImageData on a mid phone.
const MAX_DETECT_DIM = 1024
const MAX_REFINE_DIM = 1024

// Contour must enclose at least this fraction of the frame to count as a document.
const MIN_AREA_FRACTION = 0.1

/**
 * Detect a document quadrilateral in a base64 JPEG image, with provenance.
 *
 * Order: detect → if detection produced nothing trustworthy and a seed was supplied, adopt
 * the seed → refine whichever quad we ended up with against the full-res image. Refinement
 * runs on detected quads too: getCornerPoints' farthest-vertex-per-quadrant heuristic is
 * biased outward, and the morphological close adds another ~k/2px on top.
 *
 * @param imageData - Base64-encoded JPEG (no data URL prefix)
 * @param opts.seed - Fallback quad (normalized) to adopt if detection fails
 * @param opts.refine - Run local corner refinement (costs one getImageData)
 */
export async function detectDocumentDetailed(
	imageData: string,
	opts?: { seed?: CropPoints | null; refine?: boolean }
): Promise<DetectOutcome> {
	const seed = opts?.seed ?? null
	const refine = opts?.refine ?? false

	await loadOpenCV()

	const blob = await (await fetch(`data:image/jpeg;base64,${imageData}`)).blob()
	const bitmap = await createImageBitmap(blob)

	// Scale down for detection if needed
	let detectW = bitmap.width
	let detectH = bitmap.height
	const limit = refine ? MAX_REFINE_DIM : MAX_DETECT_DIM
	const maxDim = Math.max(detectW, detectH)
	if (maxDim > limit) {
		const scale = limit / maxDim
		detectW = Math.round(bitmap.width * scale)
		detectH = Math.round(bitmap.height * scale)
	}

	function report(outcome: DetectOutcome, contourCount: number): DetectOutcome {
		console.debug('[scanillo] detect', {
			reason: outcome.reason,
			source: outcome.source,
			detectW,
			detectH,
			contourCount,
			areaFraction: outcome.areaFraction,
			refinedEdges: outcome.refinedEdges,
			maxShiftPx: outcome.maxShiftPx
		})
		return outcome
	}

	const canvas = getDecodeCanvas(detectW, detectH)
	const ctx = canvas.getContext('2d')
	if (!ctx) {
		bitmap.close()
		return report(
			{
				quad: seed,
				source: seed ? 'preview' : 'none',
				reason: 'decode-failed',
				areaFraction: null,
				refinedEdges: 0,
				maxShiftPx: 0
			},
			0
		)
	}

	ctx.drawImage(bitmap, 0, 0, detectW, detectH)
	bitmap.close()

	// --- synchronous block: NO await until `gray` has been copied out ---
	// `decodeCanvas` is module-level and shared; the only mutation that could corrupt it is
	// getDecodeCanvas() reassigning width/height, reachable only from another detect call —
	// which single-threaded JS cannot start mid-block.
	const mat = cv.imread(canvas)
	const gray = refine
		? toLuma(ctx.getImageData(0, 0, detectW, detectH).data, detectW, detectH)
		: null
	// --- end synchronous block ---

	let quad: CropPoints | null = null
	let source: CornerSource = 'none'
	let reason: DetectReason = 'ok'
	let areaFraction: number | null = null
	let contourCount = 0

	let contour: CvMat | null = null
	try {
		const found = findPaperContour(mat)
		contour = found.contour
		contourCount = found.contourCount

		if (!contour) {
			reason = 'no-contour'
		} else {
			areaFraction = cv.contourArea(contour) / (detectW * detectH)
			if (areaFraction < MIN_AREA_FRACTION) {
				reason = 'small-area'
			} else {
				const picked = getCornerPoints(contour, detectW, detectH)
				if (!picked) {
					reason = 'no-corners'
				} else {
					const c = picked.corners
					const normalize = (px: number, py: number): [number, number] => [
						Math.max(0, Math.min(1, px / detectW)),
						Math.max(0, Math.min(1, py / detectH))
					]
					quad = [
						normalize(c.topLeftCorner.x, c.topLeftCorner.y),
						normalize(c.topRightCorner.x, c.topRightCorner.y),
						normalize(c.bottomRightCorner.x, c.bottomRightCorner.y),
						normalize(c.bottomLeftCorner.x, c.bottomLeftCorner.y)
					]
					// Most corners pinned to the image border — a full-frame quad wearing
					// a detection's clothes. Dropped rather than merely downgraded: the
					// preview wrapper below reports `quad` alone, so a quad left here
					// would seed the capture pass as if it had been detected.
					if (picked.fallbackCount >= 2) {
						reason = 'no-corners'
						quad = null
					} else {
						source = 'detected'
					}
				}
			}
		}
	} finally {
		mat.delete()
		if (contour) contour.delete()
	}

	// The preview frame and the capture still are the same video frame at different
	// scales, so a normalized preview quad maps onto the still with no conversion.
	if (source !== 'detected' && seed) {
		quad = seed
		source = 'preview'
	}

	let refinedEdges = 0
	let maxShiftPx = 0
	if (quad && gray) {
		const refined = refineQuad(gray, quad)
		quad = refined.quad
		refinedEdges = refined.refinedEdges
		maxShiftPx = refined.maxShiftPx
	}

	return report({ quad, source, reason, areaFraction, refinedEdges, maxShiftPx }, contourCount)
}

/**
 * Detect a document quadrilateral in a base64 JPEG image.
 *
 * Wrapper for the 5fps preview loop: no refinement, no seed, no getImageData.
 *
 * @param imageData - Base64-encoded JPEG (no data URL prefix)
 * @returns 4 normalized [x,y] corner points in clockwise order, or null if no document found
 */
export async function detectDocument(
	imageData: string,
	_width: number,
	_height: number
): Promise<[number, number][] | null> {
	const outcome = await detectDocumentDetailed(imageData, { refine: false, seed: null })
	return outcome.quad
}

// vim: ts=4
