// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Intermediate representation types for PPTX import
 */

/** EMU to pixel conversion factor: 1 inch = 914400 EMU, screen = 96 DPI */
export const EMU_PER_INCH = 914400
export const DPI = 96
export const EMU_PER_PX = EMU_PER_INCH / DPI // 9525

/** Convert EMU to pixels */
export function emuToPx(emu: number): number {
	return emu / EMU_PER_PX
}

/** Parsed color from OOXML */
export interface ParsedColor {
	type: 'rgb' | 'scheme' | 'none'
	/** Hex color (without #) for rgb, scheme name for scheme */
	value: string
	/** Alpha/opacity 0-100000 (OOXML scale) */
	alpha?: number
}

/** Parsed fill */
export interface ParsedFill {
	type: 'solid' | 'gradient' | 'none' | 'image'
	color?: ParsedColor
	/** For gradient fills */
	stops?: Array<{ position: number; color: ParsedColor }>
	/** Gradient angle in degrees (from OOXML 1/60000th degree) */
	gradientAngle?: number
	gradientType?: 'linear' | 'radial'
	/** For image fills - relationship ID */
	imageRId?: string
}

/** Parsed stroke/line */
export interface ParsedLine {
	fill?: ParsedFill
	width?: number // EMU
	dashType?: string
	headEnd?: string
	tailEnd?: string
}

/** Parsed text run */
export interface ParsedTextRun {
	text: string
	bold?: boolean
	italic?: boolean
	underline?: string
	strikethrough?: string
	fontSize?: number // hundredths of a point
	fontFamily?: string
	color?: ParsedColor
	hyperlink?: string
}

/** Parsed paragraph */
export interface ParsedParagraph {
	runs: ParsedTextRun[]
	align?: string // l, ctr, r, just
	level?: number
	bullet?: boolean
	numbered?: boolean
}

/** Parsed transform */
export interface ParsedTransform {
	x: number // EMU
	y: number // EMU
	cx: number // EMU (width)
	cy: number // EMU (height)
	rotation?: number // 1/60000th of a degree
	flipH?: boolean
	flipV?: boolean
}

/** Parsed shape (intermediate representation) */
export interface ParsedShape {
	type: 'shape' | 'picture' | 'connector' | 'table' | 'group'
	id: string
	name: string
	/** Preset geometry name (rect, ellipse, roundRect, line, etc.) */
	presetGeometry?: string
	transform: ParsedTransform
	fill?: ParsedFill
	line?: ParsedLine
	text?: ParsedParagraph[]
	/** For pictures: relationship ID to image */
	imageRId?: string
	/** For connectors */
	connectorType?: string
	/** For tables */
	tableGrid?: { cols: number[]; rows: number[] }
	/** For groups: child shapes */
	children?: ParsedShape[]
	/** Vertical text anchor */
	verticalAnchor?: string // t, ctr, b
}

/** Parsed slide */
export interface ParsedSlide {
	index: number
	shapes: ParsedShape[]
	background?: ParsedFill
	notes?: string
	/** Relationships: rId → target path */
	relationships: Map<string, string>
	/** Number of unsupported graphic frames (tables, charts, SmartArt) */
	graphicFrameCount: number
}

/** Parsed theme colors */
export interface ParsedTheme {
	dk1?: string // hex
	lt1?: string
	dk2?: string
	lt2?: string
	accent1?: string
	accent2?: string
	accent3?: string
	accent4?: string
	accent5?: string
	accent6?: string
	hlink?: string
	folHlink?: string
}

/** Result of a PPTX import */
export interface ImportResult {
	slidesImported: number
	objectsCreated: number
	imagesImported: number
	warnings: string[]
}

// vim: ts=4
