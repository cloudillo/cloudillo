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
 * Renders image objects on the canvas
 *
 * Features:
 * - Loading placeholder with dashed border
 * - Error state with icon
 * - Opacity support
 * - Smooth fade-in on load
 * - Automatic variant selection based on display size
 */

import * as React from 'react'
import { getFileUrl, getImageVariantForDisplaySize } from '@cloudillo/core'
import type { ImageObject } from '../crdt/index.js'

export interface ImageRendererProps {
	object: ImageObject
	ownerTag?: string
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

type LoadState = 'loading' | 'loaded' | 'error'

export function ImageRenderer({ object, ownerTag, scale = 1, bounds }: ImageRendererProps) {
	// Use bounds if provided, otherwise use object properties
	const x = bounds?.x ?? object.x
	const y = bounds?.y ?? object.y
	const width = bounds?.width ?? object.width
	const height = bounds?.height ?? object.height
	const { fileId } = object

	const [loadState, setLoadState] = React.useState<LoadState>('loading')

	// Compute optimal variant based on display size (canvas size * zoom)
	const variant = React.useMemo(() => {
		const displayWidth = width * scale
		const displayHeight = height * scale
		return getImageVariantForDisplaySize(displayWidth, displayHeight)
	}, [width, height, scale])

	// Construct image URL using proper Cloudillo URL helpers
	const imageUrl = React.useMemo(() => {
		if (ownerTag) {
			return getFileUrl(ownerTag, fileId, variant)
		}
		// Fallback to relative URL when ownerTag is not available
		return `/api/files/${fileId}?variant=${variant}`
	}, [fileId, ownerTag, variant])

	const handleLoad = React.useCallback(() => {
		setLoadState('loaded')
	}, [])

	const handleError = React.useCallback(() => {
		setLoadState('error')
	}, [])

	// Reset load state when fileId changes
	React.useEffect(() => {
		setLoadState('loading')
	}, [fileId])

	// Check if image is already cached/loaded on mount
	// This fixes images appearing as white rectangles after scrolling back into view
	// because SVG <image> elements may not fire onLoad for cached images
	React.useLayoutEffect(() => {
		// Probe the image URL to check if it's already in browser cache
		const img = new Image()
		img.src = imageUrl
		if (img.complete && img.naturalWidth > 0) {
			setLoadState('loaded')
		}
	}, [imageUrl])

	return (
		<g className="prezillo-image">
			{/* Loading placeholder */}
			{loadState === 'loading' && (
				<rect
					x={x}
					y={y}
					width={width}
					height={height}
					fill="var(--col-surface-dim, #f0f0f0)"
					stroke="var(--col-outline, #ccc)"
					strokeWidth={1}
					strokeDasharray="8,4"
				/>
			)}

			{/* Error state */}
			{loadState === 'error' && (
				<g>
					<rect
						x={x}
						y={y}
						width={width}
						height={height}
						fill="var(--col-error-container, #fee)"
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
			<image
				href={imageUrl}
				x={x}
				y={y}
				width={width}
				height={height}
				preserveAspectRatio="xMidYMid slice"
				onLoad={handleLoad}
				onError={handleError}
				style={{
					display: loadState === 'error' ? 'none' : 'block',
					opacity: loadState === 'loaded' ? 1 : 0,
					transition: 'opacity 0.15s ease-in'
				}}
			/>
		</g>
	)
}

// vim: ts=4
