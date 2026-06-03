// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * @cloudillo/canvas-text - Rich text display, editing, and SVG export
 *
 * Public API for canvas apps (prezillo, ideallo) to render and edit
 * rich text with collaborative editing via Yjs.
 */

export type { RichTextDisplayProps } from './components/RichTextDisplay'
// Components
export { RichTextDisplay } from './components/RichTextDisplay'
export type { RichTextEditorProps } from './components/RichTextEditor'
export { RichTextEditor } from './components/RichTextEditor'
// Delta parsing
export { deltaToLines, deltaToPlainText, plainTextToDelta, yTextToDelta } from './delta-parser'
// Layout
export { calculateRichTextLayout } from './layout'
export type { ResolvedRunStyle } from './measure'
// Measurement
export { buildFontString, measureRunWidth, measureTextWidth, resolveRunStyle } from './measure'
// SVG export
export { createRichTextSVGElement, richTextToSVG } from './svg-export'
// Types
export type {
	BaseTextStyle,
	ContainerStyle,
	DeltaOp,
	PositionedLine,
	PositionedRun,
	RichTextLayout,
	RichTextRunStyle,
	TextBounds,
	TextLine,
	TextRun
} from './types'

// vim: ts=4
