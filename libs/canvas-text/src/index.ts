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
