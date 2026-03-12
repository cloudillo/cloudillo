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

import type { CropPoints, PageFilter } from '../types.js'

export async function base64ToCanvas(imageData: string): Promise<HTMLCanvasElement> {
	const blob = await (await fetch(`data:image/jpeg;base64,${imageData}`)).blob()
	const bitmap = await createImageBitmap(blob)

	const canvas = document.createElement('canvas')
	canvas.width = bitmap.width
	canvas.height = bitmap.height
	const ctx = canvas.getContext('2d')!
	ctx.drawImage(bitmap, 0, 0)
	bitmap.close()

	return canvas
}

function distance(x1: number, y1: number, x2: number, y2: number): number {
	return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
}

export async function extractPerspective(
	sourceCanvas: HTMLCanvasElement,
	cropPoints: CropPoints
): Promise<HTMLCanvasElement> {
	const { loadOpenCV, getScanner } = await import('../detect-document.js')
	await loadOpenCV()

	const w = sourceCanvas.width
	const h = sourceCanvas.height

	// Convert normalized crop points to pixel coords
	const [tl, tr, br, bl] = cropPoints
	const tlPx = { x: tl[0] * w, y: tl[1] * h }
	const trPx = { x: tr[0] * w, y: tr[1] * h }
	const brPx = { x: br[0] * w, y: br[1] * h }
	const blPx = { x: bl[0] * w, y: bl[1] * h }

	// Calculate output dimensions from edge lengths
	const topEdge = distance(tlPx.x, tlPx.y, trPx.x, trPx.y)
	const bottomEdge = distance(blPx.x, blPx.y, brPx.x, brPx.y)
	const leftEdge = distance(tlPx.x, tlPx.y, blPx.x, blPx.y)
	const rightEdge = distance(trPx.x, trPx.y, brPx.x, brPx.y)

	let outW = Math.round(Math.max(topEdge, bottomEdge))
	let outH = Math.round(Math.max(leftEdge, rightEdge))

	// Cap at A4 300dpi
	const maxW = 2480
	const maxH = 3508
	if (outW > maxW || outH > maxH) {
		const scale = Math.min(maxW / outW, maxH / outH)
		outW = Math.round(outW * scale)
		outH = Math.round(outH * scale)
	}

	// jscanify extractPaper expects: topLeftCorner, topRightCorner, bottomLeftCorner, bottomRightCorner
	// Our CropPoints order: TL, TR, BR, BL (clockwise)
	// jscanify srcTri order: TL, TR, BL, BR
	const cornerPoints = {
		topLeftCorner: tlPx,
		topRightCorner: trPx,
		bottomLeftCorner: blPx,
		bottomRightCorner: brPx
	}

	const result = getScanner().extractPaper(sourceCanvas, outW, outH, cornerPoints)
	return result
}

async function applyDocumentFilter(
	sourceCanvas: HTMLCanvasElement,
	grayscale = false
): Promise<HTMLCanvasElement> {
	const { loadOpenCV } = await import('../detect-document.js')
	await loadOpenCV()

	const canvas = document.createElement('canvas')
	canvas.width = sourceCanvas.width
	canvas.height = sourceCanvas.height

	const mats: CvDeletable[] = []
	try {
		const src = cv.imread(sourceCanvas)
		mats.push(src)
		const rgb = new cv.Mat()
		mats.push(rgb)
		cv.cvtColor(src, rgb, cv.COLOR_RGBA2RGB)
		const lab = new cv.Mat()
		mats.push(lab)
		cv.cvtColor(rgb, lab, cv.COLOR_RGB2Lab)

		const channels = new cv.MatVector()
		mats.push(channels)
		cv.split(lab, channels)
		const L = channels.get(0)
		mats.push(L)
		const a = channels.get(1)
		mats.push(a)
		const b = channels.get(2)
		mats.push(b)

		// Estimate local background via morphological closing on L channel
		// Downscale for performance: background is low-frequency, full resolution not needed
		const MAX_BG_DIM = 800
		const shortDim = Math.min(L.cols, L.rows)
		const bgScale = shortDim > MAX_BG_DIM ? MAX_BG_DIM / shortDim : 1
		const background = new cv.Mat()
		mats.push(background)

		if (bgScale < 1) {
			const smallL = new cv.Mat()
			mats.push(smallL)
			cv.resize(
				L,
				smallL,
				new cv.Size(Math.round(L.cols * bgScale), Math.round(L.rows * bgScale)),
				0,
				0,
				cv.INTER_AREA
			)

			let kernelSize = Math.round(Math.min(smallL.cols, smallL.rows) / 20)
			if (kernelSize < 21) kernelSize = 21
			if (kernelSize % 2 === 0) kernelSize++
			const kernel = cv.getStructuringElement(
				cv.MORPH_ELLIPSE,
				new cv.Size(kernelSize, kernelSize)
			)
			mats.push(kernel)

			const smallBg = new cv.Mat()
			mats.push(smallBg)
			cv.morphologyEx(smallL, smallBg, cv.MORPH_CLOSE, kernel)

			cv.resize(smallBg, background, new cv.Size(L.cols, L.rows), 0, 0, cv.INTER_LINEAR)
		} else {
			let kernelSize = Math.round(shortDim / 20)
			if (kernelSize < 51) kernelSize = 51
			if (kernelSize % 2 === 0) kernelSize++
			const kernel = cv.getStructuringElement(
				cv.MORPH_ELLIPSE,
				new cv.Size(kernelSize, kernelSize)
			)
			mats.push(kernel)
			cv.morphologyEx(L, background, cv.MORPH_CLOSE, kernel)
		}

		// Divide L by background and scale to 255: normalized = (L / background) * 255
		const normalizedL = new cv.Mat()
		mats.push(normalizedL)
		L.convertTo(normalizedL, cv.CV_32F)
		const bgFloat = new cv.Mat()
		mats.push(bgFloat)
		background.convertTo(bgFloat, cv.CV_32F)
		cv.divide(normalizedL, bgFloat, normalizedL)
		// Scale back to 0-255
		const scale255 = new cv.Mat(normalizedL.rows, normalizedL.cols, cv.CV_32F)
		mats.push(scale255)
		scale255.setTo(new cv.Scalar(255))
		cv.multiply(normalizedL, scale255, normalizedL)
		normalizedL.convertTo(L, cv.CV_8U)

		// Percentile-based contrast stretch on L (2nd → 98th percentile → 0 → 255)
		const lData = L.data
		const hist = new Uint32Array(256)
		for (let i = 0; i < lData.length; i++) hist[lData[i]]++
		const totalPixels = lData.length
		const lo2 = Math.floor(totalPixels * 0.02)
		const hi98 = Math.floor(totalPixels * 0.98)
		let cumSum = 0
		let pLo = 0
		let pHi = 255
		for (let v = 0; v < 256; v++) {
			cumSum += hist[v]
			if (cumSum <= lo2) pLo = v
			if (cumSum < hi98) pHi = v
		}
		if (pHi <= pLo) pHi = pLo + 1
		const range = pHi - pLo
		const gamma = 0.4
		const clipThreshold = 220
		for (let i = 0; i < lData.length; i++) {
			const v = lData[i]
			const stretched = Math.max(0, Math.min(1, (v - pLo) / range))
			let val = Math.round(255 * stretched ** gamma)
			if (val >= clipThreshold) val = 255
			lData[i] = val
		}

		// Desaturate a/b channels 50% toward neutral (128)
		const neutralMat = new cv.Mat(a.rows, a.cols, a.type())
		mats.push(neutralMat)
		neutralMat.setTo(new cv.Scalar(128))
		cv.addWeighted(a, 0.5, neutralMat, 0.5, 0, a)
		cv.addWeighted(b, 0.5, neutralMat, 0.5, 0, b)

		// Merge and convert back
		const merged = new cv.MatVector()
		mats.push(merged)
		merged.push_back(L)
		merged.push_back(a)
		merged.push_back(b)
		const labOut = new cv.Mat()
		mats.push(labOut)
		cv.merge(merged, labOut)
		const rgbOut = new cv.Mat()
		mats.push(rgbOut)
		cv.cvtColor(labOut, rgbOut, cv.COLOR_Lab2RGB)

		if (grayscale) {
			const grayOut = new cv.Mat()
			mats.push(grayOut)
			cv.cvtColor(rgbOut, grayOut, cv.COLOR_RGB2GRAY)
			const rgbaOut = new cv.Mat()
			mats.push(rgbaOut)
			cv.cvtColor(grayOut, rgbaOut, cv.COLOR_GRAY2RGBA)
			cv.imshow(canvas, rgbaOut)
		} else {
			const rgbaOut = new cv.Mat()
			mats.push(rgbaOut)
			cv.cvtColor(rgbOut, rgbaOut, cv.COLOR_RGB2RGBA)
			cv.imshow(canvas, rgbaOut)
		}
	} finally {
		for (const m of mats) m.delete()
	}
	return canvas
}

async function applyBwFilter(sourceCanvas: HTMLCanvasElement): Promise<HTMLCanvasElement> {
	const { loadOpenCV } = await import('../detect-document.js')
	await loadOpenCV()

	const canvas = document.createElement('canvas')
	canvas.width = sourceCanvas.width
	canvas.height = sourceCanvas.height

	const mats: CvDeletable[] = []
	try {
		const src = cv.imread(sourceCanvas)
		mats.push(src)
		const gray = new cv.Mat()
		mats.push(gray)
		cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)
		const blurred = new cv.Mat()
		mats.push(blurred)
		cv.GaussianBlur(gray, blurred, new cv.Size(3, 3), 0)
		const dst = new cv.Mat()
		mats.push(dst)
		cv.adaptiveThreshold(
			blurred,
			dst,
			255,
			cv.ADAPTIVE_THRESH_GAUSSIAN_C,
			cv.THRESH_BINARY,
			25,
			10
		)

		cv.imshow(canvas, dst)
	} finally {
		for (const m of mats) m.delete()
	}
	return canvas
}

async function applyHighContrastFilter(
	sourceCanvas: HTMLCanvasElement
): Promise<HTMLCanvasElement> {
	const { loadOpenCV } = await import('../detect-document.js')
	await loadOpenCV()

	const canvas = document.createElement('canvas')
	canvas.width = sourceCanvas.width
	canvas.height = sourceCanvas.height

	const mats: CvDeletable[] = []
	try {
		const src = cv.imread(sourceCanvas)
		mats.push(src)
		const rgb = new cv.Mat()
		mats.push(rgb)
		cv.cvtColor(src, rgb, cv.COLOR_RGBA2RGB)
		const lab = new cv.Mat()
		mats.push(lab)
		cv.cvtColor(rgb, lab, cv.COLOR_RGB2Lab)

		const channels = new cv.MatVector()
		mats.push(channels)
		cv.split(lab, channels)
		const L = channels.get(0)
		mats.push(L)
		const a = channels.get(1)
		mats.push(a)
		const b = channels.get(2)
		mats.push(b)

		// Full histogram equalization on L channel with brightness boost
		const eqL = new cv.Mat()
		mats.push(eqL)
		cv.equalizeHist(L, eqL)
		cv.addWeighted(eqL, 1.0, eqL, 0.0, 15, L)

		// Keep full color saturation (no desaturation on a/b channels)

		// Merge and convert back
		const merged = new cv.MatVector()
		mats.push(merged)
		merged.push_back(L)
		merged.push_back(a)
		merged.push_back(b)
		const labOut = new cv.Mat()
		mats.push(labOut)
		cv.merge(merged, labOut)
		const rgbOut = new cv.Mat()
		mats.push(rgbOut)
		cv.cvtColor(labOut, rgbOut, cv.COLOR_Lab2RGB)
		const rgbaOut = new cv.Mat()
		mats.push(rgbaOut)
		cv.cvtColor(rgbOut, rgbaOut, cv.COLOR_RGB2RGBA)

		cv.imshow(canvas, rgbaOut)
	} finally {
		for (const m of mats) m.delete()
	}
	return canvas
}

export async function applyFilter(
	sourceCanvas: HTMLCanvasElement,
	filter: PageFilter
): Promise<HTMLCanvasElement> {
	switch (filter) {
		case 'document':
			return applyDocumentFilter(sourceCanvas)
		case 'docbw':
			return applyDocumentFilter(sourceCanvas, true)
		case 'bw':
			return applyBwFilter(sourceCanvas)
		case 'highcontrast':
			return applyHighContrastFilter(sourceCanvas)
		default: {
			const canvas = document.createElement('canvas')
			canvas.width = sourceCanvas.width
			canvas.height = sourceCanvas.height
			const ctx = canvas.getContext('2d', { willReadFrequently: true })!
			ctx.drawImage(sourceCanvas, 0, 0)
			return canvas
		}
	}
}

export function rotateCanvas(source: HTMLCanvasElement, degrees: number): HTMLCanvasElement {
	const canvas = document.createElement('canvas')
	const swap = degrees === 90 || degrees === 270
	canvas.width = swap ? source.height : source.width
	canvas.height = swap ? source.width : source.height
	const ctx = canvas.getContext('2d', { willReadFrequently: true })!
	ctx.translate(canvas.width / 2, canvas.height / 2)
	ctx.rotate((degrees * Math.PI) / 180)
	ctx.drawImage(source, -source.width / 2, -source.height / 2)
	return canvas
}

export function blendWithOriginal(
	original: HTMLCanvasElement,
	filtered: HTMLCanvasElement,
	strength: number
): HTMLCanvasElement {
	const canvas = document.createElement('canvas')
	canvas.width = original.width
	canvas.height = original.height
	const ctx = canvas.getContext('2d')!
	ctx.drawImage(original, 0, 0)
	ctx.globalAlpha = strength
	ctx.drawImage(filtered, 0, 0)
	ctx.globalAlpha = 1.0
	return canvas
}

export function canvasToBase64(canvas: HTMLCanvasElement): string {
	const dataUrl = canvas.toDataURL('image/jpeg', 0.92)
	return dataUrl.replace(/^data:image\/jpeg;base64,/, '')
}

export function canvasToBlob(canvas: HTMLCanvasElement, quality = 0.92): Promise<Blob> {
	return new Promise((resolve, reject) => {
		canvas.toBlob(
			(blob) => (blob ? resolve(blob) : reject(new Error('Canvas toBlob failed'))),
			'image/jpeg',
			quality
		)
	})
}

export async function base64ToBlob(base64: string, contentType = 'image/jpeg'): Promise<Blob> {
	const res = await fetch(`data:${contentType};base64,${base64}`)
	return res.blob()
}

// vim: ts=4
