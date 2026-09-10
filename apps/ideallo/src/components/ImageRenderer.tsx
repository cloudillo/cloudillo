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
import { isPaintSet } from '../utils/paint.js'
import { colorToCss } from '../utils/palette.js'

export interface ImageRendererProps {
	object: ImageObject
	ownerTag?: string
	token?: string
	/** Current canvas scale/zoom for optimal variant selection */
	scale?: number
	/** Hover effect (object is under cursor in select mode) */
	isHovered?: boolean
	/** Eraser hover effect (object is under eraser cursor) */
	isEraserHovered?: boolean
}

export function ImageRenderer({
	object,
	ownerTag,
	token,
	scale = 1,
	isHovered,
	isEraserHovered
}: ImageRendererProps) {
	const { x, y, width, height, fileId, style } = object
	const { url: imageUrl, state } = useFileImage(
		ownerTag,
		fileId,
		width * scale,
		height * scale,
		token
	)

	const rounded = (object.cornerRadius ?? 0) > 0
	const hasBorder = isPaintSet(style.strokeColor) && style.strokeWidth > 0
	/*
	 * Per MOUNTED INSTANCE, not per object: `url(#id)` resolves to the FIRST match in document
	 * order regardless of which subtree asked. GhostEditing renders this component for an object
	 * the committed layer is already showing, with the coordinates rewritten rather than wrapped in
	 * a transform (see applyOffset there), and the ghost layer mounts second - so a per-object id
	 * had the ghost's <image> clipped by the committed image's un-offset rect, and a peer watching a
	 * rounded image being dragged saw it shear away to nothing.
	 *
	 * React.useId() emits delimiters (':r0:') that are not valid inside url(#...) - hence the
	 * strip, rather than a module counter incremented during render, which a discarded or
	 * StrictMode-doubled render would still consume.
	 */
	const instanceId = React.useId().replace(/[^a-zA-Z0-9_-]/g, '')
	const clipId = `ideallo-clip-${instanceId}`

	// Calculate hover filter - only apply when image is fully loaded to avoid flickering
	const hoverFilter =
		state === 'loaded' && isHovered
			? 'drop-shadow(0 0 6px var(--c-primary, #3b82f6)) drop-shadow(0 0 2px var(--c-primary, #3b82f6))'
			: state === 'loaded' && isEraserHovered
				? 'drop-shadow(0 0 6px #ef4444) drop-shadow(0 0 2px #ef4444)'
				: undefined

	return (
		<g className="ideallo-image" opacity={style.opacity}>
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

			{/* SVG <image> has no rx, so rounding is a clip path rather than a corner radius */}
			{rounded && (
				<defs>
					<clipPath id={clipId}>
						<rect x={x} y={y} width={width} height={height} rx={object.cornerRadius} />
					</clipPath>
				</defs>
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
					clipPath={rounded ? `url(#${clipId})` : undefined}
					style={{
						display: state === 'error' ? 'none' : 'block',
						opacity: state === 'loaded' ? 1 : 0,
						transition: 'opacity 0.15s ease-in',
						filter: hoverFilter
					}}
				/>
			)}

			{/* The optional border, drawn OVER the image so a rounded edge is not covered by it */}
			{hasBorder && (
				<rect
					x={x}
					y={y}
					width={width}
					height={height}
					rx={object.cornerRadius}
					fill="none"
					stroke={colorToCss(style.strokeColor)}
					strokeWidth={style.strokeWidth}
					pointerEvents="none"
				/>
			)}
		</g>
	)
}

// vim: ts=4
