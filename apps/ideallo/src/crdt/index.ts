// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * CRDT layer barrel export
 */

// Document
export { getDocumentMeta, getOrCreateDocument, updateDocumentMeta } from './document.js'
// Export functionality
export { downloadExport, exportDocument } from './export.js'
// IDs
export { generateObjectId, ObjectId, toObjectId } from './ids.js'
// Object operations
export type {
	NewDocumentInput,
	NewFreehandInput,
	NewImageInput,
	NewObjectInput,
	NewPolygonInput,
	NewStickyInput,
	NewTextInput,
	ObjectUpdateFields
} from './object-ops.js'
export {
	addObject,
	bringForward,
	bringToFront,
	connectObjects,
	deletableObjectIds,
	deleteObjectsWithBindingCleanup,
	duplicateAsLinkedCopy,
	duplicateObject,
	ensureObjectYText,
	getAllObjects,
	getAllResolvedObjects,
	getObject,
	getObjectYArray,
	getObjectYText,
	LAYOUT_ORIGIN,
	replaceGeometryPoints,
	sendBackward,
	sendToBack,
	toggleObjectLock,
	translateObject,
	tryExpandObject,
	updateDocumentNavState,
	updateObject,
	updateObjectFields,
	updateObjectRotation
} from './object-ops.js'
// Runtime types
export type {
	AnchorPoint,
	AnchorPointType,
	ArrowheadPosition,
	ArrowheadType,
	ArrowStyle,
	Bounds,
	ConnectorObject,
	Dir,
	DocumentObject,
	EllipseObject,
	FreehandObject,
	IdealloObject,
	IdealloObjectBase,
	ImageObject,
	ObjectTextStyle,
	ObjectType,
	PolygonObject,
	RectObject,
	ResolvedRoute,
	Routing,
	StickyObject,
	StrokeStyle,
	Style,
	TextAlign,
	TextBearingObject,
	TextObject,
	VerticalAlign
} from './runtime-types.js'
export {
	DEFAULT_ANCHOR,
	DEFAULT_END_ARROW,
	DEFAULT_FONT_FAMILY,
	DEFAULT_ROUTING,
	DEFAULT_START_ARROW,
	DEFAULT_STYLE,
	DEFAULT_TEXT_ALIGN,
	DEFAULT_VERTICAL_ALIGN,
	isTextBearing,
	TEXT_BEARING_TYPES
} from './runtime-types.js'
// Stored types
export type {
	AnchorPointCode,
	ArrowDef,
	ArrowTypeCode,
	ObjectTypeCode,
	RoutingCode,
	StoredConnector,
	StoredCornerRadius,
	StoredDocument,
	StoredEllipse,
	StoredFreehand,
	StoredImage,
	StoredLine,
	StoredMeta,
	StoredObject,
	StoredObjectBase,
	StoredPolygon,
	StoredRect,
	StoredSticky,
	StoredStyle,
	StoredText,
	StoredTextStyle,
	StrokeStyleCode,
	TextAlignCode,
	VerticalAlignCode,
	YIdealloDocument
} from './stored-types.js'
// Transforms and geometry utilities
export * from './transforms.js'
// Type converters
export {
	arrowheadsFromPosition,
	compactAnchorPoint,
	compactArrowDef,
	compactObject,
	expandAnchorPoint,
	expandArrowDef,
	expandObject
} from './type-converters.js'

// vim: ts=4
