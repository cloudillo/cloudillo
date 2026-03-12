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

import {
	type PDFContext,
	PDFName,
	PDFNumber,
	type PDFRef,
	type PDFObject,
	PDFOperator,
	PDFOperatorNames
} from 'pdf-lib'
import type { PDFPage } from 'pdf-lib'

import type { Annotation, FreehandAnnotation, RectAnnotation } from '../types.js'

// Mirrors pdf-lib's internal LiteralObject (not exported)
type PdfLiteral =
	| PdfLiteralObject
	| PdfLiteral[]
	| PDFObject[]
	| string
	| number
	| boolean
	| null
	| undefined
interface PdfLiteralObject {
	[name: string]: PdfLiteral | PDFObject
}

interface Placement {
	x: number
	y: number
	drawW: number
	drawH: number
}

function hexToRgb(hex: string): [number, number, number] {
	const h = hex.replace('#', '')
	if (!/^[0-9a-fA-F]{6}$/.test(h)) return [0, 0, 0]
	return [
		parseInt(h.substring(0, 2), 16) / 255,
		parseInt(h.substring(2, 4), 16) / 255,
		parseInt(h.substring(4, 6), 16) / 255
	]
}

function toPdfX(px: number, placement: Placement): number {
	return placement.x + px * placement.drawW
}

function toPdfY(py: number, placement: Placement): number {
	return placement.y + (1 - py) * placement.drawH
}

function createExtGState(context: PDFContext, opacity: number): PDFRef {
	const gsDict = context.obj({
		Type: 'ExtGState',
		CA: PDFNumber.of(opacity),
		ca: PDFNumber.of(opacity)
	})
	return context.register(gsDict)
}

function addInkAnnotation(
	page: PDFPage,
	context: PDFContext,
	ann: FreehandAnnotation,
	placement: Placement
): void {
	if (ann.points.length < 2) return

	const [r, g, b] = hexToRgb(ann.color)
	const strokeWidth = ann.strokeWidth * Math.min(placement.drawW, placement.drawH)
	const halfStroke = strokeWidth / 2

	// Convert points to PDF coordinates
	const pdfPoints = ann.points.map((p) => [toPdfX(p[0], placement), toPdfY(p[1], placement)])

	// Compute bounding rect
	let minX = Infinity,
		minY = Infinity,
		maxX = -Infinity,
		maxY = -Infinity
	for (const [px, py] of pdfPoints) {
		if (px < minX) minX = px
		if (py < minY) minY = py
		if (px > maxX) maxX = px
		if (py > maxY) maxY = py
	}
	minX -= halfStroke
	minY -= halfStroke
	maxX += halfStroke
	maxY += halfStroke

	const bboxW = maxX - minX
	const bboxH = maxY - minY

	// Build appearance stream operators
	const operators: PDFOperator[] = []
	operators.push(PDFOperator.of(PDFOperatorNames.PushGraphicsState))

	// Set up ExtGState for opacity if not fully opaque
	let gsRef: PDFRef | undefined
	if (ann.opacity < 1) {
		gsRef = createExtGState(context, ann.opacity)
		operators.push(PDFOperator.of(PDFOperatorNames.SetGraphicsStateParams, [PDFName.of('GS0')]))
	}

	// Line width
	operators.push(PDFOperator.of(PDFOperatorNames.SetLineWidth, [PDFNumber.of(strokeWidth)]))
	// Round cap and join
	operators.push(PDFOperator.of(PDFOperatorNames.SetLineCapStyle, [PDFNumber.of(1)]))
	operators.push(PDFOperator.of(PDFOperatorNames.SetLineJoinStyle, [PDFNumber.of(1)]))
	// Stroke color
	operators.push(
		PDFOperator.of(PDFOperatorNames.StrokingColorRgb, [
			PDFNumber.of(r),
			PDFNumber.of(g),
			PDFNumber.of(b)
		])
	)

	// Path: translate points relative to bbox origin
	const localPoints = pdfPoints.map(([px, py]) => [px - minX, py - minY])
	operators.push(
		PDFOperator.of(PDFOperatorNames.MoveTo, [
			PDFNumber.of(localPoints[0][0]),
			PDFNumber.of(localPoints[0][1])
		])
	)
	for (let i = 1; i < localPoints.length; i++) {
		operators.push(
			PDFOperator.of(PDFOperatorNames.LineTo, [
				PDFNumber.of(localPoints[i][0]),
				PDFNumber.of(localPoints[i][1])
			])
		)
	}
	operators.push(PDFOperator.of(PDFOperatorNames.StrokePath))
	operators.push(PDFOperator.of(PDFOperatorNames.PopGraphicsState))

	// Create appearance stream
	const apDict: PdfLiteralObject = {
		BBox: [0, 0, bboxW, bboxH],
		Matrix: [1, 0, 0, 1, minX, minY]
	}
	if (gsRef) {
		apDict.Resources = context.obj({
			ExtGState: context.obj({ GS0: gsRef })
		})
	}

	const apStream = context.formXObject(operators, apDict)
	const apStreamRef = context.register(apStream)

	// Build InkList: array of coordinate arrays
	const inkCoords: PDFNumber[] = []
	for (const [px, py] of pdfPoints) {
		inkCoords.push(PDFNumber.of(px))
		inkCoords.push(PDFNumber.of(py))
	}
	const inkListInner = context.obj(inkCoords)
	const inkList = context.obj([inkListInner])

	// Build annotation dict
	const annotDict = context.obj({
		Type: 'Annot',
		Subtype: 'Ink',
		Rect: [PDFNumber.of(minX), PDFNumber.of(minY), PDFNumber.of(maxX), PDFNumber.of(maxY)],
		InkList: inkList,
		C: [PDFNumber.of(r), PDFNumber.of(g), PDFNumber.of(b)],
		CA: PDFNumber.of(ann.opacity),
		F: PDFNumber.of(4), // Print flag
		AP: context.obj({ N: apStreamRef })
	})

	const annotRef = context.register(annotDict)
	page.node.addAnnot(annotRef)
}

function addSquareAnnotation(
	page: PDFPage,
	context: PDFContext,
	ann: RectAnnotation,
	placement: Placement
): void {
	const [r, g, b] = hexToRgb(ann.color)
	const strokeWidth = ann.strokeWidth * Math.min(placement.drawW, placement.drawH)
	const halfStroke = strokeWidth / 2

	// Convert rect to PDF coordinates (Y-flipped)
	const pdfX1 = toPdfX(ann.x, placement)
	const pdfY1 = toPdfY(ann.y + ann.height, placement) // bottom in PDF
	const pdfX2 = toPdfX(ann.x + ann.width, placement)
	const pdfY2 = toPdfY(ann.y, placement) // top in PDF

	const minX = Math.min(pdfX1, pdfX2) - halfStroke
	const minY = Math.min(pdfY1, pdfY2) - halfStroke
	const maxX = Math.max(pdfX1, pdfX2) + halfStroke
	const maxY = Math.max(pdfY1, pdfY2) + halfStroke

	const bboxW = maxX - minX
	const bboxH = maxY - minY

	// Rect relative to bbox
	const rectX = Math.min(pdfX1, pdfX2) - minX
	const rectY = Math.min(pdfY1, pdfY2) - minY
	const rectW = Math.abs(pdfX2 - pdfX1)
	const rectH = Math.abs(pdfY2 - pdfY1)

	const hasFill = !!ann.fill
	let fr = 0,
		fg = 0,
		fb = 0
	if (hasFill) {
		;[fr, fg, fb] = hexToRgb(ann.fill!)
	}

	// Build appearance stream operators
	const operators: PDFOperator[] = []
	operators.push(PDFOperator.of(PDFOperatorNames.PushGraphicsState))

	let gsRef: PDFRef | undefined
	if (ann.opacity < 1) {
		gsRef = createExtGState(context, ann.opacity)
		operators.push(PDFOperator.of(PDFOperatorNames.SetGraphicsStateParams, [PDFName.of('GS0')]))
	}

	operators.push(PDFOperator.of(PDFOperatorNames.SetLineWidth, [PDFNumber.of(strokeWidth)]))
	operators.push(
		PDFOperator.of(PDFOperatorNames.StrokingColorRgb, [
			PDFNumber.of(r),
			PDFNumber.of(g),
			PDFNumber.of(b)
		])
	)

	if (hasFill) {
		operators.push(
			PDFOperator.of(PDFOperatorNames.NonStrokingColorRgb, [
				PDFNumber.of(fr),
				PDFNumber.of(fg),
				PDFNumber.of(fb)
			])
		)
	}

	// Rectangle path
	operators.push(
		PDFOperator.of(PDFOperatorNames.AppendRectangle, [
			PDFNumber.of(rectX),
			PDFNumber.of(rectY),
			PDFNumber.of(rectW),
			PDFNumber.of(rectH)
		])
	)

	if (hasFill) {
		operators.push(PDFOperator.of(PDFOperatorNames.FillNonZeroAndStroke))
	} else {
		operators.push(PDFOperator.of(PDFOperatorNames.StrokePath))
	}

	operators.push(PDFOperator.of(PDFOperatorNames.PopGraphicsState))

	// Create appearance stream
	const apDict: PdfLiteralObject = {
		BBox: [0, 0, bboxW, bboxH],
		Matrix: [1, 0, 0, 1, minX, minY]
	}
	if (gsRef) {
		apDict.Resources = context.obj({
			ExtGState: context.obj({ GS0: gsRef })
		})
	}

	const apStream = context.formXObject(operators, apDict)
	const apStreamRef = context.register(apStream)

	// Build annotation dict
	const annotDictEntries: PdfLiteralObject = {
		Type: 'Annot',
		Subtype: 'Square',
		Rect: [PDFNumber.of(minX), PDFNumber.of(minY), PDFNumber.of(maxX), PDFNumber.of(maxY)],
		C: [PDFNumber.of(r), PDFNumber.of(g), PDFNumber.of(b)],
		CA: PDFNumber.of(ann.opacity),
		F: PDFNumber.of(4),
		BS: context.obj({
			W: PDFNumber.of(strokeWidth),
			S: PDFName.of('S')
		}),
		AP: context.obj({ N: apStreamRef })
	}

	if (hasFill) {
		annotDictEntries.IC = [PDFNumber.of(fr), PDFNumber.of(fg), PDFNumber.of(fb)]
	}

	const annotDict = context.obj(annotDictEntries)
	const annotRef = context.register(annotDict)
	page.node.addAnnot(annotRef)
}

export function addPdfAnnotations(
	page: PDFPage,
	context: PDFContext,
	annotations: Annotation[],
	placement: Placement
): void {
	for (const ann of annotations) {
		if (ann.type === 'freehand') {
			addInkAnnotation(page, context, ann, placement)
		} else if (ann.type === 'rect') {
			addSquareAnnotation(page, context, ann, placement)
		}
	}
}

// vim: ts=4
