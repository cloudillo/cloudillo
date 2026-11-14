// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import * as React from 'react'

export interface UnsupportedObjectPlaceholderProps extends React.SVGProps<SVGRectElement> {
	x: number
	y: number
	width: number
	height: number
	label: string
}

/**
 * Labelled dashed box for an object type from a newer client. A raw record may carry a negative
 * size, which <rect> would not draw: it is normalised. Extra props go on the <rect>.
 */
export function UnsupportedObjectPlaceholder({
	x,
	y,
	width,
	height,
	label,
	...rectProps
}: UnsupportedObjectPlaceholderProps) {
	const x0 = Math.min(x, x + width)
	const y0 = Math.min(y, y + height)
	const w = Math.abs(width)
	const h = Math.abs(height)
	return (
		<>
			<rect
				x={x0}
				y={y0}
				width={w}
				height={h}
				fill="rgba(128,128,128,0.1)"
				stroke="#888"
				strokeDasharray="6 4"
				{...rectProps}
			/>
			<text
				x={x0 + w / 2}
				y={y0 + h / 2}
				textAnchor="middle"
				dominantBaseline="middle"
				fontSize={14}
				fill="#888"
				pointerEvents="none"
			>
				{label}
			</text>
		</>
	)
}

// vim: ts=4
