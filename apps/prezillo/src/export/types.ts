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
 * Type definitions for PDF export functionality
 */

import type { ViewNode, PrezilloObject, YPrezilloDocument } from '../crdt'

/**
 * Options for PDF export
 */
export interface PDFExportOptions {
	/** Document name for the PDF filename */
	filename?: string
	/** Owner tag for resolving image URLs */
	ownerTag?: string
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
