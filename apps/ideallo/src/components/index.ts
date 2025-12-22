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
 * Components barrel export
 */

export { Canvas, type CanvasProps, type CanvasHandle } from './Canvas.js'
export { FreehandPath, type FreehandPathProps } from './FreehandPath.js'
export { ActiveStroke, type ActiveStrokeProps } from './ActiveStroke.js'
export { GhostStrokes, type GhostStrokesProps } from './GhostStrokes.js'
export { GhostShapes, type GhostShapesProps } from './GhostShapes.js'
export { GhostEditing, type GhostEditingProps } from './GhostEditing.js'
export { Cursors, type CursorsProps } from './Cursors.js'
export { ObjectRenderer, type ObjectRendererProps } from './ObjectRenderer.js'
export { ShapePreview, type ShapePreviewProps } from './ShapePreview.js'
export { RectRenderer, EllipseRenderer, LineRenderer, ArrowRenderer } from './ShapeRenderer.js'
export { TextLabel, type TextLabelProps } from './TextLabel.js'
export { TextInput, type TextInputProps } from './TextInput.js'
export { StickyNote, type StickyNoteProps } from './StickyNote.js'
export { RotationHandle, type RotationHandleProps } from '@cloudillo/canvas-tools'
export { Toolbar, type ToolbarProps } from './Toolbar.js'
export { ZoomControls, type ZoomControlsProps } from './ZoomControls.js'
export { PropertyBar, type PropertyBarProps } from './PropertyBar.js'
export { ColorPalette, type ColorPaletteProps } from './ColorPalette.js'

// vim: ts=4
