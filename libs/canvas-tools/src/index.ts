// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * @cloudillo/canvas-tools
 *
 * Cloudillo canvas tools - rotation handle, pivot handle, transform gizmo
 * for interactive object manipulation in SVG canvas applications.
 */

// Re-export commonly used types from react-svg-canvas for convenience
export type {
	Bounds,
	GroupPivotState,
	PivotState,
	Point,
	ResizeHandle,
	RotatedObjectBounds,
	RotationState,
	TransformedObject
} from 'react-svg-canvas'
// Re-export rotation utilities from react-svg-canvas
export {
	calculatePivotCompensation,
	DEFAULT_PIVOT_SNAP_POINTS,
	DEFAULT_PIVOT_SNAP_THRESHOLD,
	DEFAULT_SNAP_ANGLES,
	DEFAULT_SNAP_ZONE_RATIO,
	getAngleFromCenter,
	getMaxDistanceFromPivot,
	getPivotPosition,
	isInSnapZone,
	normalizeAngle,
	rotateObjectAroundPivot,
	rotatePointAroundCenter,
	snapAngle
} from 'react-svg-canvas'

export type { PivotHandleProps } from './components/PivotHandle'
export { PivotHandle } from './components/PivotHandle'
export type { RotationHandleProps } from './components/RotationHandle'
// Components
export { RotationHandle } from './components/RotationHandle'
// Coordinate utilities
export {
	getCanvasCoordinates,
	getCanvasCoordinatesWithElement,
	getSvgElement
} from './utils/coordinates'
export type { CalculateArcRadiusOptions } from './utils/rotation'
// Rotation handle sizing
export { calculateArcRadius } from './utils/rotation'

// Re-export new geometry utilities from react-svg-canvas

// RotationMatrix - pre-calculated trigonometry for performance
// Rotation-aware resize utilities
export type { ResizeState, RotationMatrix } from 'react-svg-canvas'
// View coordinate utilities
export {
	boundsIntersectsView,
	calculateResizeBounds,
	calculateResizedDimensions,
	calculateResizedPosition,
	canvasToView,
	createRotationMatrix,
	getAnchorForHandle,
	getRotatedAnchorPosition,
	initResizeState,
	isPointInView,
	rotateDeltaWithMatrix,
	rotatePointWithMatrix,
	unrotateDeltaWithMatrix,
	unrotatePointWithMatrix,
	viewToCanvas
} from 'react-svg-canvas'

export type {
	GradientBarProps,
	GradientPickerProps,
	GradientPresetGridProps,
	GradientPreviewProps
} from './components/GradientPicker'
// GradientPicker components
export {
	GradientBar,
	GradientPicker,
	GradientPresetGrid,
	GradientPreview
} from './components/GradientPicker'
// Gradient presets
export {
	GRADIENT_PRESETS,
	getCategories,
	getPresetById,
	getPresetsByCategory
} from './presets/gradients'
// Gradient types
export type {
	CompactGradient,
	Gradient,
	GradientPreset,
	GradientPresetCategory,
	GradientStop,
	GradientType
} from './types/gradient'
// Shared stored-code vocabularies (prezillo/ideallo type-converters)
export {
	ANCHOR_CODE,
	ARROW_TYPE_CODE,
	ROUTING_CODE,
	TEXT_ALIGN_CODE,
	VERT_ALIGN_CODE
} from './utils/code-maps'
export type {
	LinearGradientDef,
	RadialGradientDef,
	SVGGradientStop
} from './utils/gradient'
// Gradient utilities
export {
	addStop,
	compactGradient,
	createLinearGradientDef,
	createRadialGradientDef,
	DEFAULT_LINEAR_GRADIENT,
	DEFAULT_RADIAL_GRADIENT,
	expandGradient,
	getColorAtPosition,
	gradientToCSS,
	interpolateColor,
	sortStops,
	updateStop
} from './utils/gradient'
// Stacking utilities
export type { FindStackedOptions, StackableObject, ZOrderOp } from './utils/stacking'
export {
	calculateOverlapPercentage,
	findStackedObjects,
	findStackedObjectsForSelection,
	zOrderTarget
} from './utils/stacking'

// vim: ts=4
