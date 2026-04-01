// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Type definitions for PDF export functionality
 */

import type { YPrezilloDocument } from '../crdt'

/**
 * Options for PDF export
 */
export interface PDFExportOptions {
	/** Document name for the PDF filename */
	filename?: string
	/** Owner tag for resolving image URLs */
	ownerTag?: string
	/** Access token for authenticated image fetching */
	token?: string
	/** Progress callback (0-100) */
	onProgress?: (progress: number) => void
}

/**
 * Context passed to shape rendering functions
 */
export interface RenderContext {
	doc: YPrezilloDocument
	ownerTag?: string
	/** Pre-loaded images as base64 data URLs keyed by fileId */
	imageCache: Map<string, string>
}

/**
 * Bounds for rendering
 */
export interface Bounds {
	x: number
	y: number
	width: number
	height: number
}

/**
 * Text measurement result for a single line
 */
export interface TextLineMetrics {
	text: string
	width: number
	x: number
	y: number
}

/**
 * Text layout result for word-wrapped text
 */
export interface TextLayout {
	lines: TextLineMetrics[]
	totalHeight: number
}

// vim: ts=4
