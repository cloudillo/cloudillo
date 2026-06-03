// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * CRDT module - main exports
 */

// Color utilities
export {
	applyOpacity,
	applyTint,
	applyTintToGradient,
	getContrastColor,
	hexToRgb,
	interpolateColor,
	isLightColor,
	rgbToHex
} from './color-utils'
// Container operations
export {
	createContainer,
	deleteContainer,
	getContainer,
	getContainerChildrenData,
	getLayers,
	groupObjects,
	moveContainer,
	reorderContainer,
	toggleContainerExpanded,
	toggleContainerLock,
	toggleContainerVisibility,
	ungroupContainer,
	updateContainer
} from './container-ops'
// Document operations
export {
	getContainerChildren,
	getDocumentMeta,
	getOrCreateDocument,
	getOrCreateRichText,
	updateDocumentMeta
} from './document'
// Export functionality
export { downloadExport, exportDocument } from './export'
// IDs and generators
export * from './ids'
export type {
	DocumentConsistencyReport,
	DocumentIssue,
	DocumentIssueType
} from './object-ops'
// Object operations
export {
	addObject,
	bringForward,
	bringToFront,
	// Document consistency/maintenance
	checkDocumentConsistency,
	cleanupOrphanedInstances,
	createObject,
	createTableGrid,
	deleteObject,
	deleteObjects,
	deletePrototypeWithInstances,
	duplicateObject,
	fixDocumentIssues,
	getObject,
	moveObject,
	reorderObject,
	sendBackward,
	sendToBack,
	toggleObjectHidden,
	toggleObjectLock,
	toggleObjectVisibility,
	// Document embed nav state
	updateDocumentNavState,
	updateObject,
	updateObjectBounds,
	updateObjectOpacity,
	updateObjectPageAssociation,
	updateObjectPivot,
	updateObjectPosition,
	updateObjectRotation,
	updateObjectSize,
	updateObjectTextStyle
} from './object-ops'
// Palette operations
export {
	ALL_SLOT_NAMES,
	applyPreset,
	COLOR_SLOT_NAMES,
	createPaletteRef,
	DEFAULT_PALETTE,
	GRADIENT_SLOT_NAMES,
	getAllSlotNames,
	getColorSlotNames,
	getGradientSlotNames,
	getObjectsUsingPaletteSlot,
	getPalette,
	getPaletteSlotDisplayName,
	getPaletteSlotValue,
	getPaletteUsageCounts,
	getResolvedColor,
	getSlotDisplayName,
	isGradientSlot,
	resetPaletteToDefault,
	resolveColorValue,
	resolvePaletteRef,
	setPalette,
	updatePaletteColorSlot,
	updatePaletteGradientSlot,
	updatePaletteName
} from './palette-ops'
// Palette presets
export type { PalettePreset } from './palette-presets'
export {
	getCategoryDisplayName,
	getPresetById,
	getPresetsByCategory,
	PALETTE_PRESETS,
	PRESET_CATEGORIES
} from './palette-presets'
export type { PropertyGroup, TextStyleField } from './prototype-ops'
// Prototype operations (single-level inheritance)
export {
	detachInstance,
	getInstancesOfPrototype,
	getOverriddenProperties,
	getPrototypeId,
	getResolvedBounds,
	getResolvedWh,
	// Prototype resolution helpers (for stored objects)
	getResolvedXy,
	hasOverrides,
	isInstance,
	isPropertyGroupLocked,
	// Property group operations for lock/unlock UI
	isPropertyGroupOverridden,
	isPrototype,
	// Per-field text style operations
	isTextStyleFieldOverridden,
	resetPropertyGroup,
	resetTextStyleField,
	resolveObject,
	unlockPropertyGroup,
	unlockTextStyleField
} from './prototype-ops'
// Query helpers
export {
	// Stacked object queries (for sticky movement)
	calculateOverlapPercentage,
	getAllObjectIdsInZOrder,
	getAllObjectsInZOrder,
	getContainerAncestry,
	getContainerCount,
	getContainerDescendants,
	getLayerIds,
	getLayers as getLayersQuery,
	getObjectAncestry,
	getObjectCount,
	getObjectIdsAtPoint,
	getObjectIdsInRect,
	getObjectIdsInView,
	getObjectSiblings,
	getObjectsAtPoint,
	getObjectsContainedInRect,
	getObjectsInRect,
	getObjectsInView,
	getObjectsInViewInZOrder,
	getObjectsWithStyle,
	getObjectZIndex,
	getPageObjects,
	getStackedObjects,
	getStackedObjectsForSelection,
	getTopmostObjectAtPoint,
	getTopmostObjectIdAtPoint,
	getViewAtPoint,
	isAncestorOf,
	searchObjectsByName
} from './queries'
export type {
	AnchorPoint,
	AnchorPointType,
	ArrowStyle,
	ArrowType,
	BlendMode,
	Bounds,
	ChildRef as RuntimeChildRef,
	ConnectorObject,
	ContainerNode,
	ContainerType,
	DocumentMeta,
	DocumentObject,
	EllipseObject,
	EmbedObject,
	ImageObject,
	LineObject,
	ObjectType,
	// Palette types (runtime)
	Palette,
	PaletteColor,
	PaletteColorSlotName,
	PaletteGradientSlotName,
	PaletteRef,
	PaletteSlotName,
	PathObject,
	Point,
	PollFrameObject,
	PolygonObject,
	// Runtime types
	PrezilloObject,
	PrezilloObjectBase,
	QrCodeObject,
	QrErrorCorrection,
	RectObject,
	ResolvedColorValue,
	ResolvedShapeStyle,
	ResolvedTextStyle,
	ResolvedViewBackground,
	Routing,
	ShapeStyle as RuntimeShapeStyle,
	SnapGuide,
	StateVarObject,
	StateVarType,
	StyleDefinition,
	SymbolObject,
	TableGridObject,
	// Template types (runtime)
	Template,
	TextObject,
	TextStyle as RuntimeTextStyle,
	Transform,
	ViewNode
} from './runtime-types'
// Type definitions
export type {
	AnchorPoint as StoredAnchorPoint,
	ArrowDef,
	BlendModeCode,
	ChildRef,
	ColorValue,
	ContainerTypeCode,
	ObjectTypeCode,
	PaletteColorSlot,
	PaletteGradientSlot,
	PaletteSlot,
	RoutingCode,
	ShapeStyle,
	StateVarTypeCode,
	StoredContainer,
	StoredMeta,
	StoredObject,
	// Palette types (stored)
	StoredPalette,
	StoredPaletteColor,
	StoredPaletteRef,
	StoredSnapGuide,
	StoredStateVar,
	StoredStyle,
	StoredSymbol,
	// Template types (stored)
	StoredTemplate,
	StoredView,
	TextStyle,
	// Stored types
	YPrezilloDocument
} from './stored-types'
// Style operations
export {
	createStyle,
	DEFAULT_SHAPE_STYLE,
	DEFAULT_TEXT_STYLE,
	deleteStyle,
	getAllStyles,
	getStyle,
	getStyleChain,
	resolveShapeStyle,
	resolveTextStyle,
	updateStyle
} from './style-ops'
export type {
	CreateTemplateOptions,
	DeleteTemplateOptions,
	UpdateTemplateOptions
} from './template-ops'
// Template operations
export {
	// Template object management
	addObjectToTemplate,
	// Snap guide management
	addSnapGuide,
	// Apply template to view
	applyTemplateToView,
	// Template CRUD
	createTemplate,
	deleteTemplate,
	duplicateTemplate,
	getAllTemplates,
	getTemplate,
	getTemplateIdForPrototype,
	getTemplatePrototypeIds,
	getTemplatePrototypeObjects,
	getViewsUsingTemplate,
	// Hidden prototype objects
	hidePrototypeOnView,
	isPrototypeHiddenOnView,
	removeObjectFromTemplate,
	removeSnapGuide,
	removeTemplateFromView,
	setSnapGuides,
	showPrototypeOnView,
	updateSnapGuide,
	updateTemplate
} from './template-ops'
// Transform utilities
export {
	boundsIntersect,
	boundsIntersectsView,
	// Page-relative coordinate helpers
	canvasToPageCoords,
	canvasToView,
	composeTransforms,
	distance,
	expandBounds,
	findViewAtPoint,
	getAbsoluteBounds,
	getAbsoluteBoundsStored,
	getAbsolutePosition,
	getAbsolutePositionStored,
	getAbsoluteTransform,
	getBoundsCenter,
	getContainerBounds,
	getSelectionBounds,
	isPointInView,
	isPointInViewBounds,
	objectIntersectsView,
	pageToCanvasCoords,
	pointInBounds,
	rotatePoint,
	scalePoint,
	snapPointToGrid,
	snapToGrid,
	unionBounds,
	viewToCanvas
} from './transforms'
// Type converters
export {
	compactAnchorPoint,
	compactArrowStyle,
	compactChildRef,
	compactColorValue,
	compactContainer,
	compactObject,
	compactPalette,
	compactPaletteRef,
	compactShapeStyle,
	compactTextStyle,
	compactView,
	expandAnchorPoint,
	expandArrowStyle,
	expandChildRef,
	expandColorValue,
	expandContainer,
	expandObject,
	expandPalette,
	expandPaletteRef,
	expandShapeStyle,
	expandTextStyle,
	expandView,
	// Palette converters
	isPaletteRef
} from './type-converters'
// View operations
export {
	createView,
	deleteView,
	duplicateView,
	getAllViews,
	getFirstView,
	getLastView,
	getNextView,
	getPreviousView,
	getView,
	getViewAtPosition,
	getViewCount,
	getViewIndex,
	getViewInstanceObjects,
	getViewSnapGuides,
	// Template integration
	getViewTemplate,
	isTemplateInstance,
	moveViewInPresentation,
	rearrangeViewsOnCanvas,
	reorderView,
	resetViewBackgroundToTemplate,
	resolveViewBackground,
	setViewBackgroundOverride,
	toggleViewHidden,
	updateView,
	updateViewBounds,
	updateViewPosition,
	updateViewSize
} from './view-ops'

// vim: ts=4
