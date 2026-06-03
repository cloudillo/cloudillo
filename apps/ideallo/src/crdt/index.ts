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
	appendGeometryPoints,
	bringForward,
	bringToFront,
	deleteObject,
	deleteObjects,
	duplicateAsLinkedCopy,
	duplicateObject,
	getAllObjects,
	getObject,
	getObjectYArray,
	getObjectYText,
	replaceGeometryPoints,
	sendBackward,
	sendToBack,
	toggleObjectLock,
	updateDocumentNavState,
	updateObject,
	updateObjectBounds,
	updateObjectFields,
	updateObjectPivot,
	updateObjectPosition,
	updateObjectRotation
} from './object-ops.js'
// Runtime types
export type {
	ArrowheadPosition,
	ArrowObject,
	Bounds,
	DocumentObject,
	EllipseObject,
	FreehandObject,
	IdealloObject,
	IdealloObjectBase,
	ImageObject,
	LineObject,
	ObjectType,
	PolygonObject,
	RectObject,
	StickyObject,
	StrokeStyle,
	Style,
	TextObject
} from './runtime-types.js'
export { DEFAULT_STYLE } from './runtime-types.js'
// Stored types
export type {
	ObjectTypeCode,
	StoredArrow,
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
	StrokeStyleCode,
	YIdealloDocument
} from './stored-types.js'
// Transforms and geometry utilities
export * from './transforms.js'
// Type converters
export { compactObject, expandObject } from './type-converters.js'

// vim: ts=4
