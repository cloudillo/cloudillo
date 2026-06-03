// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * React hooks exports
 */

export type {
	UseCanvasEventHandlersOptions,
	UseCanvasEventHandlersResult
} from './useCanvasEventHandlers'
export { useCanvasEventHandlers } from './useCanvasEventHandlers'
export type { UseCanvasViewportOptions, UseCanvasViewportResult } from './useCanvasViewport'
export { useCanvasViewport } from './useCanvasViewport'
export type { UseDocumentHandlerOptions } from './useDocumentHandler'
export { useDocumentHandler } from './useDocumentHandler'
export type { UseImageHandlerOptions } from './useImageHandler'
export { useImageHandler } from './useImageHandler'
export type {
	InteractionStartRef,
	StoredSelection,
	UseInteractionHooksOptions,
	UseInteractionHooksResult
} from './useInteractionHooks'
export { useInteractionHooks } from './useInteractionHooks'
export type { UseLockablePropertyResult } from './useLockableProperty'
export { useLockableProperty } from './useLockableProperty'
export type {
	DragState,
	TempObjectState,
	UseObjectDragOptions,
	UseObjectDragResult
} from './useObjectDrag'
export { useObjectDrag } from './useObjectDrag'
export type { UsePaletteReturn } from './usePalette'
export { usePalette, usePaletteValue } from './usePalette'
export type {
	UsePresentationModeOptions,
	UsePresentationModeResult
} from './usePresentationMode.js'
export { usePresentationMode } from './usePresentationMode.js'
export type { UsePrezilloDocumentResult } from './usePrezilloDocument'
export { usePrezilloDocument } from './usePrezilloDocument'
export type { SnapSettings, UseSnapSettingsResult } from './useSnappingConfig'
export { useGetParent, useSnappingConfig, useSnapSettings } from './useSnappingConfig'
export type { UseTableGridSnapsResult } from './useTableGridSnaps'
export { generateTableGridSnapTargets, useTableGridSnaps } from './useTableGridSnaps'
export type { UseTemplateGuidesResult } from './useTemplateGuides'
export { guideToSnapTargets, useTemplateGuides } from './useTemplateGuides'
export type { TemplateLayout } from './useTemplateLayout'
export { useTemplateLayout } from './useTemplateLayout'
export type { TemplateEditingContext } from './useTemplateObjects'
export { useTemplateObjects } from './useTemplateObjects'
export type { TemplateWithUsage, UseTemplatesResult } from './useTemplates'
export { useTemplates } from './useTemplates'
export type { UseTextEditingOptions, UseTextEditingResult } from './useTextEditing'
export { useTextEditing } from './useTextEditing'
export type { UseTextStylingOptions, UseTextStylingResult } from './useTextStyling'
export { useTextStyling } from './useTextStyling'
export type { UseToolHandlersOptions, UseToolHandlersResult } from './useToolHandlers'
export { useToolHandlers } from './useToolHandlers'
export type { UseViewNavigationOptions, UseViewNavigationResult } from './useViewNavigation'
export { useViewNavigation } from './useViewNavigation'
export { useViewObjectIds, useViewObjects, useVisibleViewObjects } from './useViewObjects'
export { useViews } from './useViews'
export { useVisibleViews } from './useVisibleViews'

// vim: ts=4
