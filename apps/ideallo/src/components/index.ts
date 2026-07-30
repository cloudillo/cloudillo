// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Components barrel export
 */

export { RotationHandle, type RotationHandleProps } from '@cloudillo/canvas-tools'

export { ActiveStroke, type ActiveStrokeProps } from './ActiveStroke.js'
export { Canvas, type CanvasHandle, type CanvasProps } from './Canvas.js'
export { ColorPalette, type ColorPaletteProps } from './ColorPalette.js'
export {
	ConnectorAnchorDots,
	type ConnectorAnchorDotsProps
} from './ConnectorAnchorDots.js'
export {
	ConnectorEndpointHandles,
	type ConnectorEndpointHandlesProps,
	type TerminalState,
	terminalState
} from './ConnectorEndpointHandles.js'
export { ConnectorPath, type ConnectorPathProps } from './ConnectorPath.js'
export { Cursors, type CursorsProps } from './Cursors.js'
export { FreehandPath, type FreehandPathProps } from './FreehandPath.js'
export { GhostEditing, type GhostEditingProps } from './GhostEditing.js'
export { GhostShapes, type GhostShapesProps } from './GhostShapes.js'
export { GhostStrokes, type GhostStrokesProps } from './GhostStrokes.js'
export { ObjectRenderer, type ObjectRendererProps } from './ObjectRenderer.js'
export { ObjectTextDisplay, type ObjectTextDisplayProps } from './ObjectTextDisplay.js'
export {
	ObjectTextEditOverlay,
	type ObjectTextEditOverlayProps
} from './ObjectTextEditOverlay.js'
export { PropertyBar, type PropertyBarProps } from './PropertyBar.js'
export { ShapePreview, type ShapePreviewProps } from './ShapePreview.js'
export { ConnectorRenderer, EllipseRenderer, RectRenderer } from './ShapeRenderer.js'
export { StickyNote, type StickyNoteProps } from './StickyNote.js'
export { TextLabel, type TextLabelProps } from './TextLabel.js'
export { Toolbar, type ToolbarProps } from './Toolbar.js'
export {
	ToolPopover,
	type ToolPopoverItem,
	type ToolPopoverProps,
	type ToolPopoverSection
} from './ToolPopover.js'
export { ZoomControls, type ZoomControlsProps } from './ZoomControls.js'

// vim: ts=4
