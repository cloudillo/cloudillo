// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Renders image objects on the canvas
 *
 * Features:
 * - Loading placeholder with dashed border
 * - Error state with icon
 * - Opacity support
 * - Smooth fade-in on load
 * - Automatic variant selection based on display size
 */

import { useFileImage } from '@cloudillo/react'
import * as React from 'react'

import type { ImageObject } from '../crdt/index.js'

export interface ImageRendererProps {
	object: ImageObject
	ownerTag?: string
	/** Access token for authenticated image fetching */
	token?: string
	/** Current canvas scale/zoom for optimal variant selection */
	scale?: number
	/** Bounds for rendering (x, y, width, height) */
	bounds?: {
		x: number
		y: number
		width: number
		height: number
	}
}

export function ImageRenderer({ object, ownerTag, token, scale = 1, bounds }: ImageRendererProps) {
	// Use bounds if provided, otherwise use object properties
	const x = bounds?.x ?? object.x
	const y = bounds?.y ?? object.y
	const width = bounds?.width ?? object.width
	const height = bounds?.height ?? object.height
	const { fileId } = object

	const { url: imageUrl, state } = useFileImage(
		ownerTag,
		fileId,
		width * scale,
		height * scale,
		token
	)

	return (
		<g className="prezillo-image">
			{/* Loading placeholder */}
			{state === 'loading' && (
				<rect
					x={x}
					y={y}
					width={width}
					height={height}
					fill="var(--col-container-low)"
					stroke="var(--col-outline, #ccc)"
					strokeWidth={1}
					strokeDasharray="8,4"
				/>
			)}

			{/* Error state */}
			{state === 'error' && (
				<g>
					<rect
						x={x}
						y={y}
						width={width}
						height={height}
						fill="var(--col-container-error)"
						stroke="var(--col-error, #c00)"
						strokeWidth={2}
					/>
					{/* Broken image icon */}
					<g transform={`translate(${x + width / 2 - 16}, ${y + height / 2 - 20})`}>
						<rect
							x={0}
							y={0}
							width={32}
							height={24}
							fill="none"
							stroke="var(--col-error, #c00)"
							strokeWidth={2}
							rx={2}
						/>
						<line
							x1={0}
							y1={24}
							x2={16}
							y2={12}
							stroke="var(--col-error, #c00)"
							strokeWidth={2}
						/>
						<circle cx={22} cy={8} r={4} fill="var(--col-error, #c00)" />
					</g>
					<text
						x={x + width / 2}
						y={y + height / 2 + 24}
						textAnchor="middle"
						dominantBaseline="middle"
						fill="var(--col-error, #c00)"
						fontSize={12}
						fontFamily="system-ui, sans-serif"
					>
						Failed to load
					</text>
				</g>
			)}

			{/* The actual image */}
			{imageUrl && (
				<image
					href={imageUrl}
					x={x}
					y={y}
					width={width}
					height={height}
					preserveAspectRatio="xMidYMid slice"
					style={{
						display: state === 'error' ? 'none' : 'block',
						opacity: state === 'loaded' ? 1 : 0,
						transition: 'opacity 0.15s ease-in'
					}}
				/>
			)}
		</g>
	)
}

// vim: ts=4
