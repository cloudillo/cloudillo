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
 * Export functionality for Prezillo documents
 *
 * Exports the CRDT document as a JSON file with .prezillo extension.
 * Uses a metadata envelope with contentType for format identification.
 */

import * as Y from 'yjs'
import type {
	YPrezilloDocument,
	StoredObject,
	StoredContainer,
	StoredView,
	StoredStyle,
	StoredPalette,
	ChildRef
} from './stored-types.js'
import type {
	PrezilloObject,
	ContainerNode,
	ViewNode,
	Palette,
	ChildRef as RuntimeChildRef
} from './runtime-types.js'
import {
	expandObject,
	expandContainer,
	expandView,
	expandChildRef,
	expandPalette
} from './type-converters.js'

// Export version - increment when format changes
const EXPORT_VERSION = '1.0.0'
const CONTENT_TYPE = 'application/vnd.cloudillo.prezillo+json'

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
export interface PrezilloExportMeta {
	name?: string
	defaultViewWidth?: number
	defaultViewHeight?: number
	gridSize?: number
	snapToGrid?: boolean
	snapToObjects?: boolean
}

/**
 * Rich text export format (Quill Delta compatible)
 */
export interface RichTextExport {
	plainText: string
	delta: unknown[] // Quill Delta operations
}

/**
 * Style definition for export
 * Note: id is the key in the styles record, not included here
 */
export interface StyleExport {
	name: string
	type: 'shape' | 'text'
	parentId?: string
	properties: Record<string, unknown>
}

/**
 * Complete export document structure
 */
export interface PrezilloExportDocument {
	// Metadata envelope
	contentType: typeof CONTENT_TYPE
	version: string
	exportedAt: string

	// Document content
	data: {
		meta: PrezilloExportMeta
		objects: Record<string, Omit<PrezilloObject, 'id'>>
		containers: Record<string, Omit<ContainerNode, 'id'>>
		rootChildren: RuntimeChildRef[]
		containerChildren: Record<string, RuntimeChildRef[]>
		views: Record<string, Omit<ViewNode, 'id'>>
		viewOrder: string[]
		richTexts: Record<string, RichTextExport>
		styles: Record<string, StyleExport>
		palette: Palette | null
	}
}

/**
 * Export the document to a serializable JSON structure
 *
 * @param yDoc - The Yjs document
 * @param doc - The Prezillo document structure
 * @returns The export document ready for JSON serialization
 */
export function exportDocument(yDoc: Y.Doc, doc: YPrezilloDocument): PrezilloExportDocument {
	// 1. Collect metadata
	const meta: PrezilloExportMeta = {
		name: doc.m.get('name') as string | undefined,
		defaultViewWidth: doc.m.get('defaultViewWidth') as number | undefined,
		defaultViewHeight: doc.m.get('defaultViewHeight') as number | undefined,
		gridSize: doc.m.get('gridSize') as number | undefined,
		snapToGrid: doc.m.get('snapToGrid') as boolean | undefined,
		snapToObjects: doc.m.get('snapToObjects') as boolean | undefined
	}

	// Track referenced IDs to filter orphaned entries
	const referencedRichTextIds = new Set<string>()

	// 2. Export objects (expanded format for readability)
	// Remove 'id' field since it's already the key in the record
	// Round numeric fields for cleaner export
	const objects: Record<string, Omit<PrezilloObject, 'id'>> = {}
	doc.o.forEach((stored: StoredObject, id: string) => {
		// Track rich text references for textbox objects
		if (stored.t === 'B' && 'tid' in stored) {
			referencedRichTextIds.add(stored.tid)
		}

		const { id: _id, ...objectWithoutId } = expandObject(id, stored)
		objects[id] = roundObjectFields(objectWithoutId)
	})

	// 3. Export containers (layers/groups)
	// Remove 'id' field since it's already the key in the record
	// Round numeric fields for cleaner export
	const containers: Record<string, Omit<ContainerNode, 'id'>> = {}
	doc.c.forEach((stored: StoredContainer, id: string) => {
		const { id: _id, ...containerWithoutId } = expandContainer(id, stored)
		containers[id] = roundObjectFields(containerWithoutId)
	})

	// 4. Export root children
	const rootChildren: RuntimeChildRef[] = doc.r
		.toArray()
		.map((ref: ChildRef) => expandChildRef(ref))

	// 5. Export container children
	const containerChildren: Record<string, RuntimeChildRef[]> = {}
	doc.ch.forEach((yArray: Y.Array<ChildRef>, containerId: string) => {
		containerChildren[containerId] = yArray
			.toArray()
			.map((ref: ChildRef) => expandChildRef(ref))
	})

	// 6. Export views
	// Remove 'id' field since it's already the key in the record
	// Round numeric fields for cleaner export
	const views: Record<string, Omit<ViewNode, 'id'>> = {}
	doc.v.forEach((stored: StoredView, id: string) => {
		const { id: _id, ...viewWithoutId } = expandView(id, stored)
		views[id] = roundObjectFields(viewWithoutId)
	})
	const viewOrder = doc.vo.toArray()

	// 7. Export rich text content (only referenced entries)
	const richTexts: Record<string, RichTextExport> = {}
	doc.rt.forEach((yText: Y.Text, id: string) => {
		if (referencedRichTextIds.has(id)) {
			richTexts[id] = {
				plainText: yText.toString(),
				delta: yText.toDelta()
			}
		}
	})

	// 8. Export styles
	// id is already the key in the record, so don't include it in the value
	const styles: Record<string, StyleExport> = {}
	doc.st.forEach((stored: StoredStyle, id: string) => {
		// Extract style properties (excluding metadata fields)
		const { n, t, p, ...properties } = stored
		styles[id] = {
			name: n,
			type: t === 'S' ? 'shape' : 'text',
			parentId: p,
			properties
		}
	})

	// 9. Export palette
	let palette: Palette | null = null
	const storedPalette = doc.pl.get('default')
	if (storedPalette) {
		palette = expandPalette(storedPalette)
	}

	return {
		contentType: CONTENT_TYPE,
		version: EXPORT_VERSION,
		exportedAt: new Date().toISOString(),
		data: {
			meta,
			objects,
			containers,
			rootChildren,
			containerChildren,
			views,
			viewOrder,
			richTexts,
			styles,
			palette
		}
	}
}

/**
 * Export the document and trigger a file download
 *
 * @param yDoc - The Yjs document
 * @param doc - The Prezillo document structure
 * @param filename - Optional custom filename (without extension)
 */
export function downloadExport(yDoc: Y.Doc, doc: YPrezilloDocument, filename?: string): void {
	const exportData = exportDocument(yDoc, doc)
	const json = JSON.stringify(exportData, null, 2)
	const blob = new Blob([json], { type: 'application/json' })
	const url = URL.createObjectURL(blob)

	// Generate safe filename
	const docName = (doc.m.get('name') as string) || 'untitled'
	const safeName = docName.replace(/[^a-zA-Z0-9-_]/g, '_')
	const finalFilename = filename ? `${filename}.prezillo` : `${safeName}.prezillo`

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
