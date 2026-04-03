// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Maps Prezillo objects to PptxGenJS slide operations
 */

import type PptxGenJS from 'pptxgenjs'
import type { DeltaOp } from '@cloudillo/canvas-text'

import type {
	YPrezilloDocument,
	PrezilloObject,
	RectObject,
	LineObject,
	PathObject,
	PolygonObject,
	TextObject,
	ImageObject,
	ConnectorObject,
	QrCodeObject,
	PollFrameObject,
	TableGridObject,
	SymbolObject,
	StoredObject,
	ResolvedShapeStyle,
	ResolvedTextStyle
} from '../crdt'
import {
	resolveShapeStyle,
	resolveTextStyle,
	DEFAULT_SHAPE_STYLE,
	DEFAULT_TEXT_STYLE
} from '../crdt'
import { calculateGridPositions } from '../components/TableGridRenderer'
import { getSymbolById } from '../data/symbol-library'
import {
	pxToInches,
	mapFill,
	mapLine,
	mapShadow,
	mapArrowType,
	hexToColor,
	mapTextOptions
} from './pptx-style-mapper'
import { deltaToTextProps } from './pptx-text-mapper'

interface ShapeMapperContext {
	doc: YPrezilloDocument
	imageCache: Map<string, string>
	/** Rasterized QR codes as base64 data URLs keyed by objectId */
	qrCache: Map<string, string>
}

/**
 * Add a single Prezillo object to a PptxGenJS slide
 */
export function addObjectToSlide(
	slide: PptxGenJS.Slide,
	object: PrezilloObject,
	context: ShapeMapperContext
): void {
	const storedObj = context.doc.o.get(object.id)
	const style = storedObj ? resolveShapeStyle(context.doc, storedObj) : DEFAULT_SHAPE_STYLE
	const textStyle = storedObj ? resolveTextStyle(context.doc, storedObj) : DEFAULT_TEXT_STYLE

	// Common position props (convert px to inches)
	const x = pxToInches(object.x)
	const y = pxToInches(object.y)
	const w = pxToInches(object.width)
	const h = pxToInches(object.height)

	// Rotation (prezillo already stores degrees)
	const rotate = object.rotation ? Math.round(object.rotation) : undefined

	switch (object.type) {
		case 'rect':
			addRect(slide, object as RectObject, style, { x, y, w, h, rotate })
			break

		case 'ellipse':
			addEllipse(slide, style, { x, y, w, h, rotate })
			break

		case 'line':
			addLine(slide, object as LineObject, style, { x, y, w, h, rotate })
			break

		case 'text':
			addText(slide, object as TextObject, context.doc, storedObj, style, textStyle, {
				x,
				y,
				w,
				h,
				rotate
			})
			break

		case 'image':
			addImage(slide, object as ImageObject, context.imageCache, { x, y, w, h, rotate })
			break

		case 'path':
			addPath(slide, object as PathObject, style, { x, y, w, h, rotate })
			break

		case 'polygon':
			addPolygon(slide, object as PolygonObject, style, { x, y, w, h, rotate })
			break

		case 'connector':
			addConnector(slide, object as ConnectorObject, context.doc, style, {
				x,
				y,
				w,
				h,
				rotate
			})
			break

		case 'qrcode':
			addQrCode(slide, object as QrCodeObject, context.qrCache, { x, y, w, h, rotate })
			break

		case 'pollframe':
			addPollFrame(slide, object as PollFrameObject, style, textStyle, { x, y, w, h, rotate })
			break

		case 'tablegrid':
			addTableGrid(slide, object as TableGridObject, style, { x, y, w, h, rotate })
			break

		case 'symbol':
			addSymbol(slide, object as SymbolObject, style, { x, y, w, h, rotate })
			break

		case 'document':
		case 'embed':
		case 'statevar':
			addPlaceholder(slide, object.type, { x, y, w, h, rotate })
			break
	}
}

// === Position helper ===

interface PosProps {
	x: number
	y: number
	w: number
	h: number
	rotate?: number
}

// === Shape mappers ===

function addRect(
	slide: PptxGenJS.Slide,
	obj: RectObject,
	style: ResolvedShapeStyle,
	pos: PosProps
): void {
	const cr = obj.cornerRadius
	// PptxGenJS rectRadius is in inches (the library converts to OOXML adj fraction internally)
	// cornerRadius can be a single number or [topLeft, topRight, bottomRight, bottomLeft] tuple
	const crValue = Array.isArray(cr) ? Math.max(...cr) : cr
	const shortSide = Math.min(obj.width, obj.height)
	const radius =
		typeof crValue === 'number' && crValue > 0
			? pxToInches(Math.min(crValue, shortSide / 2))
			: 0

	if (radius > 0) {
		slide.addShape('roundRect', {
			...pos,
			fill: mapFill(style),
			line: mapLine(style),
			shadow: mapShadow(style),
			rectRadius: radius
		})
	} else {
		slide.addShape('rect', {
			...pos,
			fill: mapFill(style),
			line: mapLine(style),
			shadow: mapShadow(style)
		})
	}
}

function addEllipse(slide: PptxGenJS.Slide, style: ResolvedShapeStyle, pos: PosProps): void {
	slide.addShape('ellipse', {
		...pos,
		fill: mapFill(style),
		line: mapLine(style),
		shadow: mapShadow(style)
	})
}

function addLine(
	slide: PptxGenJS.Slide,
	obj: LineObject,
	style: ResolvedShapeStyle,
	pos: PosProps
): void {
	const points = obj.points || [
		[0, obj.height / 2],
		[obj.width, obj.height / 2]
	]

	// PptxGenJS line uses the 'line' shape with x/y/w/h
	// Calculate bounding box from points
	const x1 = pos.x + pxToInches(points[0][0])
	const y1 = pos.y + pxToInches(points[0][1])
	const x2 = pos.x + pxToInches(points[1][0])
	const y2 = pos.y + pxToInches(points[1][1])

	// Don't apply pos.rotate here — the bbox is already recomputed from
	// rotated endpoint coordinates, so adding rotate would double-apply it.
	const lineOpts: PptxGenJS.ShapeProps = {
		x: Math.min(x1, x2),
		y: Math.min(y1, y2),
		w: Math.abs(x2 - x1) || 0.01, // PptxGenJS needs non-zero width
		h: Math.abs(y2 - y1) || 0.01,
		line: mapLine(style) || { color: hexToColor(style.stroke || '#000000'), width: 1 },
		fill: { type: 'none' }
	}

	// Arrows
	if (obj.startArrow && obj.startArrow.type !== 'none') {
		if (lineOpts.line) lineOpts.line.beginArrowType = mapArrowType(obj.startArrow.type)
	}
	if (obj.endArrow && obj.endArrow.type !== 'none') {
		if (lineOpts.line) lineOpts.line.endArrowType = mapArrowType(obj.endArrow.type)
	}

	// Determine if line goes bottom-left to top-right
	const flipV = y2 < y1 !== x2 < x1
	if (flipV) lineOpts.flipV = true

	slide.addShape('line', lineOpts)
}

function addText(
	slide: PptxGenJS.Slide,
	obj: TextObject,
	doc: YPrezilloDocument,
	storedObj: StoredObject | undefined,
	style: ResolvedShapeStyle,
	textStyle: ResolvedTextStyle,
	pos: PosProps
): void {
	const yText = doc.rt.get(obj.id)

	let textRuns: PptxGenJS.TextProps[] | string

	if (yText && yText.length > 0) {
		const delta = yText.toDelta() as DeltaOp[]
		textRuns = deltaToTextProps(delta)
	} else {
		// Fallback to plain text
		textRuns = obj.text || ''
	}

	// Check if the text object has an explicit fill set (not just the default)
	const hasExplicitFill = storedObj?.s?.f !== undefined || storedObj?.si !== undefined

	const textOpts = mapTextOptions(textStyle, style)
	// Only apply fill/line if explicitly set — text boxes default to transparent
	if (!hasExplicitFill) {
		textOpts.fill = { type: 'none' }
		textOpts.line = undefined
		textOpts.shadow = undefined
	}

	slide.addText(textRuns, {
		...pos,
		...textOpts
	})
}

function addImage(
	slide: PptxGenJS.Slide,
	obj: ImageObject,
	imageCache: Map<string, string>,
	pos: PosProps
): void {
	const dataUrl = imageCache.get(obj.fileId)
	if (!dataUrl) {
		// Placeholder for missing image
		slide.addShape('rect', {
			...pos,
			fill: { color: 'F0F0F0' },
			line: { color: 'CCCCCC', width: 1 }
		})
		return
	}

	slide.addImage({
		data: dataUrl,
		...pos
	})
}

function addPath(
	slide: PptxGenJS.Slide,
	_obj: PathObject,
	style: ResolvedShapeStyle,
	pos: PosProps
): void {
	// SVG path data can't be directly converted to PptxGenJS shapes
	// (PptxGenJS doesn't support freeform/custom geometry from path data).
	// Export as a styled rectangle placeholder.
	slide.addShape('rect', {
		...pos,
		fill: mapFill(style),
		line: mapLine(style),
		shadow: mapShadow(style)
	})
}

function addPolygon(
	slide: PptxGenJS.Slide,
	obj: PolygonObject,
	style: ResolvedShapeStyle,
	pos: PosProps
): void {
	if (!obj.points || obj.points.length < 2) return

	// Convert polygon points to PptxGenJS custom geometry points
	// Points are relative to object bounds, normalize to inches
	const pptxPoints: Array<{ x: number; y: number; moveTo?: boolean } | { close: true }> =
		obj.points.map((pt, i) => ({
			x: pxToInches(pt[0]),
			y: pxToInches(pt[1]),
			...(i === 0 ? { moveTo: true } : {})
		}))

	// Close the polygon if specified
	if (obj.closed !== false) {
		pptxPoints.push({ close: true })
	}

	// Use 'rect' as base shape with points override for custom geometry
	slide.addShape('rect', {
		...pos,
		points: pptxPoints,
		fill: mapFill(style),
		line: mapLine(style),
		shadow: mapShadow(style)
	})
}

function addConnector(
	slide: PptxGenJS.Slide,
	obj: ConnectorObject,
	_doc: YPrezilloDocument,
	style: ResolvedShapeStyle,
	pos: PosProps
): void {
	// Export connector as a simple line (loses dynamic connection)
	const lineProps: PptxGenJS.ShapeProps = {
		...pos,
		line: mapLine(style) || { color: hexToColor(style.stroke || '#000000'), width: 1 },
		fill: { type: 'none' }
	}

	if (obj.startArrow && obj.startArrow.type !== 'none') {
		if (lineProps.line) lineProps.line.beginArrowType = mapArrowType(obj.startArrow.type)
	}
	if (obj.endArrow && obj.endArrow.type !== 'none') {
		if (lineProps.line) lineProps.line.endArrowType = mapArrowType(obj.endArrow.type)
	}

	slide.addShape('line', lineProps)
}

function addQrCode(
	slide: PptxGenJS.Slide,
	obj: QrCodeObject,
	qrCache: Map<string, string>,
	pos: PosProps
): void {
	const dataUrl = qrCache.get(obj.id)
	if (dataUrl) {
		slide.addImage({ data: dataUrl, ...pos })
	} else {
		// Fallback placeholder
		slide.addShape('rect', {
			...pos,
			fill: { color: 'FFFFFF' },
			line: { color: '000000', width: 1 }
		})
	}
}

function addPollFrame(
	slide: PptxGenJS.Slide,
	obj: PollFrameObject,
	style: ResolvedShapeStyle,
	textStyle: ResolvedTextStyle,
	pos: PosProps
): void {
	const shapeName = obj.shape === 'ellipse' ? 'ellipse' : 'roundRect'
	slide.addShape(shapeName, {
		...pos,
		fill: mapFill(style),
		line: mapLine(style),
		shadow: mapShadow(style)
	})

	// Add label text overlay
	if (obj.label) {
		slide.addText(obj.label, {
			...pos,
			align: 'center',
			valign: 'middle',
			fontFace: textStyle.fontFamily.split(',')[0]?.trim().replace(/['"]/g, '') || 'Calibri',
			fontSize: Math.round(textStyle.fontSize * 0.75),
			color: hexToColor(textStyle.fill)
		})
	}
}

function addTableGrid(
	slide: PptxGenJS.Slide,
	obj: TableGridObject,
	style: ResolvedShapeStyle,
	pos: PosProps
): void {
	// Build a PptxGenJS table with empty cells + borders
	const { cols, rows, columnWidths, rowHeights } = obj
	const colPositions = calculateGridPositions(cols, columnWidths, obj.width)
	const rowPositions = calculateGridPositions(rows, rowHeights, obj.height)

	const borderColor = hexToColor(style.stroke || '#e5e7eb')
	const borderPt = Math.round((style.strokeWidth || 1) * 0.75)
	const border: PptxGenJS.BorderProps = { type: 'solid', color: borderColor, pt: borderPt }

	const tableRows: PptxGenJS.TableRow[] = []
	for (let r = 0; r < rows; r++) {
		const cells: PptxGenJS.TableCell[] = []
		for (let c = 0; c < cols; c++) {
			cells.push({
				text: '',
				options: {
					border: [border, border, border, border],
					fill: mapFill(style)
				}
			})
		}
		tableRows.push(cells)
	}

	// Calculate column widths in inches (guard against short position arrays)
	const colWidths: number[] = []
	for (let i = 0; i < cols && i + 1 < colPositions.length; i++) {
		colWidths.push(pxToInches(colPositions[i + 1] - colPositions[i]))
	}

	// Calculate row heights in inches
	const rowHeightsInches: number[] = []
	for (let i = 0; i < rows && i + 1 < rowPositions.length; i++) {
		rowHeightsInches.push(pxToInches(rowPositions[i + 1] - rowPositions[i]))
	}

	slide.addTable(tableRows, {
		x: pos.x,
		y: pos.y,
		w: pos.w,
		colW: colWidths,
		rowH: rowHeightsInches,
		border
	})
}

function addSymbol(
	slide: PptxGenJS.Slide,
	obj: SymbolObject,
	style: ResolvedShapeStyle,
	pos: PosProps
): void {
	const symbol = getSymbolById(obj.symbolId)
	if (!symbol) {
		// Placeholder for unknown symbol
		slide.addShape('rect', {
			...pos,
			fill: { color: 'CCCCCC' },
			line: { color: '999999', width: 1, dashType: 'dash' }
		})
		return
	}

	// Convert SVG path to PptxGenJS custom geometry
	const points = svgPathToPoints(symbol.pathData, symbol.viewBox[2], symbol.viewBox[3], pos)
	if (points) {
		slide.addShape('rect', {
			...pos,
			points,
			fill:
				style.fill && style.fill !== 'none'
					? { color: hexToColor(style.fill) }
					: { color: '333333' },
			line: mapLine(style),
			shadow: mapShadow(style)
		})
	} else {
		// Fallback: simple shape with fill
		slide.addShape('rect', {
			...pos,
			fill:
				style.fill && style.fill !== 'none'
					? { color: hexToColor(style.fill) }
					: { color: '333333' },
			line: mapLine(style)
		})
	}
}

function addPlaceholder(slide: PptxGenJS.Slide, type: string, pos: PosProps): void {
	const labels: Record<string, string> = {
		document: 'Embedded document',
		embed: 'Embedded media',
		statevar: 'Dynamic value'
	}

	slide.addShape('rect', {
		...pos,
		fill: { color: 'F0F0F0' },
		line: { color: 'CCCCCC', width: 1, dashType: 'dash' }
	})

	slide.addText(labels[type] || type, {
		...pos,
		align: 'center',
		valign: 'middle',
		fontSize: 10,
		color: '999999'
	})
}

// === SVG Path converter (basic) ===

/**
 * Attempt to convert simple SVG path data to PptxGenJS custom geometry points.
 * Handles M, L, Z commands. Returns null for complex paths (curves, arcs).
 */
function svgPathToPoints(
	d: string,
	viewWidth: number,
	viewHeight: number,
	pos: PosProps
): Array<{ x: number; y: number; moveTo?: boolean } | { close: true }> | null {
	const scaleX = pos.w / viewWidth
	const scaleY = pos.h / viewHeight
	const commands = d.match(/[MLHVZCQSAmlhvzcsqa][^MLHVZCQSAmlhvzcsqa]*/gi)
	if (!commands) return null

	const points: Array<{ x: number; y: number; moveTo?: boolean } | { close: true }> = []
	let curX = 0
	let curY = 0
	let isFirst = true

	for (const cmd of commands) {
		const type = cmd[0]
		const nums = cmd
			.slice(1)
			.trim()
			.split(/[\s,]+/)
			.map(Number)
			.filter((n) => !Number.isNaN(n))

		switch (type) {
			case 'M':
				curX = nums[0]
				curY = nums[1]
				points.push({
					x: curX * scaleX,
					y: curY * scaleY,
					moveTo: true
				})
				isFirst = false
				// Per SVG spec, extra coordinate pairs after M are implicit lineto
				for (let i = 2; i < nums.length; i += 2) {
					curX = nums[i]
					curY = nums[i + 1]
					points.push({ x: curX * scaleX, y: curY * scaleY })
				}
				break

			case 'm':
				curX += nums[0]
				curY += nums[1]
				points.push({
					x: curX * scaleX,
					y: curY * scaleY,
					moveTo: isFirst
				})
				isFirst = false
				// Per SVG spec, extra coordinate pairs after m are implicit relative lineto
				for (let i = 2; i < nums.length; i += 2) {
					curX += nums[i]
					curY += nums[i + 1]
					points.push({ x: curX * scaleX, y: curY * scaleY })
				}
				break

			case 'L':
				for (let i = 0; i < nums.length; i += 2) {
					curX = nums[i]
					curY = nums[i + 1]
					points.push({ x: curX * scaleX, y: curY * scaleY })
				}
				break

			case 'l':
				for (let i = 0; i < nums.length; i += 2) {
					curX += nums[i]
					curY += nums[i + 1]
					points.push({ x: curX * scaleX, y: curY * scaleY })
				}
				break

			case 'H':
				curX = nums[0]
				points.push({ x: curX * scaleX, y: curY * scaleY })
				break

			case 'h':
				curX += nums[0]
				points.push({ x: curX * scaleX, y: curY * scaleY })
				break

			case 'V':
				curY = nums[0]
				points.push({ x: curX * scaleX, y: curY * scaleY })
				break

			case 'v':
				curY += nums[0]
				points.push({ x: curX * scaleX, y: curY * scaleY })
				break

			case 'Z':
			case 'z':
				points.push({ close: true })
				break

			default:
				// Complex command (C, Q, S, A, etc.) — bail out
				return null
		}
	}

	return points.length >= 2 ? points : null
}

// vim: ts=4
