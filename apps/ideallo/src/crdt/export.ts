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
 * Export functionality for Ideallo documents
 *
 * Exports the CRDT document as a JSON file with .ideallo extension.
 * Uses a metadata envelope with contentType for format identification.
 *
 * v2.0.0: Exports raw compact CRDT structure directly for simpler round-trips.
 */

import * as Y from 'yjs'
import type { YIdealloDocument, StoredObject, StoredMeta } from './stored-types.js'

// App version injected at build time
declare const __APP_VERSION__: string

// Export format version - v2.0.0 uses raw compact CRDT format
const EXPORT_FORMAT_VERSION = '2.0.0'
const CONTENT_TYPE = 'application/vnd.cloudillo.ideallo+json'

/**
 * Recursively round numeric values in an object for cleaner export (3 decimal places)
 */
function roundNumericValues<T>(value: T): T {
	if (typeof value === 'number') {
		return (Math.round(value * 1000) / 1000) as T
	}
	if (Array.isArray(value)) {
		return value.map(roundNumericValues) as T
	}
	if (value && typeof value === 'object') {
		const result: Record<string, unknown> = {}
		for (const [key, val] of Object.entries(value)) {
			result[key] = roundNumericValues(val)
		}
		return result as T
	}
	return value
}

/**
 * Complete export document structure (v2.0.0)
 * Uses raw compact CRDT format for simpler round-trips
 */
export interface IdealloExportDocument {
	// Metadata envelope
	contentType: typeof CONTENT_TYPE
	appVersion: string // App version that created this export
	formatVersion: string // Export format version
	exportedAt: string

	// Document content (raw compact CRDT format)
	data: {
		meta: StoredMeta
		objects: Record<string, StoredObject>
		texts: Record<string, string>
		geometry: Record<string, number[]>
		paths: Record<string, string>
	}
}

/**
 * Export the document to a serializable JSON structure
 *
 * Uses raw compact CRDT format directly via .toJSON() for simpler round-trips.
 *
 * @param yDoc - The Yjs document
 * @param doc - The Ideallo document structure
 * @returns The export document ready for JSON serialization
 */
export function exportDocument(yDoc: Y.Doc, doc: YIdealloDocument): IdealloExportDocument {
	// 1. Collect metadata
	const meta = doc.m.toJSON() as StoredMeta

	// 2. Export raw CRDT structures with rounded numeric values for cleaner output
	const objects = roundNumericValues(doc.o.toJSON() as Record<string, StoredObject>)

	// 3. Export text content (Y.Text.toJSON() returns string)
	const texts = doc.txt.toJSON() as Record<string, string>

	// 4. Export geometry (Y.Array.toJSON() returns flat number array)
	const geometry = roundNumericValues(doc.geo.toJSON() as Record<string, number[]>)

	// 5. Export paths
	const paths = doc.paths.toJSON() as Record<string, string>

	return {
		contentType: CONTENT_TYPE,
		appVersion: __APP_VERSION__,
		formatVersion: EXPORT_FORMAT_VERSION,
		exportedAt: new Date().toISOString(),
		data: {
			meta,
			objects,
			texts,
			geometry,
			paths
		}
	}
}

/**
 * Export the document and trigger a file download
 *
 * @param yDoc - The Yjs document
 * @param doc - The Ideallo document structure
 * @param filename - Optional custom filename (without extension)
 */
export function downloadExport(yDoc: Y.Doc, doc: YIdealloDocument, filename?: string): void {
	const exportData = exportDocument(yDoc, doc)
	const json = JSON.stringify(exportData, null, 2)
	const blob = new Blob([json], { type: 'application/json' })
	const url = URL.createObjectURL(blob)

	// Generate safe filename
	const docName = (doc.m.get('name') as string) || 'untitled'
	const safeName = docName.replace(/[^a-zA-Z0-9-_]/g, '_')
	const finalFilename = filename ? `${filename}.ideallo` : `${safeName}.ideallo`

	// Create and trigger download
	const a = document.createElement('a')
	a.href = url
	a.download = finalFilename
	document.body.appendChild(a)
	a.click()
	document.body.removeChild(a)
	URL.revokeObjectURL(url)
}

// vim: ts=4
