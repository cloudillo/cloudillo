// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Tools barrel export
 */

export type { ToolCategory, ToolDescriptor } from './catalog.js'
export {
	CATEGORY_LABELS,
	CATEGORY_ORDER,
	isDragShapeTool,
	TOOL_BY_KEY,
	TOOL_CATALOG,
	TOOL_LABELS,
	TOOLS_BY_CATEGORY
} from './catalog.js'
export {
	ALWAYS_REVERT_TOOLS,
	CONTINUOUS_TOOLS,
	isCommittableShapePreview,
	isOneShotTool,
	nextToolAfterUse,
	shouldRemoveOnEditEnd,
	shouldSelectAfterUse
} from './lifecycle.js'
export type { PolygonPreset } from './shape-presets.js'
export {
	POLYGON_PRESETS,
	polygonPresetPoints,
	polygonPresetVertices,
	TOOL_TO_POLYGON_PRESET
} from './shape-presets.js'
export type {
	CaretPoint,
	DragShapeTool,
	ObjectEditState,
	ShapePreview,
	ToolContext,
	ToolType
} from './types.js'

// vim: ts=4
