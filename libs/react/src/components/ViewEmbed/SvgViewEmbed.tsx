// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * `DocViewEmbed` inside an SVG `foreignObject`, for canvas hosts. The canvas object's box is
 * the frame, so sizing is always `box`.
 */

import * as React from 'react'

import { DocViewEmbed, type DocViewEmbedProps } from './ViewEmbed.js'

export interface SvgViewEmbedProps extends Omit<DocViewEmbedProps, 'box'> {
	x: number
	y: number
	width: number
	height: number
}

export function SvgViewEmbed({ x, y, width, height, settings, ...props }: SvgViewEmbedProps) {
	return (
		<foreignObject x={x} y={y} width={width} height={height} className="cl-view-embed-fo">
			<DocViewEmbed
				{...props}
				settings={{ ...settings, sizing: 'box' }}
				box={{ w: width, h: height }}
			/>
		</foreignObject>
	)
}

// vim: ts=4
