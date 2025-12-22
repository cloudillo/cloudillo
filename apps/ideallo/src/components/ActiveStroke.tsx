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
