// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
/**
 * Renders shape preview during creation (before commit)
 */

import type { ConnectorContext } from '../connectors/index.js'
import { resolvePreviewRoute } from '../connectors/resolve.js'
import type { ShapePreview as ShapePreviewType } from '../tools/index.js'
import { polygonPresetPoints } from '../tools/shape-presets.js'
import { colorToCss } from '../utils/palette.js'
import { ConnectorPath } from './ConnectorPath.js'

export interface ShapePreviewProps {
	preview: ShapePreviewType
	/** Shape lookup, so a connector preview can route against real geometry */
	connectorContext?: ConnectorContext
}

export function ShapePreview({ preview, connectorContext }: ShapePreviewProps) {
	const { type, startX, startY, endX, endY, style } = preview

	// Normalize bounds for rect/ellipse
	const minX = Math.min(startX, endX)
	const minY = Math.min(startY, endY)
	const width = Math.abs(endX - startX)
	const height = Math.abs(endY - startY)

	const commonProps = {
		fill: colorToCss(style.fillColor),
		stroke: colorToCss(style.strokeColor),
		strokeWidth: style.strokeWidth,
		strokeLinecap: 'round' as const,
		strokeLinejoin: 'round' as const,
		opacity: 0.7
	}

	if (type === 'rect') {
		return <rect x={minX} y={minY} width={width} height={height} {...commonProps} />
	}

	if (type === 'ellipse') {
		return (
			<ellipse
				cx={minX + width / 2}
				cy={minY + height / 2}
				rx={width / 2}
				ry={height / 2}
				{...commonProps}
			/>
		)
	}

	// Diamond and triangle: the SAME vertex builder the commit path uses, so what lands on release
	// is exactly what was previewed
	const points = polygonPresetPoints(type, { x: minX, y: minY, width, height })
	if (points) {
		return <polygon points={points} {...commonProps} />
	}

	if (type === 'connector') {
		// Routed through the same component - and, when bound, the same routers - as the
		// committed object, so the preview cannot disagree with what lands on release.
		const route = connectorContext
			? resolvePreviewRoute({ ...preview, strokeWidth: style.strokeWidth }, connectorContext)
			: undefined
		return (
			<ConnectorPath
				route={route}
				startX={startX}
				startY={startY}
				endX={endX}
				endY={endY}
				startArrow={preview.startArrow}
				endArrow={preview.endArrow}
				strokeWidth={style.strokeWidth}
				stroke={colorToCss(style.strokeColor)}
				opacity={0.7}
			/>
		)
	}

	return null
}

// vim: ts=4
