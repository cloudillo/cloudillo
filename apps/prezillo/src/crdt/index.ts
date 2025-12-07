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
	ChildRef,
	ShapeStyle,
	TextStyle,
	ObjectTypeCode,
	ContainerTypeCode,
	BlendModeCode,
	ArrowDef,
	AnchorPoint as StoredAnchorPoint,
	RoutingCode
} from './stored-types'

export type {
	// Runtime types
	PrezilloObject,
	RectObject,
	EllipseObject,
	LineObject,
	PathObject,
	PolygonObject,
	TextObject,
	TextboxObject,
	ImageObject,
	EmbedObject,
	ConnectorObject,
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
	ChildRef as RuntimeChildRef
} from './runtime-types'

// Document operations
export {
	getOrCreateDocument,
	getContainerChildren,
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
	compactAnchorPoint
} from './type-converters'

// Object operations
export {
	addObject,
	createObject,
	getObject,
	updateObject,
	updateObjectPosition,
	updateObjectSize,
	updateObjectBounds,
	updateObjectRotation,
	updateObjectPivot,
	updateObjectTextStyle,
	deleteObject,
	deleteObjects,
	moveObject,
	reorderObject,
	bringToFront,
	sendToBack,
	bringForward,
	sendBackward,
	toggleObjectVisibility,
	toggleObjectLock,
	duplicateObject
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
	setViewTransition,
	setViewNotes
} from './view-ops'

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
	resolveTextStyle,
	applyStyleToObjects,
	detachStyleFromObjects,
	setStyleOverride,
	clearStyleOverrides,
	createStyleVariation
} from './style-ops'

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
	snapPointToGrid
} from './transforms'

// Query helpers
export {
	getObjectsInView,
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
	getContainerCount
} from './queries'

// vim: ts=4
