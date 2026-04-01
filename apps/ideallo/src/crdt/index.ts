// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * CRDT layer barrel export
 */

// IDs
export { ObjectId, toObjectId, generateObjectId } from './ids.js'

// Stored types
export type {
	ObjectTypeCode,
	StrokeStyleCode,
	StoredStyle,
	StoredObjectBase,
	StoredFreehand,
	StoredRect,
	StoredEllipse,
	StoredLine,
	StoredArrow,
	StoredPolygon,
	StoredText,
	StoredSticky,
	StoredImage,
	StoredDocument,
	StoredObject,
	StoredMeta,
	YIdealloDocument
} from './stored-types.js'

// Runtime types
export type {
	ObjectType,
	StrokeStyle,
	ArrowheadPosition,
	Style,
	IdealloObjectBase,
	FreehandObject,
	RectObject,
	EllipseObject,
	LineObject,
	ArrowObject,
	PolygonObject,
	TextObject,
	StickyObject,
	ImageObject,
	DocumentObject,
	IdealloObject,
	Bounds
} from './runtime-types.js'
export { DEFAULT_STYLE } from './runtime-types.js'

// Type converters
export { expandObject, compactObject } from './type-converters.js'

// Document
export { getOrCreateDocument, getDocumentMeta, updateDocumentMeta } from './document.js'

// Object operations
export type {
	NewObjectInput,
	NewFreehandInput,
	NewPolygonInput,
	NewTextInput,
	NewStickyInput,
	NewImageInput,
	NewDocumentInput,
	ObjectUpdateFields
} from './object-ops.js'
export { updateObjectFields } from './object-ops.js'
export {
	addObject,
	getObject,
	getAllObjects,
	updateObject,
	updateObjectPosition,
	updateObjectBounds,
	updateObjectRotation,
	updateObjectPivot,
	deleteObject,
	deleteObjects,
	duplicateObject,
	duplicateAsLinkedCopy,
	toggleObjectLock,
	getObjectYText,
	getObjectYArray,
	appendGeometryPoints,
	replaceGeometryPoints,
	bringToFront,
	sendToBack,
	bringForward,
	sendBackward,
	updateDocumentNavState
} from './object-ops.js'

// Transforms and geometry utilities
export * from './transforms.js'

// Export functionality
export { exportDocument, downloadExport } from './export.js'

// vim: ts=4
