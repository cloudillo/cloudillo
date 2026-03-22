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

export type CropPoints = [[number, number], [number, number], [number, number], [number, number]]
// Order: [topLeft, topRight, bottomRight, bottomLeft] — clockwise, normalized 0-1

// Annotations — coordinates normalized 0-1 (resolution-independent)
export interface AnnotationBase {
	id: string
	type: string
	color: string // hex, default '#ef4444'
	strokeWidth: number // normalized 0-1 relative to image short dimension
	opacity: number // 0-1, default 1
}

export interface FreehandAnnotation extends AnnotationBase {
	type: 'freehand'
	points: [number, number][] // normalized 0-1
}

export interface RectAnnotation extends AnnotationBase {
	type: 'rect'
	x: number // normalized 0-1
	y: number
	width: number
	height: number
	fill?: string // optional fill color (for highlighting)
}

export type Annotation = FreehandAnnotation | RectAnnotation
export type AnnotationTool = 'freehand' | 'rect' | 'eraser'

export type CaptureFlowState =
	| { step: 'idle' }
	| { step: 'processing' }
	| {
			step: 'crop'
			imageData: string
			width: number
			height: number
			detectedCorners: CropPoints | null
			sourcePageId?: string
			existingOriginalFileId?: string
			existingFilter?: PageFilter
			existingFilterStrength?: number
			existingRotation?: number
	  }
	| {
			step: 'filter'
			croppedCanvas: HTMLCanvasElement
			cropPoints: CropPoints
			originalImageData: string
			originalWidth: number
			originalHeight: number
			sourcePageId?: string
			existingOriginalFileId?: string
			rotation?: number
	  }

export interface ScanPage {
	id: string
	order: number
	fileId: string
	fileName: string
	contentType: string
	filter: PageFilter
	filterStrength?: number
	rotation: number
	width?: number
	height?: number
	originalFileId?: string
	cropPoints?: CropPoints
	annotations?: Annotation[]
	createdAt: string
}

export type PageFilter = 'original' | 'document' | 'docbw' | 'bw' | 'highcontrast'

export const FILTER_DEFAULTS: Record<PageFilter, number> = {
	original: 100,
	document: 100,
	docbw: 100,
	bw: 80,
	highcontrast: 70
}

// vim: ts=4
