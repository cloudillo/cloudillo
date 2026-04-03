// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Maps Prezillo resolved styles to PptxGenJS style properties
 */

import type PptxGenJS from 'pptxgenjs'
import type { ResolvedShapeStyle, ResolvedTextStyle } from '../crdt'

/** Convert '#RRGGBB' hex to 'RRGGBB' (PptxGenJS format, no leading #) */
export function hexToColor(hex: string): string {
	return hex.replace(/^#/, '')
}

/** Convert opacity (0-1) to PptxGenJS transparency (0-100) */
function opacityToTransparency(opacity: number): number {
	return Math.round((1 - opacity) * 100)
}

/** Convert pixels to inches (96 DPI) */
export function pxToInches(px: number): number {
	return px / 96
}

/** Map stroke dasharray string to PptxGenJS dash type */
function mapDashType(
	dasharray: string
): 'solid' | 'dash' | 'dashDot' | 'lgDash' | 'lgDashDot' | 'lgDashDotDot' | 'sysDash' | 'sysDot' {
	if (!dasharray || dasharray === 'none') return 'solid'
	const parts = dasharray.split(/[\s,]+/).map(Number)
	if (parts.length === 0) return 'solid'

	// Heuristic mapping based on dash/gap lengths
	const dash = parts[0] ?? 4
	const gap = parts[1] ?? dash
	const dot = parts[2]

	if (dash <= 2 && gap <= 2) return 'sysDot'
	if (dash <= 4 && gap <= 4 && dot === undefined) return 'sysDash'
	if (dash <= 4 && gap <= 4 && dot !== undefined) return 'dashDot'
	if (dash > 8) {
		if (dot !== undefined) return 'lgDashDot'
		return 'lgDash'
	}
	return 'dash'
}

/** Map Prezillo arrow type to PptxGenJS arrow type */
export function mapArrowType(
	type?: string
): 'none' | 'arrow' | 'diamond' | 'oval' | 'stealth' | 'triangle' {
	switch (type) {
		case 'arrow':
			return 'arrow'
		case 'triangle':
			return 'triangle'
		case 'circle':
			return 'oval'
		case 'diamond':
			return 'diamond'
		case 'bar':
			return 'stealth'
		default:
			return 'none'
	}
}

/** Map ResolvedShapeStyle to PptxGenJS fill props */
export function mapFill(style: ResolvedShapeStyle): PptxGenJS.ShapeFillProps | undefined {
	if (!style.fill || style.fill === 'none') {
		return { type: 'none' }
	}
	const transparency = opacityToTransparency(style.fillOpacity)
	return {
		color: hexToColor(style.fill),
		transparency: transparency > 0 ? transparency : undefined
	}
}

/** Map ResolvedShapeStyle to PptxGenJS line props */
export function mapLine(style: ResolvedShapeStyle): PptxGenJS.ShapeLineProps | undefined {
	if (!style.stroke || style.stroke === 'none' || style.strokeWidth === 0) {
		return undefined
	}
	const transparency = opacityToTransparency(style.strokeOpacity)
	return {
		color: hexToColor(style.stroke),
		width: style.strokeWidth * 0.75, // px to pt (approximate)
		dashType: mapDashType(style.strokeDasharray),
		transparency: transparency > 0 ? transparency : undefined
	}
}

/** Map shadow to PptxGenJS ShadowProps */
export function mapShadow(style: ResolvedShapeStyle): PptxGenJS.ShadowProps | undefined {
	if (!style.shadow) return undefined

	const { offsetX, offsetY, blur, color } = style.shadow
	// Calculate angle from offset (in degrees, 0 = right, 90 = down)
	const angle = Math.round((Math.atan2(offsetY, offsetX) * 180) / Math.PI)
	const offset = Math.round(Math.sqrt(offsetX * offsetX + offsetY * offsetY) * 0.75) // px to pt

	return {
		type: 'outer',
		color: hexToColor(color),
		blur: Math.round(blur * 0.75), // px to pt
		offset,
		angle: ((angle % 360) + 360) % 360,
		opacity: 0.5
	}
}

/** Map ResolvedTextStyle to PptxGenJS text base props (for TextPropsOptions) */
export function mapTextOptions(
	textStyle: ResolvedTextStyle,
	shapeStyle: ResolvedShapeStyle
): Partial<PptxGenJS.TextPropsOptions> {
	const result: Partial<PptxGenJS.TextPropsOptions> = {
		fontFace: textStyle.fontFamily.split(',')[0]?.trim().replace(/['"]/g, '') || 'Calibri',
		fontSize: Math.round(textStyle.fontSize * 0.75), // px to pt
		color: hexToColor(textStyle.fill),
		bold:
			textStyle.fontWeight === 'bold' ||
			(typeof textStyle.fontWeight === 'number' && textStyle.fontWeight >= 700),
		italic: textStyle.fontItalic,
		align: textStyle.textAlign === 'justify' ? 'justify' : textStyle.textAlign,
		valign: textStyle.verticalAlign,
		fill: mapFill(shapeStyle),
		line: mapLine(shapeStyle),
		shadow: mapShadow(shapeStyle),
		isTextBox: true,
		margin: 0
	}

	if (textStyle.textDecoration === 'underline') {
		result.underline = { style: 'sng' }
	}
	if (textStyle.textDecoration === 'line-through') {
		result.strike = 'sngStrike'
	}

	if (textStyle.lineHeight && textStyle.lineHeight !== 1.2) {
		result.lineSpacingMultiple = textStyle.lineHeight
	}

	if (textStyle.letterSpacing) {
		result.charSpacing = textStyle.letterSpacing * 0.75 // px to pt
	}

	if (textStyle.listBullet) {
		result.bullet = {
			type: 'bullet',
			characterCode: textStyle.listBullet.codePointAt(0)?.toString(16).toUpperCase()
		}
	}

	return result
}

// vim: ts=4
