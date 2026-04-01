// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Hooks barrel export
 */

export type { IdealloPresence, UseIdealloDocumentResult } from './useIdealloDocument.js'
export { useIdealloDocument } from './useIdealloDocument.js'

export type { ActiveStroke, UndoableStroke } from './useDrawingState.js'
export { useDrawingState } from './useDrawingState.js'

export type { UseDrawingHandlerOptions } from './useDrawingHandler.js'
export { useDrawingHandler } from './useDrawingHandler.js'

export type { UseShapeHandlerOptions } from './useShapeHandler.js'
export { useShapeHandler } from './useShapeHandler.js'

export type { UseTextHandlerOptions } from './useTextHandler.js'
export { useTextHandler } from './useTextHandler.js'

export type { UseStickyHandlerOptions } from './useStickyHandler.js'
export { useStickyHandler } from './useStickyHandler.js'

export type { UseTextLabelHandlerOptions } from './useTextLabelHandler.js'
export { useTextLabelHandler } from './useTextLabelHandler.js'

export type { UseSelectHandlerOptions, DragOffset } from './useSelectHandler.js'
export { useSelectHandler } from './useSelectHandler.js'

export type { UseEraserHandlerOptions, EraserPosition } from './useEraserHandler.js'
export { useEraserHandler } from './useEraserHandler.js'

export type { UseImageHandlerOptions } from './useImageHandler.js'
export { useImageHandler } from './useImageHandler.js'

export type { UseDocumentHandlerOptions } from './useDocumentHandler.js'
export { useDocumentHandler } from './useDocumentHandler.js'

export { useIsMobile } from './useIsMobile.js'

// vim: ts=4
