// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * A shape's label, laid over the shape itself.
 *
 * Composed rather than swapped in: the shape renderer stays the sole source of the shape's
 * appearance and this only adds glyphs. No hit rect of its own either - the shape's own
 * `fill="transparent"` already provides one (see the note in ShapeRenderer.tsx).
 */

import { RichTextDisplay } from '@cloudillo/canvas-text'
import * as React from 'react'
import type * as Y from 'yjs'

import type { TextBearingObject } from '../crdt/index.js'
import { objectTextLayout } from '../utils/object-text.js'

export interface ObjectTextDisplayProps {
	object: TextBearingObject
	yText?: Y.Text
}

export function ObjectTextDisplay({ object, yText }: ObjectTextDisplayProps) {
	const { box, baseStyle, padding } = objectTextLayout(object)

	// A shape is born without text, so no Y.Text is the normal case rather than an error
	if (!yText) return null

	return (
		<RichTextDisplay
			x={box.x}
			y={box.y}
			width={box.width}
			height={box.height}
			yText={yText}
			baseStyle={baseStyle}
			containerStyle={{ padding, background: 'transparent' }}
		/>
	)
}

// vim: ts=4
