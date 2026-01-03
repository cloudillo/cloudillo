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
	NewImageInput
} from './object-ops.js'
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
	replaceGeometryPoints
} from './object-ops.js'

// Transforms and geometry utilities
export * from './transforms.js'

// Export functionality
export { exportDocument, downloadExport } from './export.js'
export type {
	IdealloExportDocument,
	IdealloExportMeta
} from './export.js'

// vim: ts=4
