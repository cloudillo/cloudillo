// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Export functionality for Ideallo documents
 *
 * Exports the CRDT document as a JSON file with .ideallo extension.
 * Uses a metadata envelope with contentType for format identification.
 *
 * v3.0.0: Uses generic exportYDoc() with inline @T type markers.
 */

import type * as Y from 'yjs'
import type { YIdealloDocument } from './stored-types.js'
import { downloadBlob, sanitizeFilename } from '@cloudillo/core'
import { exportYDoc, type ExportEnvelope } from '@cloudillo/crdt'

// App version injected at build time
declare const __APP_VERSION__: string

const EXPORT_FORMAT_VERSION = '3.0.0'
const CONTENT_TYPE = 'application/vnd.cloudillo.ideallo+json'

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
export function downloadExport(yDoc: Y.Doc, doc: YIdealloDocument, filename?: string): void {
	const exportData = exportDocument(yDoc)
	const json = JSON.stringify(exportData, null, 2)
	const blob = new Blob([json], { type: 'application/json' })

	// Generate safe filename
	const docName = (doc.m.get('name') as string) || 'untitled'
	const safeName = sanitizeFilename(docName)
	const finalFilename = filename ? `${filename}.ideallo` : `${safeName}.ideallo`

	downloadBlob(blob, finalFilename)
}

// vim: ts=4
