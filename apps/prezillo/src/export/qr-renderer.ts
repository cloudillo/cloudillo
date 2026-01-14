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
 * Native SVG QR code renderer for PDF export
 *
 * Generates QR codes as native SVG path elements instead of using
 * foreignObject with react-qr-code, ensuring proper PDF conversion.
 */

import QRCode from 'qrcode'
import type { QrCodeObject, QrErrorCorrection } from '../crdt'
import type { Bounds } from './types'

// Map error correction levels
const ERROR_LEVEL_MAP: Record<QrErrorCorrection, 'L' | 'M' | 'Q' | 'H'> = {
	low: 'L',
	medium: 'M',
	quartile: 'Q',
	high: 'H'
}

// Quiet zone margin as percentage of QR size
const QUIET_ZONE_PERCENT = 0.08

/**
 * Generate QR code matrix data
 */
async function generateQRMatrix(
	url: string,
	errorCorrection: QrErrorCorrection = 'medium'
): Promise<boolean[][]> {
	const qrData = await QRCode.create(url, {
		errorCorrectionLevel: ERROR_LEVEL_MAP[errorCorrection]
	})

	const size = qrData.modules.size
	const matrix: boolean[][] = []

	for (let y = 0; y < size; y++) {
		const row: boolean[] = []
		for (let x = 0; x < size; x++) {
			row.push(qrData.modules.get(x, y) === 1)
		}
		matrix.push(row)
	}

	return matrix
}

/**
 * Convert QR matrix to SVG path data
 * Uses a single path for all dark modules for efficient rendering
 */
function matrixToPath(
	matrix: boolean[][],
	moduleSize: number,
	offsetX: number,
	offsetY: number
): string {
	const pathParts: string[] = []

	for (let y = 0; y < matrix.length; y++) {
		for (let x = 0; x < matrix[y].length; x++) {
			if (matrix[y][x]) {
				const px = offsetX + x * moduleSize
				const py = offsetY + y * moduleSize
				// Draw a rectangle for each dark module
				pathParts.push(`M${px},${py}h${moduleSize}v${moduleSize}h${-moduleSize}Z`)
			}
		}
	}

	return pathParts.join('')
}

/**
 * Create native SVG elements for a QR code
 * Returns a DocumentFragment containing the QR code SVG elements
 */
export async function createQRCodeSVGElements(
	object: QrCodeObject,
	bounds: Bounds
): Promise<DocumentFragment> {
	const fragment = document.createDocumentFragment()

	const x = bounds.x
	const y = bounds.y
	const width = bounds.width
	const height = bounds.height

	// QR codes should be square - use the smaller dimension
	const size = Math.min(width, height)

	// Calculate quiet zone margin
	const margin = size * QUIET_ZONE_PERCENT
	const qrSize = size - margin * 2

	// Center the QR code in the bounding box
	const qrX = x + (width - size) / 2
	const qrY = y + (height - size) / 2

	// Get colors with defaults
	const foreground = object.foreground || '#000000'
	const background = object.background || '#ffffff'

	// Create background rectangle
	const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
	bgRect.setAttribute('x', String(x))
	bgRect.setAttribute('y', String(y))
	bgRect.setAttribute('width', String(width))
	bgRect.setAttribute('height', String(height))
	bgRect.setAttribute('fill', background)
	fragment.appendChild(bgRect)

	try {
		// Generate QR matrix
		const matrix = await generateQRMatrix(
			object.url || 'https://cloudillo.org',
			object.errorCorrection
		)

		// Calculate module size
		const moduleCount = matrix.length
		const moduleSize = qrSize / moduleCount

		// Offset to center QR with margin
		const offsetX = qrX + margin
		const offsetY = qrY + margin

		// Generate path data
		const pathData = matrixToPath(matrix, moduleSize, offsetX, offsetY)

		// Create path element
		const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path')
		pathEl.setAttribute('d', pathData)
		pathEl.setAttribute('fill', foreground)
		fragment.appendChild(pathEl)
	} catch (error) {
		// If QR generation fails, show a placeholder
		console.error('QR code generation failed:', error)

		const placeholder = document.createElementNS('http://www.w3.org/2000/svg', 'text')
		placeholder.setAttribute('x', String(x + width / 2))
		placeholder.setAttribute('y', String(y + height / 2))
		placeholder.setAttribute('text-anchor', 'middle')
		placeholder.setAttribute('dominant-baseline', 'middle')
		placeholder.setAttribute('font-size', '12')
		placeholder.setAttribute('fill', '#999')
		placeholder.textContent = 'QR Error'
		fragment.appendChild(placeholder)
	}

	return fragment
}

/**
 * Generate SVG string for a QR code (for string-based rendering)
 */
export async function generateQRCodeSVG(object: QrCodeObject, bounds: Bounds): Promise<string> {
	const x = bounds.x
	const y = bounds.y
	const width = bounds.width
	const height = bounds.height

	// QR codes should be square - use the smaller dimension
	const size = Math.min(width, height)

	// Calculate quiet zone margin
	const margin = size * QUIET_ZONE_PERCENT
	const qrSize = size - margin * 2

	// Center the QR code in the bounding box
	const qrX = x + (width - size) / 2
	const qrY = y + (height - size) / 2

	// Get colors with defaults
	const foreground = object.foreground || '#000000'
	const background = object.background || '#ffffff'

	let qrPath = ''

	try {
		// Generate QR matrix
		const matrix = await generateQRMatrix(
			object.url || 'https://cloudillo.org',
			object.errorCorrection
		)

		// Calculate module size
		const moduleCount = matrix.length
		const moduleSize = qrSize / moduleCount

		// Offset to center QR with margin
		const offsetX = qrX + margin
		const offsetY = qrY + margin

		// Generate path data
		qrPath = matrixToPath(matrix, moduleSize, offsetX, offsetY)
	} catch (error) {
		console.error('QR code generation failed:', error)
	}

	return `<g class="prezillo-qrcode">
		<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${background}"/>
		${qrPath ? `<path d="${qrPath}" fill="${foreground}"/>` : ''}
	</g>`
}

// vim: ts=4
