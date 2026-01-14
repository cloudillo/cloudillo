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
 * ObjectShape component - Renders a shape object on the canvas
 *
 * Supports rect, ellipse, line, and text object types with rotation and styling.
 * Memoized to prevent unnecessary re-renders when unrelated state changes.
 */

import * as React from 'react'
import { createLinearGradientDef, createRadialGradientDef } from '@cloudillo/canvas-tools'
import type { Gradient } from '@cloudillo/canvas-tools'
import type { PrezilloObject } from '../crdt'
import { resolveShapeStyle, resolveTextStyle } from '../crdt'
import { calculateRotationTransformFromBounds, buildStrokeProps, buildFillProps } from '../utils'
import { WrappedText } from './WrappedText'
import { ImageRenderer } from './ImageRenderer'
import { QRCodeRenderer } from './QRCodeRenderer'
import { PollFrameRenderer } from './PollFrameRenderer'
import { TableGridRenderer } from './TableGridRenderer'

/**
 * Render SVG gradient definition using library functions
 */
function GradientDef({ id, gradient }: { id: string; gradient: Gradient }) {
	if (gradient.type === 'linear' && gradient.stops) {
		const def = createLinearGradientDef(gradient.angle ?? 180, gradient.stops)
		return (
			<linearGradient id={id} x1={def.x1} y1={def.y1} x2={def.x2} y2={def.y2}>
				{def.stops.map((stop, i) => (
					<stop key={i} offset={stop.offset} stopColor={stop.stopColor} />
				))}
			</linearGradient>
		)
	}

	if (gradient.type === 'radial' && gradient.stops) {
		const def = createRadialGradientDef(
			gradient.centerX ?? 0.5,
			gradient.centerY ?? 0.5,
			gradient.stops
		)
		return (
			<radialGradient id={id} cx={def.cx} cy={def.cy} r={def.r}>
				{def.stops.map((stop, i) => (
					<stop key={i} offset={stop.offset} stopColor={stop.stopColor} />
				))}
			</radialGradient>
		)
	}

	return null
}

export interface ObjectShapeProps {
	object: PrezilloObject
	style: ReturnType<typeof resolveShapeStyle>
	textStyle: ReturnType<typeof resolveTextStyle>
	isSelected: boolean
	isHovered: boolean
	isStackedHighlight?: boolean // Shows when this object will move with a hovered object
	onClick: (e: React.MouseEvent) => void
	onDoubleClick?: (e: React.MouseEvent) => void
	onContextMenu?: (e: React.MouseEvent) => void
	onPointerDown?: (e: React.PointerEvent) => void
	onMouseEnter?: (e: React.MouseEvent) => void
	onMouseLeave?: (e: React.MouseEvent) => void
	// Optional bounds override for temporary state during drag/resize/rotate/pivot
	tempBounds?: {
		x: number
		y: number
		width: number
		height: number
		rotation?: number
		pivotX?: number
		pivotY?: number
	}
	// Image rendering props
	ownerTag?: string
	scale?: number
	// Show instance indicator
	showInstanceIndicator?: boolean
}

/**
 * Shallow equality check for style objects
 */
function shallowEqual(a: Record<string, any>, b: Record<string, any>): boolean {
	if (a === b) return true
	if (!a || !b) return false
	const keysA = Object.keys(a)
	const keysB = Object.keys(b)
	if (keysA.length !== keysB.length) return false
	for (const key of keysA) {
		if (a[key] !== b[key]) return false
	}
	return true
}

/**
 * Custom comparison function for React.memo
 * Only re-renders when relevant props change
 */
function arePropsEqual(prev: ObjectShapeProps, next: ObjectShapeProps): boolean {
	return (
		prev.object === next.object &&
		prev.isSelected === next.isSelected &&
		prev.isHovered === next.isHovered &&
		prev.isStackedHighlight === next.isStackedHighlight &&
		prev.tempBounds === next.tempBounds &&
		prev.showInstanceIndicator === next.showInstanceIndicator &&
		shallowEqual(prev.style, next.style) &&
		shallowEqual(prev.textStyle, next.textStyle)
	)
}

export const ObjectShape = React.memo(function ObjectShape({
	object,
	style,
	textStyle,
	isSelected,
	isHovered,
	isStackedHighlight,
	onClick,
	onDoubleClick,
	onContextMenu,
	onPointerDown,
	onMouseEnter,
	onMouseLeave,
	tempBounds,
	ownerTag,
	scale,
	showInstanceIndicator
}: ObjectShapeProps) {
	// Use temp bounds if provided, otherwise use object bounds
	const x = tempBounds?.x ?? object.x
	const y = tempBounds?.y ?? object.y
	const width = tempBounds?.width ?? object.width
	const height = tempBounds?.height ?? object.height
	const rotation = tempBounds?.rotation ?? object.rotation ?? 0
	const pivotX = tempBounds?.pivotX ?? object.pivotX ?? 0.5
	const pivotY = tempBounds?.pivotY ?? object.pivotY ?? 0.5

	// Apply rotation transform using centralized utility
	const rotationTransform = calculateRotationTransformFromBounds(
		x,
		y,
		width,
		height,
		rotation,
		pivotX,
		pivotY
	)

	// Object opacity (different from fill/stroke opacity)
	// Hidden objects render at 50% opacity in edit mode
	const baseOpacity = object.opacity ?? 1
	const hiddenMultiplier = object.hidden ? 0.5 : 1
	const finalOpacity = baseOpacity * hiddenMultiplier
	const objectOpacity = finalOpacity !== 1 ? finalOpacity : undefined

	const commonProps = {
		onClick,
		onDoubleClick,
		onContextMenu,
		onPointerDown,
		onPointerEnter: onMouseEnter,
		onPointerLeave: onMouseLeave,
		style: { cursor: 'pointer', pointerEvents: 'all' as const }
	}

	// Hover bounding box overlay (shown when hovered and not selected)
	const hoverOverlay =
		isHovered && !isSelected ? (
			<rect
				x={x - 1}
				y={y - 1}
				width={width + 2}
				height={height + 2}
				fill="none"
				stroke="#0066ff"
				strokeWidth={1}
				strokeOpacity={0.5}
				strokeDasharray="4 2"
				pointerEvents="none"
			/>
		) : null

	// Stacked highlight overlay (shown when this object will move with a hovered object)
	const stackedOverlay = isStackedHighlight ? (
		<rect
			x={x - 2}
			y={y - 2}
			width={width + 4}
			height={height + 4}
			fill="none"
			stroke="#0066ff"
			strokeWidth={2}
			strokeOpacity={0.7}
			strokeDasharray="6 3"
			pointerEvents="none"
		>
			{/* Subtle animation to draw attention */}
			<animate
				attributeName="stroke-dashoffset"
				from="0"
				to="18"
				dur="1s"
				repeatCount="indefinite"
			/>
		</rect>
	) : null

	// Instance indicator for prototype instances (small link icon in top-left)
	// Only show when object has prototypeId or showInstanceIndicator is true
	const isInstance = object.prototypeId !== undefined || showInstanceIndicator
	const indicatorScale = scale ? 1 / scale : 1
	const instanceIndicator = isInstance ? (
		<g
			transform={`translate(${x + 4 * indicatorScale}, ${y + 4 * indicatorScale}) scale(${indicatorScale})`}
			pointerEvents="none"
			className="instance-indicator"
		>
			{/* Small link/chain icon to indicate prototype instance */}
			<circle r="8" fill="rgba(0, 102, 255, 0.9)" />
			<path
				d="M-3 0h2.5a2.5 2.5 0 0 1 0 5h-2.5M3 0h-2.5a2.5 2.5 0 0 0 0 5h2.5M-1 2.5h2"
				transform="translate(0, -2.5) scale(0.8)"
				fill="none"
				stroke="white"
				strokeWidth="1.5"
				strokeLinecap="round"
			/>
		</g>
	) : null

	// Hidden indicator (crossed eye icon in top-right corner)
	// Always show for hidden objects so they're clearly identifiable
	const hiddenIndicator = object.hidden ? (
		<g
			transform={`translate(${x + width - 4 * indicatorScale}, ${y + 4 * indicatorScale}) scale(${indicatorScale})`}
			pointerEvents="none"
			className="hidden-indicator"
		>
			{/* Crossed eye icon to indicate hidden object */}
			<circle r="8" fill="rgba(100, 100, 100, 0.9)" />
			{/* Eye shape */}
			<ellipse cx="0" cy="0" rx="4" ry="2.5" fill="none" stroke="white" strokeWidth="1.2" />
			<circle cx="0" cy="0" r="1.2" fill="white" />
			{/* Diagonal slash */}
			<line
				x1="-4"
				y1="4"
				x2="4"
				y2="-4"
				stroke="white"
				strokeWidth="1.5"
				strokeLinecap="round"
			/>
		</g>
	) : null

	// Build SVG stroke and fill props using centralized utilities
	const strokeProps = buildStrokeProps(style, isSelected)
	const gradientId = style.fillGradient ? `grad-${object.id}` : null
	const fillProps = buildFillProps(style, gradientId)

	// Gradient definition element (if needed)
	const gradientDef =
		gradientId && style.fillGradient ? (
			<defs>
				<GradientDef id={gradientId} gradient={style.fillGradient} />
			</defs>
		) : null

	switch (object.type) {
		case 'rect':
			return (
				<g transform={rotationTransform} opacity={objectOpacity}>
					{gradientDef}
					<rect
						x={x}
						y={y}
						width={width}
						height={height}
						rx={
							typeof object.cornerRadius === 'number'
								? object.cornerRadius
								: undefined
						}
						{...fillProps}
						{...strokeProps}
						{...commonProps}
					/>
					{hoverOverlay}
					{stackedOverlay}
					{instanceIndicator}
					{hiddenIndicator}
				</g>
			)

		case 'ellipse':
			return (
				<g transform={rotationTransform} opacity={objectOpacity}>
					{gradientDef}
					<ellipse
						cx={x + width / 2}
						cy={y + height / 2}
						rx={width / 2}
						ry={height / 2}
						{...fillProps}
						{...strokeProps}
						{...commonProps}
					/>
					{hoverOverlay}
					{stackedOverlay}
					{instanceIndicator}
					{hiddenIndicator}
				</g>
			)

		case 'line':
			const points = object.points || [
				[0, height / 2],
				[width, height / 2]
			]
			return (
				<g transform={rotationTransform} opacity={objectOpacity}>
					<line
						x1={x + points[0][0]}
						y1={y + points[0][1]}
						x2={x + points[1][0]}
						y2={y + points[1][1]}
						{...strokeProps}
						{...commonProps}
					/>
					{hoverOverlay}
					{stackedOverlay}
					{instanceIndicator}
					{hiddenIndicator}
				</g>
			)

		case 'text':
			const textContent = object.text || ''
			const isEmpty = textContent.trim() === ''
			return (
				<g transform={rotationTransform} opacity={objectOpacity} {...commonProps}>
					<WrappedText
						x={x}
						y={y}
						width={width}
						height={height}
						text={isEmpty ? 'Click to add text' : textContent}
						textStyle={textStyle}
						isPlaceholder={isEmpty}
					/>
					{/* Invisible rect for click handling since foreignObject has pointerEvents: none */}
					<rect
						x={x}
						y={y}
						width={width}
						height={height}
						fill="transparent"
						stroke="none"
					/>
					{hoverOverlay}
					{stackedOverlay}
					{instanceIndicator}
					{hiddenIndicator}
				</g>
			)

		case 'image':
			return (
				<g transform={rotationTransform} opacity={objectOpacity} {...commonProps}>
					<ImageRenderer
						object={object}
						ownerTag={ownerTag}
						scale={scale}
						bounds={{ x, y, width, height }}
					/>
					{/* Invisible rect for click handling */}
					<rect
						x={x}
						y={y}
						width={width}
						height={height}
						fill="transparent"
						stroke="none"
					/>
					{hoverOverlay}
					{stackedOverlay}
					{instanceIndicator}
					{hiddenIndicator}
				</g>
			)

		case 'qrcode':
			return (
				<g transform={rotationTransform} opacity={objectOpacity} {...commonProps}>
					<QRCodeRenderer object={object} bounds={{ x, y, width, height }} />
					{/* Invisible rect for click handling */}
					<rect
						x={x}
						y={y}
						width={width}
						height={height}
						fill="transparent"
						stroke="none"
					/>
					{hoverOverlay}
					{stackedOverlay}
					{instanceIndicator}
					{hiddenIndicator}
				</g>
			)

		case 'pollframe':
			return (
				<g transform={rotationTransform} opacity={objectOpacity} {...commonProps}>
					<PollFrameRenderer
						object={object}
						style={style}
						textStyle={textStyle}
						bounds={{ x, y, width, height }}
						voteCount={0}
						isWinner={false}
						hasMyVote={false}
						isInteractive={false}
						isEditMode={true}
					/>
					{hoverOverlay}
					{stackedOverlay}
					{instanceIndicator}
					{hiddenIndicator}
				</g>
			)

		case 'tablegrid':
			return (
				<g transform={rotationTransform} opacity={objectOpacity} {...commonProps}>
					<TableGridRenderer
						object={object}
						style={style}
						bounds={{ x, y, width, height }}
					/>
					{/* Invisible rect for click handling */}
					<rect
						x={x}
						y={y}
						width={width}
						height={height}
						fill="transparent"
						stroke="none"
					/>
					{hoverOverlay}
					{stackedOverlay}
					{instanceIndicator}
					{hiddenIndicator}
				</g>
			)

		default:
			// Fallback rectangle for unsupported types
			return (
				<g transform={rotationTransform} opacity={objectOpacity}>
					{gradientDef}
					<rect
						x={x}
						y={y}
						width={width}
						height={height}
						{...fillProps}
						{...strokeProps}
						{...commonProps}
					/>
					{hoverOverlay}
					{stackedOverlay}
					{instanceIndicator}
					{hiddenIndicator}
				</g>
			)
	}
}, arePropsEqual)

// vim: ts=4
