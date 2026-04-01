// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * @cloudillo/canvas-text - Rich text display, editing, and SVG export
 *
 * Public API for canvas apps (prezillo, ideallo) to render and edit
 * rich text with collaborative editing via Yjs.
 */

// Types
export type {
	RichTextRunStyle,
	TextRun,
	TextLine,
	PositionedRun,
	PositionedLine,
	RichTextLayout,
	BaseTextStyle,
	TextBounds,
	ContainerStyle,
	DeltaOp
} from './types'

// Delta parsing
export { deltaToLines, yTextToDelta, plainTextToDelta, deltaToPlainText } from './delta-parser'

// Measurement
export { resolveRunStyle, measureRunWidth, measureTextWidth, buildFontString } from './measure'
export type { ResolvedRunStyle } from './measure'

// Layout
export { calculateRichTextLayout } from './layout'

// SVG export
export { richTextToSVG, createRichTextSVGElement } from './svg-export'

// Components
export { RichTextDisplay } from './components/RichTextDisplay'
export type { RichTextDisplayProps } from './components/RichTextDisplay'
export { RichTextEditor } from './components/RichTextEditor'
export type { RichTextEditorProps } from './components/RichTextEditor'

// vim: ts=4
