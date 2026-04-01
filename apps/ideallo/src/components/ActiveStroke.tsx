// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Renders the currently active stroke being drawn
 * Uses direct path for responsiveness (no smoothing during draw)
 */

import * as React from 'react'
import type { ActiveStroke as ActiveStrokeType } from '../hooks/index.js'
import { pointsToSvgPath } from '../utils/index.js'
import { colorToCss } from '../utils/palette.js'

export interface ActiveStrokeProps {
	stroke: ActiveStrokeType
}

export function ActiveStroke({ stroke }: ActiveStrokeProps) {
	const pathData = React.useMemo(() => {
		return pointsToSvgPath(stroke.points)
	}, [stroke.points])

	return (
		<path
			d={pathData}
			fill="none"
			stroke={colorToCss(stroke.style.color)}
			strokeWidth={stroke.style.width}
			strokeLinecap="round"
			strokeLinejoin="round"
			pointerEvents="none"
		/>
	)
}

// vim: ts=4
