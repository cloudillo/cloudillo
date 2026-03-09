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

import { PDFDocument } from 'pdf-lib'
import { getFileUrl, createApiClient } from '@cloudillo/core'

import { type ScanPage, type PageFilter, FILTER_DEFAULTS } from '../types.js'
import {
	base64ToCanvas,
	extractPerspective,
	applyFilter,
	blendWithOriginal,
	rotateCanvas,
	canvasToBlob
} from '../utils/image-processing.js'
import { addPdfAnnotations } from './pdf-annotations.js'

export type MarginOption = 'none' | 'small' | 'normal'

export interface PdfExportOptions {
	ownerTag: string
	token?: string
	fileId: string
	filename?: string
	onProgress?: (percent: number) => void
	dpi?: number
	margin?: MarginOption
	includeAnnotations?: boolean
}

// A4 in PDF points (72 points per inch)
const A4_WIDTH = 595.28
const A4_HEIGHT = 841.89

// Max canvas pixel dimensions per DPI target (relative to A4)
const DPI_MAX_PIXELS: Record<number, [number, number]> = {
	72: [595, 842],
	150: [1240, 1754],
	300: [2480, 3508]
}

function getMarginPoints(margin: MarginOption): number {
	switch (margin) {
		case 'none':
			return 0
		case 'small':
			return 14.17 // ~5mm
		case 'normal':
			return 28.35 // ~10mm
	}
}

async function fetchImageAsBase64(url: string): Promise<string> {
	const resp = await fetch(url)
	if (!resp.ok) throw new Error(`Failed to fetch image: ${resp.status} ${resp.statusText}`)
	const blob = await resp.blob()
	const reader = new FileReader()
	return new Promise<string>((resolve, reject) => {
		reader.onload = () => {
			const result = reader.result as string
			resolve(result.replace(/^data:[^;]+;base64,/, ''))
		}
		reader.onerror = reject
		reader.readAsDataURL(blob)
	})
}

async function processPage(
	page: ScanPage,
	ownerTag: string,
	token?: string,
	dpi = 150
): Promise<Blob> {
	const sourceFileId = page.originalFileId ?? page.fileId
	const url = getFileUrl(ownerTag, sourceFileId, 'orig', { token })
	const imageData = await fetchImageAsBase64(url)

	let canvas = await base64ToCanvas(imageData)

	// Apply crop
	if (page.cropPoints) {
		canvas = await extractPerspective(canvas, page.cropPoints)
	}

	// Scale to target DPI
	const maxDims = DPI_MAX_PIXELS[dpi] ?? DPI_MAX_PIXELS[150]
	if (canvas.width > maxDims[0] || canvas.height > maxDims[1]) {
		const scale = Math.min(maxDims[0] / canvas.width, maxDims[1] / canvas.height)
		const newW = Math.round(canvas.width * scale)
		const newH = Math.round(canvas.height * scale)
		const scaled = document.createElement('canvas')
		scaled.width = newW
		scaled.height = newH
		const ctx = scaled.getContext('2d')!
		ctx.drawImage(canvas, 0, 0, newW, newH)
		canvas = scaled
	}

	// Apply filter
	if (page.filter && page.filter !== 'original') {
		const strength = page.filterStrength ?? FILTER_DEFAULTS[page.filter]
		const original = canvas
		const filtered = await applyFilter(canvas, page.filter)
		canvas = blendWithOriginal(original, filtered, strength / 100)
	}

	// Apply rotation
	if (page.rotation && page.rotation !== 0) {
		canvas = rotateCanvas(canvas, page.rotation)
	}

	return canvasToBlob(canvas, 0.92)
}

async function resolveFilename(ownerTag: string, fileId: string, token?: string): Promise<string> {
	try {
		const api = createApiClient({ idTag: ownerTag, authToken: token })
		const files = await api.files.list({ fileId })
		if (files.length > 0 && files[0].fileName) {
			return files[0].fileName.replace(/\.[^.]+$/, '.pdf')
		}
	} catch {
		// Fallback below
	}
	const date = new Date().toISOString().slice(0, 10)
	return `scan-${date}.pdf`
}

export async function exportPagesToPdf(
	pages: ScanPage[],
	options: PdfExportOptions
): Promise<void> {
	const { ownerTag, token, fileId, onProgress } = options
	const dpi = options.dpi ?? 150
	const marginOpt = options.margin ?? 'normal'
	const includeAnnotations = options.includeAnnotations !== false

	const pdfDoc = await PDFDocument.create()
	const context = pdfDoc.context
	const total = pages.length
	const margin = getMarginPoints(marginOpt)

	for (let i = 0; i < total; i++) {
		onProgress?.(Math.round((i / total) * 100))

		const jpegBlob = await processPage(pages[i], ownerTag, token, dpi)
		const jpegBytes = new Uint8Array(await jpegBlob.arrayBuffer())
		const image = await pdfDoc.embedJpg(jpegBytes)

		const imgW = image.width
		const imgH = image.height

		// Decide page orientation based on image aspect ratio
		const isLandscape = imgW > imgH
		const pageW = isLandscape ? A4_HEIGHT : A4_WIDTH
		const pageH = isLandscape ? A4_WIDTH : A4_HEIGHT
		const usableW = pageW - 2 * margin
		const usableH = pageH - 2 * margin

		// Scale image to fit within usable area
		const scale = Math.min(usableW / imgW, usableH / imgH)
		const drawW = imgW * scale
		const drawH = imgH * scale

		// Center on page
		const x = margin + (usableW - drawW) / 2
		const y = margin + (usableH - drawH) / 2

		const page = pdfDoc.addPage([pageW, pageH])
		page.drawImage(image, { x, y, width: drawW, height: drawH })

		// Add native PDF annotations
		if (includeAnnotations && pages[i].annotations?.length) {
			addPdfAnnotations(page, context, pages[i].annotations!, { x, y, drawW, drawH })
		}
	}

	onProgress?.(100)

	const filename = options.filename ?? (await resolveFilename(ownerTag, fileId, token))
	const pdfBytes = await pdfDoc.save()
	const blob = new Blob([pdfBytes as BlobPart], { type: 'application/pdf' })
	const url = URL.createObjectURL(blob)

	const a = document.createElement('a')
	a.href = url
	a.download = filename
	document.body.appendChild(a)
	a.click()
	document.body.removeChild(a)
	URL.revokeObjectURL(url)
}

// vim: ts=4
