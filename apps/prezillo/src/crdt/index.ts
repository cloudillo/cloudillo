// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * CRDT module - main exports
 */

// IDs and generators
export * from './ids'

// Type definitions
export type {
	// Stored types
	YPrezilloDocument,
	StoredObject,
	StoredContainer,
	StoredView,
	StoredStyle,
	StoredMeta,
	StoredSymbol,
	StoredStateVar,
	StateVarTypeCode,
	ChildRef,
	ShapeStyle,
	TextStyle,
	ObjectTypeCode,
	ContainerTypeCode,
	BlendModeCode,
	ArrowDef,
	AnchorPoint as StoredAnchorPoint,
	RoutingCode,
	// Palette types (stored)
	StoredPalette,
	StoredPaletteRef,
	StoredPaletteColor,
	PaletteSlot,
	PaletteColorSlot,
	PaletteGradientSlot,
	ColorValue,
	// Template types (stored)
	StoredTemplate,
	StoredSnapGuide
} from './stored-types'

export type {
	// Runtime types
	PrezilloObject,
	PrezilloObjectBase,
	RectObject,
	EllipseObject,
	LineObject,
	PathObject,
	PolygonObject,
	TextObject,
	ImageObject,
	EmbedObject,
	DocumentObject,
	ConnectorObject,
	QrCodeObject,
	QrErrorCorrection,
	PollFrameObject,
	TableGridObject,
	SymbolObject,
	StateVarObject,
	StateVarType,
	ContainerNode,
	ViewNode,
	DocumentMeta,
	StyleDefinition,
	ObjectType,
	ContainerType,
	BlendMode,
	ArrowType,
	ArrowStyle,
	AnchorPoint,
	AnchorPointType,
	Routing,
	ShapeStyle as RuntimeShapeStyle,
	TextStyle as RuntimeTextStyle,
	ResolvedShapeStyle,
	ResolvedTextStyle,
	Point,
	Bounds,
	Transform,
	ChildRef as RuntimeChildRef,
	// Palette types (runtime)
	Palette,
	PaletteRef,
	PaletteColor,
	PaletteSlotName,
	PaletteColorSlotName,
	PaletteGradientSlotName,
	ResolvedColorValue,
	// Template types (runtime)
	Template,
	SnapGuide,
	ResolvedViewBackground
} from './runtime-types'

// Document operations
export {
	getOrCreateDocument,
	getContainerChildren,
	getOrCreateRichText,
	getDocumentMeta,
	updateDocumentMeta
} from './document'

// Type converters
export {
	expandObject,
	compactObject,
	expandContainer,
	compactContainer,
	expandView,
	compactView,
	expandChildRef,
	compactChildRef,
	expandShapeStyle,
	compactShapeStyle,
	expandTextStyle,
	compactTextStyle,
	expandArrowStyle,
	compactArrowStyle,
	expandAnchorPoint,
	compactAnchorPoint,
	// Palette converters
	isPaletteRef,
	expandPaletteRef,
	compactPaletteRef,
	expandColorValue,
	compactColorValue,
	expandPalette,
	compactPalette
} from './type-converters'

// Object operations
export {
	addObject,
	createObject,
	createTableGrid,
	getObject,
	updateObject,
	updateObjectPosition,
	updateObjectSize,
	updateObjectBounds,
	updateObjectRotation,
	updateObjectOpacity,
	updateObjectPivot,
	updateObjectTextStyle,
	updateObjectPageAssociation,
	deleteObject,
	deleteObjects,
	deletePrototypeWithInstances,
	moveObject,
	reorderObject,
	bringToFront,
	sendToBack,
	bringForward,
	sendBackward,
	toggleObjectVisibility,
	toggleObjectLock,
	toggleObjectHidden,
	duplicateObject,
	// Document consistency/maintenance
	checkDocumentConsistency,
	fixDocumentIssues,
	cleanupOrphanedInstances,
	// Document embed nav state
	updateDocumentNavState
} from './object-ops'

export type {
	DocumentIssueType,
	DocumentIssue,
	DocumentConsistencyReport
} from './object-ops'

// Container operations
export {
	createContainer,
	getContainer,
	updateContainer,
	deleteContainer,
	groupObjects,
	ungroupContainer,
	moveContainer,
	reorderContainer,
	toggleContainerVisibility,
	toggleContainerLock,
	toggleContainerExpanded,
	getLayers,
	getContainerChildrenData
} from './container-ops'

// View operations
export {
	createView,
	getView,
	getAllViews,
	getViewCount,
	updateView,
	updateViewPosition,
	updateViewSize,
	updateViewBounds,
	deleteView,
	reorderView,
	moveViewInPresentation,
	rearrangeViewsOnCanvas,
	duplicateView,
	getViewAtPosition,
	getNextView,
	getPreviousView,
	getFirstView,
	getLastView,
	getViewIndex,
	toggleViewHidden,
	// Template integration
	getViewTemplate,
	resolveViewBackground,
	setViewBackgroundOverride,
	resetViewBackgroundToTemplate,
	getViewSnapGuides,
	getViewInstanceObjects,
	isTemplateInstance
} from './view-ops'

// Prototype operations (single-level inheritance)
export {
	resolveObject,
	isInstance,
	getPrototypeId,
	hasOverrides,
	getOverriddenProperties,
	getInstancesOfPrototype,
	isPrototype,
	detachInstance,
	// Property group operations for lock/unlock UI
	isPropertyGroupOverridden,
	isPropertyGroupLocked,
	unlockPropertyGroup,
	resetPropertyGroup,
	// Prototype resolution helpers (for stored objects)
	getResolvedXy,
	getResolvedWh,
	getResolvedBounds,
	// Per-field text style operations
	isTextStyleFieldOverridden,
	unlockTextStyleField,
	resetTextStyleField
} from './prototype-ops'

export type { PropertyGroup, TextStyleField } from './prototype-ops'

// Template operations
export {
	// Template CRUD
	createTemplate,
	getTemplate,
	getAllTemplates,
	updateTemplate,
	deleteTemplate,
	duplicateTemplate,
	// Template object management
	addObjectToTemplate,
	removeObjectFromTemplate,
	getTemplatePrototypeObjects,
	getTemplatePrototypeIds,
	getTemplateIdForPrototype,
	// Apply template to view
	applyTemplateToView,
	removeTemplateFromView,
	getViewsUsingTemplate,
	// Snap guide management
	addSnapGuide,
	updateSnapGuide,
	removeSnapGuide,
	setSnapGuides,
	// Hidden prototype objects
	hidePrototypeOnView,
	showPrototypeOnView,
	isPrototypeHiddenOnView
} from './template-ops'

export type {
	CreateTemplateOptions,
	UpdateTemplateOptions,
	DeleteTemplateOptions
} from './template-ops'

// Style operations
export {
	DEFAULT_SHAPE_STYLE,
	DEFAULT_TEXT_STYLE,
	createStyle,
	getStyle,
	getAllStyles,
	updateStyle,
	deleteStyle,
	getStyleChain,
	resolveShapeStyle,
	resolveTextStyle
} from './style-ops'

// Palette operations
export {
	DEFAULT_PALETTE,
	getPalette,
	setPalette,
	updatePaletteColorSlot,
	updatePaletteGradientSlot,
	updatePaletteName,
	applyPreset,
	resetPaletteToDefault,
	isGradientSlot,
	getPaletteSlotValue,
	resolvePaletteRef,
	resolveColorValue,
	getResolvedColor,
	getObjectsUsingPaletteSlot,
	getPaletteUsageCounts,
	createPaletteRef,
	getPaletteSlotDisplayName,
	getSlotDisplayName,
	getColorSlotNames,
	getGradientSlotNames,
	getAllSlotNames,
	COLOR_SLOT_NAMES,
	GRADIENT_SLOT_NAMES,
	ALL_SLOT_NAMES
} from './palette-ops'

// Palette presets
export type { PalettePreset } from './palette-presets'
export {
	PALETTE_PRESETS,
	getPresetById,
	getPresetsByCategory,
	getCategoryDisplayName,
	PRESET_CATEGORIES
} from './palette-presets'

// Color utilities
export {
	hexToRgb,
	rgbToHex,
	applyTint,
	applyTintToGradient,
	applyOpacity,
	interpolateColor,
	isLightColor,
	getContrastColor
} from './color-utils'

// Transform utilities
export {
	getAbsolutePosition,
	getAbsolutePositionStored,
	getAbsoluteTransform,
	composeTransforms,
	getAbsoluteBounds,
	getAbsoluteBoundsStored,
	getContainerBounds,
	canvasToView,
	viewToCanvas,
	isPointInView,
	boundsIntersectsView,
	objectIntersectsView,
	boundsIntersect,
	pointInBounds,
	expandBounds,
	unionBounds,
	getSelectionBounds,
	rotatePoint,
	scalePoint,
	getBoundsCenter,
	distance,
	snapToGrid,
	snapPointToGrid,
	// Page-relative coordinate helpers
	canvasToPageCoords,
	pageToCanvasCoords,
	isPointInViewBounds,
	findViewAtPoint
} from './transforms'

// Query helpers
export {
	getObjectsInView,
	getPageObjects,
	getObjectIdsInView,
	getAllObjectsInZOrder,
	getAllObjectIdsInZOrder,
	getObjectsInViewInZOrder,
	getObjectsAtPoint,
	getObjectIdsAtPoint,
	getTopmostObjectAtPoint,
	getTopmostObjectIdAtPoint,
	getObjectsInRect,
	getObjectIdsInRect,
	getObjectsContainedInRect,
	getViewAtPoint,
	getLayers as getLayersQuery,
	getLayerIds,
	getContainerAncestry,
	getObjectAncestry,
	getContainerDescendants,
	isAncestorOf,
	getObjectSiblings,
	getObjectZIndex,
	getObjectsWithStyle,
	searchObjectsByName,
	getObjectCount,
	getContainerCount,
	// Stacked object queries (for sticky movement)
	calculateOverlapPercentage,
	getStackedObjects,
	getStackedObjectsForSelection
} from './queries'

// Export functionality
export { exportDocument, downloadExport } from './export'

// vim: ts=4
