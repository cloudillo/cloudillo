// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Renders ghost shapes from remote users via awareness
 * Shown as dashed shapes with user label
 */

import * as React from 'react'

import type { ConnectorContext } from '../connectors/index.js'
import { resolvePreviewRoute } from '../connectors/index.js'
import type { IdealloPresence } from '../hooks/index.js'
import { polygonPresetPoints } from '../tools/shape-presets.js'
import type { ShapePreview } from '../tools/types.js'
import { colorToCss } from '../utils/palette.js'
import { ConnectorPath } from './ConnectorPath.js'

const GHOST_OPACITY = 0.6
const GHOST_DASH_ARRAY = '6,4'

/**
 * A peer-supplied arrowhead is only usable if its size is a sane finite multiplier: `size` feeds
 * arrowheadBaseLength, where NaN becomes NaN in the emitted path `d` and an absurd value becomes
 * a head the size of the canvas. The PropertyBar's size control spans 50-300%, i.e. 0.5-3.0, so
 * 10 is a generous ceiling on anything a real peer can produce.
 *
 * `type` needs no check here - arrowheadGeometry switches on it and its default returns null.
 */
function isRenderableArrow(a: ShapePreview['startArrow']): boolean {
	if (!a || a.size === undefined) return true
	return Number.isFinite(a.size) && a.size > 0 && a.size <= 10
}

/**
 * Awareness is peer-controlled and never runtime-validated, and this is the one place the app
 * feeds remote geometry into the routers. A non-finite anchor survives clamp() in anchors.ts and
 * comes out as NaN in the emitted path `d`, so drop the whole ghost instead.
 */
export function isRenderableShape(s: ShapePreview): boolean {
	if (![s.startX, s.startY, s.endX, s.endY].every(Number.isFinite)) return false
	for (const a of [s.startAnchor, s.endAnchor]) {
		if (a && typeof a === 'object' && !(Number.isFinite(a.x) && Number.isFinite(a.y))) {
			return false
		}
	}
	if (!isRenderableArrow(s.startArrow) || !isRenderableArrow(s.endArrow)) return false
	return Number.isFinite(s.style?.strokeWidth)
}

export interface GhostShapesProps {
	remotePresence: Map<number, IdealloPresence>
	/** Shape lookup, so a remote connector preview routes against real geometry */
	connectorContext?: ConnectorContext
}

export function GhostShapes({ remotePresence, connectorContext }: GhostShapesProps) {
	return (
		<g className="ghost-shapes" pointerEvents="none">
			{Array.from(remotePresence.entries()).map(([clientId, presence]) => {
				if (!presence.shape || !isRenderableShape(presence.shape)) return null

				const { type, startX, startY, endX, endY, style } = presence.shape
				const user = presence.user

				// Normalize bounds
				const minX = Math.min(startX, endX)
				const minY = Math.min(startY, endY)
				const width = Math.abs(endX - startX)
				const height = Math.abs(endY - startY)

				const commonProps = {
					stroke: colorToCss(style.strokeColor),
					strokeWidth: style.strokeWidth,
					strokeDasharray: GHOST_DASH_ARRAY,
					fill: style.fillColor === 'transparent' ? 'none' : colorToCss(style.fillColor),
					opacity: GHOST_OPACITY
				}

				let shapeElement: React.ReactNode = null

				if (type === 'rect') {
					shapeElement = (
						<rect x={minX} y={minY} width={width} height={height} {...commonProps} />
					)
				} else if (type === 'ellipse') {
					shapeElement = (
						<ellipse
							cx={minX + width / 2}
							cy={minY + height / 2}
							rx={width / 2}
							ry={height / 2}
							{...commonProps}
						/>
					)
				} else if (type === 'diamond' || type === 'triangle') {
					shapeElement = (
						<polygon
							points={
								polygonPresetPoints(type, { x: minX, y: minY, width, height }) ?? ''
							}
							{...commonProps}
						/>
					)
				} else if (type === 'connector') {
					// A remote peer drawing a connector: re-resolve the route locally from the
					// bindings they broadcast, rather than sending derived geometry over the wire.
					const route = connectorContext
						? resolvePreviewRoute(
								{ ...presence.shape, strokeWidth: style.strokeWidth },
								connectorContext
							)
						: undefined
					shapeElement = (
						<ConnectorPath
							route={route}
							startX={startX}
							startY={startY}
							endX={endX}
							endY={endY}
							startArrow={presence.shape.startArrow}
							endArrow={presence.shape.endArrow}
							strokeWidth={style.strokeWidth}
							stroke={colorToCss(style.strokeColor)}
							strokeDasharray={GHOST_DASH_ARRAY}
							opacity={GHOST_OPACITY}
						/>
					)
				}

				return (
					<g key={`ghost-shape-${clientId}`}>
						{shapeElement}
						{/* User label at current position */}
						{user && (
							<text
								x={endX + 12}
								y={endY - 8}
								fill={user.color}
								fontSize={11}
								fontFamily="system-ui, sans-serif"
								fontWeight={500}
								opacity={GHOST_OPACITY}
							>
								{user.name}
							</text>
						)}
					</g>
				)
			})}
		</g>
	)
}

// vim: ts=4
