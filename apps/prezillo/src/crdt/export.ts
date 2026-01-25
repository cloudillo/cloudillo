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
 *
 * v2.0.0: Exports raw compact CRDT structure directly for simpler round-trips.
 */

import * as Y from 'yjs'
import type {
	YPrezilloDocument,
	StoredObject,
	StoredContainer,
	StoredView,
	StoredStyle,
	StoredPalette,
	StoredTemplate,
	ChildRef
} from './stored-types.js'

// App version injected at build time
declare const __APP_VERSION__: string

// Export format version - v2.0.0 uses raw compact CRDT format
const EXPORT_FORMAT_VERSION = '2.0.0'
const CONTENT_TYPE = 'application/vnd.cloudillo.prezillo+json'

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
 * Complete export document structure (v2.0.0)
 * Uses raw compact CRDT format for simpler round-trips
 */
export interface PrezilloExportDocument {
	// Metadata envelope
	contentType: typeof CONTENT_TYPE
	appVersion: string // App version that created this export
	formatVersion: string // Export format version
	exportedAt: string

	// Document content (raw compact CRDT format)
	data: {
		meta: PrezilloExportMeta
		objects: Record<string, StoredObject>
		containers: Record<string, StoredContainer>
		rootChildren: ChildRef[]
		containerChildren: Record<string, ChildRef[]>
		views: Record<string, StoredView>
		viewOrder: string[]
		richTexts: Record<string, RichTextExport>
		styles: Record<string, StoredStyle>
		templates: Record<string, StoredTemplate>
		templatePrototypeObjects: Record<string, string[]>
		palette: StoredPalette | null
	}
}

/**
 * Export the document to a serializable JSON structure
 *
 * Uses raw compact CRDT format directly via .toJSON() for simpler round-trips.
 *
 * @param yDoc - The Yjs document
 * @param doc - The Prezillo document structure
 * @returns The export document ready for JSON serialization
 */
export function exportDocument(yDoc: Y.Doc, doc: YPrezilloDocument): PrezilloExportDocument {
	// 1. Collect metadata
	const meta = doc.m.toJSON() as PrezilloExportMeta

	// 2. Export raw CRDT structures with rounded numeric values for cleaner output
	const objects = roundNumericValues(doc.o.toJSON() as Record<string, StoredObject>)
	const containers = roundNumericValues(doc.c.toJSON() as Record<string, StoredContainer>)
	const rootChildren = doc.r.toArray() as ChildRef[]
	const views = roundNumericValues(doc.v.toJSON() as Record<string, StoredView>)
	const viewOrder = doc.vo.toArray() as string[]
	const styles = roundNumericValues(doc.st.toJSON() as Record<string, StoredStyle>)
	const templates = roundNumericValues(doc.tpl.toJSON() as Record<string, StoredTemplate>)

	// 3. Container children (Y.Map<Y.Array<ChildRef>>)
	const containerChildren: Record<string, ChildRef[]> = {}
	doc.ch.forEach((yArray, containerId) => {
		containerChildren[containerId] = yArray.toArray()
	})

	// 4. Template prototype objects (Y.Map<Y.Array<string>>)
	const templatePrototypeObjects: Record<string, string[]> = {}
	doc.tpo.forEach((yArray, templateId) => {
		templatePrototypeObjects[templateId] = yArray.toArray()
	})

	// 5. Rich texts (Y.Text needs special handling for delta)
	const richTexts: Record<string, RichTextExport> = {}
	doc.rt.forEach((yText, id) => {
		richTexts[id] = {
			plainText: yText.toString(),
			delta: yText.toDelta()
		}
	})

	// 6. Palette (single entry keyed by 'default')
	const storedPalette = doc.pl.get('default')
	const palette = storedPalette ? roundNumericValues(storedPalette) : null

	return {
		contentType: CONTENT_TYPE,
		appVersion: __APP_VERSION__,
		formatVersion: EXPORT_FORMAT_VERSION,
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
			templates,
			templatePrototypeObjects,
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
