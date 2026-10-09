// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Renders a frame: a named region drawn behind its contents, with its title above the top-left
 * corner at a screen-constant size. Rotation is handled by the ObjectRenderer wrapper.
 *
 * `pointer-events: none` throughout: hit-testing is `hitTestObject`'s frame branch, where a
 * filled body is grabbable and an unfilled one is only its edge band and title.
 */

import * as React from 'react'
import { useTranslation } from 'react-i18next'

import type { FrameObject } from '../crdt/runtime-types.js'
import { FRAME_TITLE_FONT_PX, FRAME_TITLE_GAP_PX, frameTitle } from '../utils/hit-testing.js'
import { colorToCss } from '../utils/palette.js'

export interface FrameRendererProps {
	object: FrameObject
	/** Canvas zoom, so the title stays the same size on screen */
	scale?: number
}

export function FrameRenderer({ object, scale = 1 }: FrameRendererProps) {
	const { t } = useTranslation()
	const { x, y, width, height, style } = object

	return (
		<>
			<rect
				x={x}
				y={y}
				width={width}
				height={height}
				fill={colorToCss(style.fillColor)}
				stroke={colorToCss(style.strokeColor)}
				strokeWidth={style.strokeWidth}
				strokeDasharray={
					style.strokeStyle === 'dashed'
						? '8,4'
						: style.strokeStyle === 'dotted'
							? '2,4'
							: undefined
				}
				opacity={style.opacity}
				pointerEvents="none"
			/>
			<text
				x={x}
				y={y - FRAME_TITLE_GAP_PX / scale}
				fontSize={FRAME_TITLE_FONT_PX / scale}
				fill="var(--col-on-container, currentColor)"
				opacity={0.7}
				style={{ userSelect: 'none' }}
			>
				{frameTitle(object, t('Frame'))}
			</text>
		</>
	)
}

// vim: ts=4
