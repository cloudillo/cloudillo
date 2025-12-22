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

export type { UseSelectHandlerOptions, DragOffset } from './useSelectHandler.js'
export { useSelectHandler } from './useSelectHandler.js'

export type { UseEraserHandlerOptions, EraserPosition } from './useEraserHandler.js'
export { useEraserHandler } from './useEraserHandler.js'

// vim: ts=4
