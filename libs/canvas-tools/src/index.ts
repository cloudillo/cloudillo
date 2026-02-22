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
 * @cloudillo/canvas-tools
 *
 * Cloudillo canvas tools - rotation handle, pivot handle, transform gizmo
 * for interactive object manipulation in SVG canvas applications.
 */

// Components
export { RotationHandle } from './components/RotationHandle'
export type { RotationHandleProps } from './components/RotationHandle'

export { PivotHandle } from './components/PivotHandle'
export type { PivotHandleProps } from './components/PivotHandle'

export { TransformGizmo } from './components/TransformGizmo'
export type { TransformGizmoProps } from './components/TransformGizmo'

// Hooks
export { useTransformGizmo } from './hooks/useTransformGizmo'
export type {
	TransformGizmoOptions,
	TransformGizmoState,
	TransformGizmoHandlers,
	UseTransformGizmoReturn
} from './hooks/useTransformGizmo'

// Re-export commonly used types from react-svg-canvas for convenience
export type {
	Bounds,
	Point,
	ResizeHandle,
	RotationState,
	PivotState,
	GroupPivotState,
	RotatedObjectBounds,
	TransformedObject
} from 'react-svg-canvas'

// Re-export rotation utilities from react-svg-canvas
export {
	DEFAULT_SNAP_ANGLES,
	DEFAULT_SNAP_ZONE_RATIO,
	DEFAULT_PIVOT_SNAP_POINTS,
	DEFAULT_PIVOT_SNAP_THRESHOLD,
	normalizeAngle,
	getAngleFromCenter,
	snapAngle,
	calculatePivotCompensation,
	getPivotPosition,
	rotatePointAroundCenter,
	rotateObjectAroundPivot,
	getMaxDistanceFromPivot,
	isInSnapZone
} from 'react-svg-canvas'

// Coordinate utilities
export {
	getCanvasCoordinates,
	getCanvasCoordinatesWithElement,
	getSvgElement
} from './utils/coordinates'

// Rotation handle sizing
export {
	ARC_RADIUS_MIN_VIEWPORT_RATIO,
	ARC_RADIUS_MAX_VIEWPORT_RATIO,
	DEFAULT_ARC_PADDING,
	calculateArcRadius
} from './utils/rotation'
export type { CalculateArcRadiusOptions } from './utils/rotation'

// Re-export new geometry utilities from react-svg-canvas

// RotationMatrix - pre-calculated trigonometry for performance
export type { RotationMatrix } from 'react-svg-canvas'
export {
	createRotationMatrix,
	rotatePointWithMatrix,
	unrotatePointWithMatrix,
	rotateDeltaWithMatrix,
	unrotateDeltaWithMatrix
} from 'react-svg-canvas'

// View coordinate utilities
export {
	canvasToView,
	viewToCanvas,
	isPointInView,
	boundsIntersectsView
} from 'react-svg-canvas'

// Rotation-aware resize utilities
export type { ResizeState } from 'react-svg-canvas'
export {
	getAnchorForHandle,
	getRotatedAnchorPosition,
	calculateResizedDimensions,
	calculateResizedPosition,
	initResizeState,
	calculateResizeBounds
} from 'react-svg-canvas'

// Gradient types
export type {
	GradientType,
	GradientStop,
	Gradient,
	CompactGradient,
	GradientPresetCategory,
	GradientPreset
} from './types/gradient'

// Gradient utilities
export {
	DEFAULT_LINEAR_GRADIENT,
	DEFAULT_RADIAL_GRADIENT,
	expandGradient,
	compactGradient,
	gradientToCSS,
	createLinearGradientDef,
	createRadialGradientDef,
	addStop,
	removeStop,
	updateStop,
	sortStops,
	interpolateColor,
	getColorAtPosition,
	reverseStops
} from './utils/gradient'
export type {
	SVGGradientStop,
	LinearGradientDef,
	RadialGradientDef
} from './utils/gradient'

// Stacking utilities
export type { StackableObject, FindStackedOptions } from './utils/stacking'
export {
	calculateOverlapPercentage,
	findStackedObjects,
	findStackedObjectsForSelection
} from './utils/stacking'

// Gradient presets
export {
	GRADIENT_PRESETS,
	getPresetsByCategory,
	getPresetById,
	getCategories
} from './presets/gradients'

// GradientPicker components
export {
	GradientPicker,
	GradientBar,
	GradientPreview,
	GradientPresetGrid,
	AngleControl,
	DEFAULT_ANGLE_PRESETS,
	PositionControl
} from './components/GradientPicker'
export type {
	GradientPickerProps,
	GradientBarProps,
	GradientPreviewProps,
	GradientPresetGridProps,
	AngleControlProps,
	PositionControlProps
} from './components/GradientPicker'

// vim: ts=4
