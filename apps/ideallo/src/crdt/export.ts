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
 */

import * as Y from 'yjs'
import type { YIdealloDocument, StoredObject } from './stored-types.js'
import type { IdealloObject } from './runtime-types.js'
import { expandObject } from './type-converters.js'
import type { ObjectId } from './ids.js'
import { toObjectId } from './ids.js'

// Export version - increment when format changes
const EXPORT_VERSION = '1.0.0'
const CONTENT_TYPE = 'application/vnd.cloudillo.ideallo+json'

/**
 * Round a number to specified decimal places
 */
function round(value: number, decimals: number = 2): number {
	const factor = Math.pow(10, decimals)
	return Math.round(value * factor) / factor
}

/**
 * Round numeric fields in an object for export
 * Uses 3 decimals for pivot (0-1 range), 2 for everything else
 */
function roundObjectFields<T extends Record<string, unknown>>(obj: T): T {
	const result: Record<string, unknown> = {}
	for (const [key, value] of Object.entries(obj)) {
		if (typeof value === 'number') {
			const decimals = key === 'pivotX' || key === 'pivotY' ? 3 : 2
			result[key] = round(value, decimals)
		} else if (Array.isArray(value)) {
			result[key] = value.map((v) => (typeof v === 'number' ? round(v, 2) : v))
		} else if (value && typeof value === 'object') {
			result[key] = roundObjectFields(value as Record<string, unknown>)
		} else {
			result[key] = value
		}
	}
	return result as T
}

/**
 * Document metadata for export
 */
export interface IdealloExportMeta {
	name?: string
	backgroundColor?: string
	gridSize?: number
	snapToGrid?: boolean
}

/**
 * Complete export document structure
 */
export interface IdealloExportDocument {
	// Metadata envelope
	contentType: typeof CONTENT_TYPE
	version: string
	exportedAt: string

	// Document content
	data: {
		meta: IdealloExportMeta
		objects: Record<string, Omit<IdealloObject, 'id'>>
		texts: Record<string, string>
		geometry: Record<string, [number, number][]>
		paths: Record<string, string>
	}
}

/**
 * Export the document to a serializable JSON structure
 *
 * @param yDoc - The Yjs document
 * @param doc - The Ideallo document structure
 * @returns The export document ready for JSON serialization
 */
export function exportDocument(yDoc: Y.Doc, doc: YIdealloDocument): IdealloExportDocument {
	// 1. Collect metadata
	const meta: IdealloExportMeta = {
		name: doc.m.get('name') as string | undefined,
		backgroundColor: doc.m.get('backgroundColor') as string | undefined,
		gridSize: doc.m.get('gridSize') as number | undefined,
		snapToGrid: doc.m.get('snapToGrid') as boolean | undefined
	}

	// Track referenced IDs to filter orphaned entries
	const referencedTextIds = new Set<string>()
	const referencedGeoIds = new Set<string>()
	const referencedPathIds = new Set<string>()

	// 2. Export objects (expanded format for readability)
	// Remove 'id' field since it's already the key in the record
	// Round numeric fields for cleaner export
	const objects: Record<string, Omit<IdealloObject, 'id'>> = {}
	doc.o.forEach((stored: StoredObject, id: string) => {
		// Track references based on object type
		switch (stored.t) {
			case 'T': // Text
				referencedTextIds.add('tid' in stored && stored.tid ? stored.tid : id)
				break
			case 'S': // Sticky
				referencedTextIds.add('tid' in stored && stored.tid ? stored.tid : id)
				break
			case 'P': // Polygon
				referencedGeoIds.add('gid' in stored && stored.gid ? stored.gid : id)
				break
			case 'F': // Freehand
				referencedPathIds.add('pid' in stored && stored.pid ? stored.pid : id)
				break
		}

		const objectId = toObjectId(id)
		const { id: _id, ...objectWithoutId } = expandObject(objectId, stored, doc)
		objects[id] = roundObjectFields(objectWithoutId)
	})

	// 3. Export text content (only referenced entries)
	const texts: Record<string, string> = {}
	doc.txt.forEach((yText: Y.Text, id: string) => {
		if (referencedTextIds.has(id)) {
			texts[id] = yText.toString()
		}
	})

	// 4. Export geometry (only referenced entries)
	// Round coordinate values for cleaner export
	const geometry: Record<string, [number, number][]> = {}
	doc.geo.forEach((yArray: Y.Array<number>, id: string) => {
		if (referencedGeoIds.has(id)) {
			const flat = yArray.toArray()
			const vertices: [number, number][] = []
			for (let i = 0; i < flat.length; i += 2) {
				vertices.push([round(flat[i], 2), round(flat[i + 1], 2)])
			}
			geometry[id] = vertices
		}
	})

	// 5. Export paths (only referenced entries)
	const paths: Record<string, string> = {}
	doc.paths.forEach((pathStr: string, id: string) => {
		if (referencedPathIds.has(id)) {
			paths[id] = pathStr
		}
	})

	return {
		contentType: CONTENT_TYPE,
		version: EXPORT_VERSION,
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
