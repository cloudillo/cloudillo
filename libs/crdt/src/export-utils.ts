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
 * Shared export utilities for Yjs-based Cloudillo apps.
 *
 * Provides common helpers for exporting CRDT documents to JSON files.
 */

import * as Y from 'yjs'

/**
 * Base export envelope structure shared by all Cloudillo export formats.
 *
 * Each app's export document extends this with app-specific `data`.
 */
export interface ExportEnvelope<T = unknown> {
	contentType: string
	appVersion: string
	formatVersion: string
	exportedAt: string
	data: T
}

/**
 * Create a standardized export envelope for a Cloudillo document export.
 *
 * @param contentType - MIME type identifier (e.g. 'application/vnd.cloudillo.prezillo+json')
 * @param appVersion - App version string (typically __APP_VERSION__)
 * @param formatVersion - Export format version
 * @param data - App-specific export data
 * @returns Complete export envelope ready for JSON serialization
 */
export function createExportEnvelope<T>(
	contentType: string,
	appVersion: string,
	formatVersion: string,
	data: T
): ExportEnvelope<T> {
	return {
		contentType,
		appVersion,
		formatVersion,
		exportedAt: new Date().toISOString(),
		data
	}
}

/**
 * Recursively round numeric values in an object for cleaner export (3 decimal places).
 *
 * Useful for cleaning up floating-point noise in CRDT data before serialization.
 */
export function roundNumericValues<T>(value: T): T {
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

// ============================================
// GENERIC Y.DOC EXPORT
// ============================================

/**
 * Options for `exportYDoc()`.
 */
export interface ExportYDocOpts {
	contentType: string
	appVersion: string
	formatVersion: string
	/** Optional transform applied per top-level key after serialization. */
	transform?: (key: string, data: unknown) => unknown
}

/**
 * Serialize a single Yjs shared type to a JSON-compatible value with inline `@T` type markers.
 *
 * Type markers:
 * - `{ "@T": "M", ... }` — Y.Map
 * - `[ "@T:A", ... ]` — Y.Array
 * - `{ "@T": "T", text, delta }` — Y.Text
 * - `{ "@T": "XT", text, delta }` — Y.XmlText
 * - `{ "@T": "XE", n, a, c }` — Y.XmlElement
 * - `{ "@T": "XF", c }` — Y.XmlFragment
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function serializeYValue(value: Y.AbstractType<any>): unknown {
	// XmlText extends Text, so check it first
	if (value instanceof Y.XmlText) {
		return { '@T': 'XT', text: value.toString(), delta: value.toDelta() }
	}

	if (value instanceof Y.Text) {
		return { '@T': 'T', text: value.toString(), delta: value.toDelta() }
	}

	// XmlElement and XmlFragment extend Array-like types, check before Array
	if (value instanceof Y.XmlElement) {
		return {
			'@T': 'XE',
			n: value.nodeName,
			a: value.getAttributes(),
			c: value.toArray().map((child) => serializeYValue(child as Y.AbstractType<any>))
		}
	}

	if (value instanceof Y.XmlFragment) {
		return {
			'@T': 'XF',
			c: value.toArray().map((child) => serializeYValue(child as Y.AbstractType<any>))
		}
	}

	if (value instanceof Y.Array) {
		return ['@T:A', ...value.toArray()]
	}

	if (value instanceof Y.Map) {
		const result: Record<string, unknown> = { '@T': 'M' }
		value.forEach((val: unknown, key: string) => {
			if (val instanceof Y.AbstractType) {
				result[key] = serializeYValue(val)
			} else {
				result[key] = val
			}
		})
		return result
	}

	// Fallback for unknown types
	return (value as Y.Map<unknown>).toJSON()
}

/**
 * Generic export of a Y.Doc to a JSON-serializable structure with inline type markers.
 *
 * Walks `yDoc.share` (the internal Map of all shared types), serializes each
 * top-level key based on its Y type, applies `roundNumericValues`, and wraps
 * the result in an `ExportEnvelope`.
 */
export function exportYDoc(
	yDoc: Y.Doc,
	opts: ExportYDocOpts
): ExportEnvelope<Record<string, unknown>> {
	const data: Record<string, unknown> = {}

	for (const [key, yType] of yDoc.share.entries()) {
		// Skip empty shared types (Yjs creates them lazily)
		if (yType instanceof Y.Map && yType.size === 0) continue
		if (yType instanceof Y.Array && yType.length === 0) continue
		if (yType instanceof Y.Text && yType.length === 0) continue

		let serialized = serializeYValue(yType)
		serialized = roundNumericValues(serialized)

		if (opts.transform) {
			serialized = opts.transform(key, serialized)
		}

		data[key] = serialized
	}

	return createExportEnvelope(opts.contentType, opts.appVersion, opts.formatVersion, data)
}

// vim: ts=4
