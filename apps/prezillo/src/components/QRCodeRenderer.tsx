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
 * Renders QR code objects on the canvas
 *
 * Features:
 * - Renders QR codes encoding URLs
 * - Customizable foreground/background colors
 * - Error correction levels: L/M/Q/H
 * - Warning when QR code is too small to scan reliably
 */

import * as React from 'react'
import ReactQRCode from 'react-qr-code'
import type { QrCodeObject, QrErrorCorrection } from '../crdt/index.js'

// Handle ESM/CJS interop - the module might be wrapped
const QRCode = (ReactQRCode as any).default ?? ReactQRCode

export interface QRCodeRendererProps {
	object: QrCodeObject
	/** Bounds for rendering (x, y, width, height) */
	bounds?: {
		x: number
		y: number
		width: number
		height: number
	}
}

// Map error correction levels to react-qr-code format
const ERROR_LEVEL_MAP: Record<QrErrorCorrection, 'L' | 'M' | 'Q' | 'H'> = {
	low: 'L',
	medium: 'M',
	quartile: 'Q',
	high: 'H'
}

// Minimum size for reliable scanning (in pixels)
const MIN_SCANNABLE_SIZE = 50

// Quiet zone margin as percentage of QR size (QR spec requires 4 modules, ~8-10%)
const QUIET_ZONE_PERCENT = 0.08

export function QRCodeRenderer({ object, bounds }: QRCodeRendererProps) {
	// Use bounds if provided, otherwise use object properties
	const x = bounds?.x ?? object.x
	const y = bounds?.y ?? object.y
	const width = bounds?.width ?? object.width
	const height = bounds?.height ?? object.height

	// QR codes should be square - use the smaller dimension
	const size = Math.min(width, height)

	// Calculate quiet zone margin
	const margin = size * QUIET_ZONE_PERCENT
	const qrSize = size - margin * 2

	// Center the QR code in the bounding box
	const qrX = x + (width - size) / 2
	const qrY = y + (height - size) / 2

	// Check if too small to scan reliably
	const isTooSmall = size < MIN_SCANNABLE_SIZE

	// Get colors with defaults
	const foreground = object.foreground || '#000000'
	const background = object.background || '#ffffff'

	// Get error correction level
	const level = ERROR_LEVEL_MAP[object.errorCorrection || 'medium']

	return (
		<g className="prezillo-qrcode">
			{/* Background rectangle with quiet zone */}
			<rect x={x} y={y} width={width} height={height} fill={background} />

			{/* QR Code rendered via foreignObject for proper SVG integration */}
			<foreignObject x={qrX} y={qrY} width={size} height={size}>
				<div
					style={{
						width: '100%',
						height: '100%',
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						background: background,
						padding: margin
					}}
				>
					<QRCode
						value={object.url || 'https://cloudillo.org'}
						size={qrSize}
						level={level}
						fgColor={foreground}
						bgColor={background}
						style={{ width: '100%', height: '100%' }}
					/>
				</div>
			</foreignObject>

			{/* Warning overlay for too-small QR codes (only in edit mode, handled by parent) */}
			{isTooSmall && (
				<g>
					<rect
						x={x}
						y={y + height - 20}
						width={width}
						height={20}
						fill="rgba(255, 200, 0, 0.9)"
						rx={2}
					/>
					<text
						x={x + width / 2}
						y={y + height - 6}
						textAnchor="middle"
						fill="#000"
						fontSize={10}
						fontFamily="system-ui, sans-serif"
					>
						Too small to scan
					</text>
				</g>
			)}
		</g>
	)
}

// vim: ts=4
