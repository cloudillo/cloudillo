// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * React hooks exports
 */

export { usePrezilloDocument } from './usePrezilloDocument'
export type { UsePrezilloDocumentResult } from './usePrezilloDocument'

export { useViewObjects, useViewObjectIds, useVisibleViewObjects } from './useViewObjects'
export { useVisibleViews } from './useVisibleViews'
export { useViews } from './useViews'
export { useSnappingConfig, useGetParent, useSnapSettings } from './useSnappingConfig'
export type { SnapSettings, UseSnapSettingsResult } from './useSnappingConfig'

export { useImageHandler } from './useImageHandler'
export type { UseImageHandlerOptions } from './useImageHandler'

export { useDocumentHandler } from './useDocumentHandler'
export type { UseDocumentHandlerOptions } from './useDocumentHandler'

export { usePalette, usePaletteValue } from './usePalette'
export type { UsePaletteReturn } from './usePalette'

export { useTemplateGuides, guideToSnapTargets } from './useTemplateGuides'
export type { UseTemplateGuidesResult } from './useTemplateGuides'

export { useTemplateObjects } from './useTemplateObjects'
export type { TemplateEditingContext } from './useTemplateObjects'

export { useTemplates } from './useTemplates'
export type { TemplateWithUsage, UseTemplatesResult } from './useTemplates'

export { useTemplateLayout } from './useTemplateLayout'
export type { TemplateLayout } from './useTemplateLayout'

export { useLockableProperty } from './useLockableProperty'
export type { UseLockablePropertyResult } from './useLockableProperty'

export { useTextEditing } from './useTextEditing'
export type { UseTextEditingOptions, UseTextEditingResult } from './useTextEditing'

export { useTextStyling } from './useTextStyling'
export type { UseTextStylingOptions, UseTextStylingResult } from './useTextStyling'

export { usePresentationMode } from './usePresentationMode.js'
export type {
	UsePresentationModeOptions,
	UsePresentationModeResult
} from './usePresentationMode.js'

export { useViewNavigation } from './useViewNavigation'
export type { UseViewNavigationOptions, UseViewNavigationResult } from './useViewNavigation'

export { useObjectDrag } from './useObjectDrag'
export type {
	UseObjectDragOptions,
	UseObjectDragResult,
	DragState,
	TempObjectState
} from './useObjectDrag'

export { useTableGridSnaps, generateTableGridSnapTargets } from './useTableGridSnaps'
export type { UseTableGridSnapsResult } from './useTableGridSnaps'

export { useCanvasViewport } from './useCanvasViewport'
export type { UseCanvasViewportOptions, UseCanvasViewportResult } from './useCanvasViewport'

export { useInteractionHooks } from './useInteractionHooks'
export type {
	StoredSelection,
	InteractionStartRef,
	UseInteractionHooksOptions,
	UseInteractionHooksResult
} from './useInteractionHooks'

export { useToolHandlers } from './useToolHandlers'
export type { UseToolHandlersOptions, UseToolHandlersResult } from './useToolHandlers'

export { useCanvasEventHandlers } from './useCanvasEventHandlers'
export type {
	UseCanvasEventHandlersOptions,
	UseCanvasEventHandlersResult
} from './useCanvasEventHandlers'

// vim: ts=4
