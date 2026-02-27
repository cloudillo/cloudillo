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
 * v3.0.0: Uses generic exportYDoc() with inline @T type markers.
 */

import * as Y from 'yjs'
import type { YPrezilloDocument } from './stored-types.js'
import { downloadBlob, sanitizeFilename } from '@cloudillo/core'
import { exportYDoc, type ExportEnvelope } from '@cloudillo/crdt'

// App version injected at build time
declare const __APP_VERSION__: string

const EXPORT_FORMAT_VERSION = '3.0.0'
const CONTENT_TYPE = 'application/vnd.cloudillo.prezillo+json'

/**
 * Export the document to a serializable JSON structure
 */
export function exportDocument(yDoc: Y.Doc): ExportEnvelope<Record<string, unknown>> {
	return exportYDoc(yDoc, {
		contentType: CONTENT_TYPE,
		appVersion: __APP_VERSION__,
		formatVersion: EXPORT_FORMAT_VERSION
	})
}

/**
 * Export the document and trigger a file download
 */
export function downloadExport(yDoc: Y.Doc, doc: YPrezilloDocument, filename?: string): void {
	const exportData = exportDocument(yDoc)
	const json = JSON.stringify(exportData, null, 2)
	const blob = new Blob([json], { type: 'application/json' })

	// Generate safe filename
	const docName = (doc.m.get('name') as string) || 'untitled'
	const safeName = sanitizeFilename(docName)
	const finalFilename = filename ? `${filename}.prezillo` : `${safeName}.prezillo`

	downloadBlob(blob, finalFilename)
}

// vim: ts=4
