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
import type { PrezilloObject } from '../crdt'
import { resolveShapeStyle, resolveTextStyle } from '../crdt'
import { WrappedText } from './WrappedText'

export interface ObjectShapeProps {
	object: PrezilloObject
	style: ReturnType<typeof resolveShapeStyle>
	textStyle: ReturnType<typeof resolveTextStyle>
	isSelected: boolean
	isHovered: boolean
	onClick: (e: React.MouseEvent) => void
	onDoubleClick?: (e: React.MouseEvent) => void
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
	// Check text content for text objects
	const prevText = prev.object.type === 'text' ? prev.object.text : undefined
	const nextText = next.object.type === 'text' ? next.object.text : undefined

	return (
		prev.object.id === next.object.id &&
		prev.object.x === next.object.x &&
		prev.object.y === next.object.y &&
		prev.object.width === next.object.width &&
		prev.object.height === next.object.height &&
		prev.object.rotation === next.object.rotation &&
		prev.object.pivotX === next.object.pivotX &&
		prev.object.pivotY === next.object.pivotY &&
		prev.object.opacity === next.object.opacity &&
		prev.object.type === next.object.type &&
		prevText === nextText &&
		prev.isSelected === next.isSelected &&
		prev.isHovered === next.isHovered &&
		prev.tempBounds === next.tempBounds &&
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
	onClick,
	onDoubleClick,
	onPointerDown,
	onMouseEnter,
	onMouseLeave,
	tempBounds
}: ObjectShapeProps) {
	// Use temp bounds if provided, otherwise use object bounds
	const x = tempBounds?.x ?? object.x
	const y = tempBounds?.y ?? object.y
	const width = tempBounds?.width ?? object.width
	const height = tempBounds?.height ?? object.height
	const rotation = tempBounds?.rotation ?? object.rotation
	const pivotX = tempBounds?.pivotX ?? object.pivotX ?? 0.5
	const pivotY = tempBounds?.pivotY ?? object.pivotY ?? 0.5

	// Calculate pivot point in absolute coordinates
	const cx = x + width * pivotX
	const cy = y + height * pivotY

	// Apply rotation transform if non-zero
	const rotationTransform = rotation !== 0 ? `rotate(${rotation} ${cx} ${cy})` : undefined

	// Object opacity (different from fill/stroke opacity)
	const objectOpacity =
		object.opacity !== undefined && object.opacity !== 1 ? object.opacity : undefined

	const commonProps = {
		onClick,
		onDoubleClick,
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

	const strokeProps = {
		stroke: style.stroke,
		strokeWidth: isSelected ? style.strokeWidth + 2 : style.strokeWidth,
		strokeOpacity: style.strokeOpacity,
		strokeDasharray: style.strokeDasharray || undefined,
		strokeLinecap: style.strokeLinecap,
		strokeLinejoin: style.strokeLinejoin
	}

	const fillProps = {
		fill: style.fill === 'none' ? 'transparent' : style.fill,
		fillOpacity: style.fillOpacity
	}

	switch (object.type) {
		case 'rect':
			return (
				<g transform={rotationTransform} opacity={objectOpacity}>
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
				</g>
			)

		case 'ellipse':
			return (
				<g transform={rotationTransform} opacity={objectOpacity}>
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
						text={isEmpty ? 'Double-click to edit' : textContent}
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
				</g>
			)

		default:
			// Fallback rectangle for unsupported types
			return (
				<g transform={rotationTransform} opacity={objectOpacity}>
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
				</g>
			)
	}
}, arePropsEqual)

// vim: ts=4
