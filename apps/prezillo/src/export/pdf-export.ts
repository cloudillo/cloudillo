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
 * PDF Export - generates PDF from Prezillo presentations
 *
 * Uses svg2pdf.js + jsPDF to convert SVG slides to vector PDF.
 * Handles the conversion of foreignObject elements (text, QR codes)
 * to native SVG elements before PDF conversion.
 */

import { jsPDF } from 'jspdf'
import { svg2pdf } from 'svg2pdf.js'
import { createLinearGradientDef, createRadialGradientDef } from '@cloudillo/canvas-tools'
import type { Gradient } from '@cloudillo/canvas-tools'

import type {
	YPrezilloDocument,
	ViewNode,
	PrezilloObject,
	ImageObject,
	QrCodeObject,
	TextObject,
	PollFrameObject,
	TableGridObject,
	SymbolObject
} from '../crdt'
import {
	resolveShapeStyle,
	resolveTextStyle,
	DEFAULT_SHAPE_STYLE,
	DEFAULT_TEXT_STYLE,
	getObjectsInViewInZOrder,
	toViewId,
	getAbsolutePositionStored
} from '../crdt'
import { calculateRotationTransform, buildStrokeProps, buildFillProps } from '../utils'
import { getSymbolById } from '../data/symbol-library'
import { calculateGridPositions } from '../components/TableGridRenderer'
import type { PDFExportOptions, RenderContext, Bounds } from './types'
import { createSVGTextElement } from './text-converter'
import { createRichTextSVGElement } from '@cloudillo/canvas-text'
import type { DeltaOp, BaseTextStyle } from '@cloudillo/canvas-text'
import { createQRCodeSVGElements } from './qr-renderer'
import {
	preloadImages,
	collectImageObjectsFromArray,
	createImageSVGElement
} from './image-embedder'
import { registerUsedFonts, getPDFFontFamily } from './font-handler'

// Default slide dimensions (1920x1080 for 16:9)
const DEFAULT_WIDTH = 1920
const DEFAULT_HEIGHT = 1080

// PDF points per pixel (72 DPI)
const POINTS_PER_PIXEL = 72 / 96

/**
 * Get objects for a specific view/slide using the correct CRDT query
 * This properly filters:
 * - Page-relative objects: only included if on THIS page
 * - Floating objects: only included if spatially intersecting with view
 * - Prototype objects: excluded (they're for templates)
 *
 * Transforms object coordinates to view-relative coordinates (0,0 = view origin)
 * so they render correctly in SVG with viewBox starting at 0,0.
 */
function getViewObjects(doc: YPrezilloDocument, view: ViewNode): PrezilloObject[] {
	const objects = getObjectsInViewInZOrder(doc, toViewId(view.id))

	// Transform to view-relative coordinates
	return objects.map((obj) => {
		const stored = doc.o.get(obj.id)
		if (!stored) return obj

		// Get global position (handles page-relative + container hierarchy)
		const globalPos = getAbsolutePositionStored(doc, stored)
		if (!globalPos) return obj

		// Convert to view-relative coordinates (subtract view origin)
		return {
			...obj,
			x: globalPos.x - view.x,
			y: globalPos.y - view.y
		}
	})
}

/**
 * Convert percentage string to decimal (e.g., "50%" -> "0.5")
 * svg2pdf.js doesn't fully support percentage values for gradients
 */
function percentToDecimal(value: string): string {
	if (value.endsWith('%')) {
		return String(parseFloat(value) / 100)
	}
	return value
}

/**
 * Create gradient definition element
 * Note: Uses decimal values (0-1) instead of percentages for svg2pdf.js compatibility
 */
function createGradientDef(id: string, gradient: Gradient): SVGElement | null {
	if (gradient.type === 'linear' && gradient.stops) {
		const def = createLinearGradientDef(gradient.angle ?? 180, gradient.stops)
		const el = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient')
		el.setAttribute('id', id)
		// Convert percentages to decimals for svg2pdf.js compatibility
		el.setAttribute('x1', percentToDecimal(def.x1))
		el.setAttribute('y1', percentToDecimal(def.y1))
		el.setAttribute('x2', percentToDecimal(def.x2))
		el.setAttribute('y2', percentToDecimal(def.y2))

		for (const stop of def.stops) {
			const stopEl = document.createElementNS('http://www.w3.org/2000/svg', 'stop')
			stopEl.setAttribute('offset', percentToDecimal(stop.offset))
			stopEl.setAttribute('stop-color', stop.stopColor)
			el.appendChild(stopEl)
		}
		return el
	}

	if (gradient.type === 'radial' && gradient.stops) {
		const def = createRadialGradientDef(
			gradient.centerX ?? 0.5,
			gradient.centerY ?? 0.5,
			gradient.stops
		)
		const el = document.createElementNS('http://www.w3.org/2000/svg', 'radialGradient')
		el.setAttribute('id', id)
		// Convert percentages to decimals for svg2pdf.js compatibility
		el.setAttribute('cx', percentToDecimal(def.cx))
		el.setAttribute('cy', percentToDecimal(def.cy))
		el.setAttribute('r', percentToDecimal(def.r))

		for (const stop of def.stops) {
			const stopEl = document.createElementNS('http://www.w3.org/2000/svg', 'stop')
			stopEl.setAttribute('offset', percentToDecimal(stop.offset))
			stopEl.setAttribute('stop-color', stop.stopColor)
			el.appendChild(stopEl)
		}
		return el
	}

	return null
}

/**
 * Render a single object to SVG elements
 */
async function renderObjectToSVG(
	object: PrezilloObject,
	context: RenderContext,
	defs: SVGDefsElement
): Promise<SVGElement | null> {
	const storedObj = context.doc.o.get(object.id)
	const style = storedObj ? resolveShapeStyle(context.doc, storedObj) : DEFAULT_SHAPE_STYLE
	const textStyle = storedObj ? resolveTextStyle(context.doc, storedObj) : DEFAULT_TEXT_STYLE

	// Build common props
	const strokeProps = buildStrokeProps(style)
	const gradientId = style.fillGradient ? `grad-${object.id}` : null
	const fillProps = buildFillProps(style, gradientId)

	// Add gradient definition if needed
	if (gradientId && style.fillGradient) {
		const gradDef = createGradientDef(gradientId, style.fillGradient)
		if (gradDef) defs.appendChild(gradDef)
	}

	// Calculate rotation transform
	const rotationTransform = calculateRotationTransform(object)
	const objectOpacity = object.opacity !== 1 ? object.opacity : undefined

	// Create wrapper group
	const g = document.createElementNS('http://www.w3.org/2000/svg', 'g')
	if (rotationTransform) g.setAttribute('transform', rotationTransform)
	if (objectOpacity !== undefined) g.setAttribute('opacity', String(objectOpacity))

	let content: SVGElement | DocumentFragment | null = null

	switch (object.type) {
		case 'rect': {
			const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
			rect.setAttribute('x', String(object.x))
			rect.setAttribute('y', String(object.y))
			rect.setAttribute('width', String(object.width))
			rect.setAttribute('height', String(object.height))
			if ((object as any).cornerRadius) {
				rect.setAttribute('rx', String((object as any).cornerRadius))
			}
			applyStyleProps(rect, fillProps, strokeProps)
			content = rect
			break
		}

		case 'ellipse': {
			const ellipse = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse')
			ellipse.setAttribute('cx', String(object.x + object.width / 2))
			ellipse.setAttribute('cy', String(object.y + object.height / 2))
			ellipse.setAttribute('rx', String(object.width / 2))
			ellipse.setAttribute('ry', String(object.height / 2))
			applyStyleProps(ellipse, fillProps, strokeProps)
			content = ellipse
			break
		}

		case 'line': {
			const lineObj = object as any
			const points = lineObj.points || [
				[0, object.height / 2],
				[object.width, object.height / 2]
			]
			const line = document.createElementNS('http://www.w3.org/2000/svg', 'line')
			line.setAttribute('x1', String(object.x + points[0][0]))
			line.setAttribute('y1', String(object.y + points[0][1]))
			line.setAttribute('x2', String(object.x + points[1][0]))
			line.setAttribute('y2', String(object.y + points[1][1]))
			applyStyleProps(line, {}, strokeProps)
			content = line
			break
		}

		case 'text': {
			// Try rich text from Y.Text first, fall back to plain text
			const yText = context.doc.rt.get(object.id)
			const pdfFontFamily = getPDFFontFamily(textStyle.fontFamily || 'Lato')

			if (yText && yText.length > 0) {
				const delta = yText.toDelta() as DeltaOp[]
				const baseStyle: BaseTextStyle = {
					fontFamily: pdfFontFamily,
					fontSize: textStyle.fontSize,
					fontWeight: textStyle.fontWeight,
					fontItalic: textStyle.fontItalic,
					textDecoration: textStyle.textDecoration,
					fill: textStyle.fill,
					textAlign: textStyle.textAlign,
					verticalAlign: textStyle.verticalAlign,
					lineHeight: textStyle.lineHeight,
					letterSpacing: textStyle.letterSpacing,
					listBullet: textStyle.listBullet
				}
				content = createRichTextSVGElement(
					delta,
					{
						x: object.x,
						y: object.y,
						width: object.width,
						height: object.height
					},
					baseStyle
				)
			} else {
				// Fallback to plain text (legacy)
				const textObj = object as TextObject
				const textContent = textObj.text || ''
				if (textContent.trim() === '') return null

				const pdfTextStyle = {
					...textStyle,
					fontFamily: pdfFontFamily
				}

				content = createSVGTextElement(
					textContent,
					{
						x: object.x,
						y: object.y,
						width: object.width,
						height: object.height
					},
					pdfTextStyle
				)
			}
			break
		}

		case 'image': {
			const imageObj = object as ImageObject
			content = createImageSVGElement(imageObj, context.imageCache)
			break
		}

		case 'qrcode': {
			const qrObj = object as QrCodeObject
			content = await createQRCodeSVGElements(qrObj, {
				x: object.x,
				y: object.y,
				width: object.width,
				height: object.height
			})
			break
		}

		case 'pollframe': {
			// Render pollframe as a simple rect with label
			const pollObj = object as PollFrameObject
			const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
			rect.setAttribute('x', String(object.x))
			rect.setAttribute('y', String(object.y))
			rect.setAttribute('width', String(object.width))
			rect.setAttribute('height', String(object.height))
			applyStyleProps(rect, fillProps, strokeProps)

			const fragment = document.createDocumentFragment()
			fragment.appendChild(rect)

			// Add label if present
			if (pollObj.label) {
				const pdfLabelStyle = {
					...textStyle,
					fontFamily: getPDFFontFamily(textStyle.fontFamily || 'Lato'),
					textAlign: 'center' as const,
					verticalAlign: 'middle' as const
				}
				const labelEl = createSVGTextElement(
					pollObj.label,
					{
						x: object.x,
						y: object.y,
						width: object.width,
						height: object.height
					},
					pdfLabelStyle
				)
				if (labelEl) fragment.appendChild(labelEl)
			}

			content = fragment
			break
		}

		case 'tablegrid': {
			// Render table grid as SVG lines
			const gridObj = object as TableGridObject
			const { cols, rows, columnWidths, rowHeights } = gridObj

			// Calculate column and row positions
			const colPositions = calculateGridPositions(cols, columnWidths, object.width)
			const rowPositions = calculateGridPositions(rows, rowHeights, object.height)

			// Use stroke style for grid lines (default to light gray)
			const strokeColor = style.stroke || '#e5e7eb'
			const strokeWidth = style.strokeWidth || 1
			const strokeOpacity = style.strokeOpacity ?? 1

			// Use fill style for background (default to none/transparent)
			const fillColor = style.fill || 'none'
			const fillOpacity = style.fillOpacity ?? 1

			const fragment = document.createDocumentFragment()

			// Outer border rect with fill
			const borderRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
			borderRect.setAttribute('x', String(object.x))
			borderRect.setAttribute('y', String(object.y))
			borderRect.setAttribute('width', String(object.width))
			borderRect.setAttribute('height', String(object.height))
			borderRect.setAttribute('fill', fillColor)
			if (fillOpacity !== 1) {
				borderRect.setAttribute('fill-opacity', String(fillOpacity))
			}
			borderRect.setAttribute('stroke', strokeColor)
			borderRect.setAttribute('stroke-width', String(strokeWidth))
			if (strokeOpacity !== 1) {
				borderRect.setAttribute('stroke-opacity', String(strokeOpacity))
			}
			fragment.appendChild(borderRect)

			// Vertical lines (column dividers) - skip first and last
			for (let i = 1; i < colPositions.length - 1; i++) {
				const xPos = colPositions[i]
				const line = document.createElementNS('http://www.w3.org/2000/svg', 'line')
				line.setAttribute('x1', String(object.x + xPos))
				line.setAttribute('y1', String(object.y))
				line.setAttribute('x2', String(object.x + xPos))
				line.setAttribute('y2', String(object.y + object.height))
				line.setAttribute('stroke', strokeColor)
				line.setAttribute('stroke-width', String(strokeWidth))
				if (strokeOpacity !== 1) {
					line.setAttribute('stroke-opacity', String(strokeOpacity))
				}
				fragment.appendChild(line)
			}

			// Horizontal lines (row dividers) - skip first and last
			for (let i = 1; i < rowPositions.length - 1; i++) {
				const yPos = rowPositions[i]
				const line = document.createElementNS('http://www.w3.org/2000/svg', 'line')
				line.setAttribute('x1', String(object.x))
				line.setAttribute('y1', String(object.y + yPos))
				line.setAttribute('x2', String(object.x + object.width))
				line.setAttribute('y2', String(object.y + yPos))
				line.setAttribute('stroke', strokeColor)
				line.setAttribute('stroke-width', String(strokeWidth))
				if (strokeOpacity !== 1) {
					line.setAttribute('stroke-opacity', String(strokeOpacity))
				}
				fragment.appendChild(line)
			}

			content = fragment
			break
		}

		case 'symbol': {
			const symbolObj = object as SymbolObject
			const symbol = getSymbolById(symbolObj.symbolId)

			if (!symbol) {
				// Fallback: render placeholder rect if symbol not found
				const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
				rect.setAttribute('x', String(object.x))
				rect.setAttribute('y', String(object.y))
				rect.setAttribute('width', String(object.width))
				rect.setAttribute('height', String(object.height))
				rect.setAttribute('fill', '#cccccc')
				rect.setAttribute('stroke', '#999999')
				rect.setAttribute('stroke-width', '1')
				rect.setAttribute('stroke-dasharray', '4 2')
				content = rect
				break
			}

			const [vbX, vbY, vbWidth, vbHeight] = symbol.viewBox

			// Calculate transform to fit symbol in bounds while preserving aspect ratio
			const symbolAspect = vbWidth / vbHeight
			const boundsAspect = object.width / object.height

			let scaleX: number
			let scaleY: number
			let offsetX = 0
			let offsetY = 0

			if (symbolAspect > boundsAspect) {
				// Symbol is wider - fit to width, center vertically
				scaleX = object.width / vbWidth
				scaleY = scaleX
				offsetY = (object.height - vbHeight * scaleY) / 2
			} else {
				// Symbol is taller - fit to height, center horizontally
				scaleY = object.height / vbHeight
				scaleX = scaleY
				offsetX = (object.width - vbWidth * scaleX) / 2
			}

			// Build fill value - use gradient if provided, otherwise use solid fill
			const fillValue = gradientId
				? `url(#${gradientId})`
				: fillProps.fill === 'none'
					? 'none'
					: fillProps.fill

			// Create group with transform
			const symbolG = document.createElementNS('http://www.w3.org/2000/svg', 'g')
			const translateX = object.x + offsetX - vbX * scaleX
			const translateY = object.y + offsetY - vbY * scaleY
			symbolG.setAttribute(
				'transform',
				`translate(${translateX}, ${translateY}) scale(${scaleX}, ${scaleY})`
			)

			// Create path element
			const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
			path.setAttribute('d', symbol.pathData)
			path.setAttribute('fill', fillValue || '#333333')
			if (style.fillOpacity !== undefined && style.fillOpacity !== 1) {
				path.setAttribute('fill-opacity', String(style.fillOpacity))
			}

			// Apply stroke (adjusted for scaling)
			if (style.stroke && style.stroke !== 'none') {
				path.setAttribute('stroke', style.stroke)
				path.setAttribute('stroke-width', String((style.strokeWidth || 1) / scaleX))
				if (style.strokeOpacity !== undefined && style.strokeOpacity !== 1) {
					path.setAttribute('stroke-opacity', String(style.strokeOpacity))
				}
				if (style.strokeDasharray) {
					path.setAttribute('stroke-dasharray', style.strokeDasharray)
				}
				if (style.strokeLinecap) {
					path.setAttribute('stroke-linecap', style.strokeLinecap)
				}
				if (style.strokeLinejoin) {
					path.setAttribute('stroke-linejoin', style.strokeLinejoin)
				}
			}

			symbolG.appendChild(path)
			content = symbolG
			break
		}

		default: {
			// Fallback rectangle
			const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
			rect.setAttribute('x', String(object.x))
			rect.setAttribute('y', String(object.y))
			rect.setAttribute('width', String(object.width))
			rect.setAttribute('height', String(object.height))
			applyStyleProps(rect, fillProps, strokeProps)
			content = rect
		}
	}

	if (content) {
		if (content instanceof DocumentFragment) {
			g.appendChild(content)
		} else {
			g.appendChild(content)
		}
		return g
	}

	return null
}

/**
 * Apply fill and stroke props to an SVG element
 */
function applyStyleProps(
	el: SVGElement,
	fillProps: Record<string, any>,
	strokeProps: Record<string, any>
): void {
	for (const [key, value] of Object.entries(fillProps)) {
		if (value !== undefined) {
			el.setAttribute(key, String(value))
		}
	}
	for (const [key, value] of Object.entries(strokeProps)) {
		if (value !== undefined) {
			el.setAttribute(key, String(value))
		}
	}
}

/**
 * Render a slide/view to an SVG element
 */
async function renderSlideToSVG(
	view: ViewNode,
	objects: PrezilloObject[],
	context: RenderContext
): Promise<SVGSVGElement> {
	const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
	svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
	// Use 0,0 as origin - objects are already transformed to absolute positions
	// view.x/y is the slide position in the editor, not the content origin
	svg.setAttribute('viewBox', `0 0 ${view.width} ${view.height}`)
	svg.setAttribute('width', String(view.width))
	svg.setAttribute('height', String(view.height))

	// Create defs element for gradients
	const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs')
	svg.appendChild(defs)

	// Render background at origin (0,0)
	const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
	bgRect.setAttribute('x', '0')
	bgRect.setAttribute('y', '0')
	bgRect.setAttribute('width', String(view.width))
	bgRect.setAttribute('height', String(view.height))

	// Handle background gradient
	const gradient = view.backgroundGradient
	const hasGradient = gradient && gradient.type !== 'solid' && (gradient.stops?.length ?? 0) >= 2

	if (hasGradient && gradient && gradient.stops) {
		const gradientId = `bg-grad-${view.id}`
		const gradDef = createGradientDef(gradientId, gradient as Gradient)
		if (gradDef) {
			defs.appendChild(gradDef)
			bgRect.setAttribute('fill', `url(#${gradientId})`)
		}
	} else {
		bgRect.setAttribute('fill', view.backgroundColor || '#ffffff')
	}

	svg.appendChild(bgRect)

	// Render objects (already properly filtered by getViewObjects)
	for (const object of objects) {
		const el = await renderObjectToSVG(object, context, defs)
		if (el) svg.appendChild(el)
	}

	return svg
}

/**
 * Export presentation to PDF
 */
export async function exportToPDF(
	doc: YPrezilloDocument,
	views: ViewNode[],
	options: PDFExportOptions = {}
): Promise<void> {
	const { filename, ownerTag, onProgress } = options

	if (views.length === 0) {
		throw new Error('No slides to export')
	}

	// Get document name
	const docName = (doc.m.get('name') as string) || 'presentation'
	const safeName = docName.replace(/[^a-zA-Z0-9-_]/g, '_')
	const finalFilename = filename || `${safeName}.pdf`

	onProgress?.(0)

	// Collect all objects from all views
	const allObjects: PrezilloObject[] = []
	for (const view of views) {
		const viewObjects = getViewObjects(doc, view)
		allObjects.push(...viewObjects)
	}

	// Pre-load images
	const imageObjects = collectImageObjectsFromArray(allObjects)
	const imageCache = await preloadImages(imageObjects, ownerTag, (loaded, total) => {
		// Image loading is 0-30% of progress
		onProgress?.(Math.round((loaded / total) * 30))
	})

	const context: RenderContext = {
		doc,
		ownerTag,
		imageCache
	}

	// Get first slide dimensions for PDF page size
	const firstView = views[0]
	const pageWidth = firstView.width || DEFAULT_WIDTH
	const pageHeight = firstView.height || DEFAULT_HEIGHT

	// Create PDF with custom page size (in mm)
	// Convert pixels to mm (assuming 96 DPI screen)
	const mmPerPixel = 25.4 / 96
	const pdfWidth = pageWidth * mmPerPixel
	const pdfHeight = pageHeight * mmPerPixel

	const pdf = new jsPDF({
		orientation: pdfWidth > pdfHeight ? 'landscape' : 'portrait',
		unit: 'mm',
		format: [pdfWidth, pdfHeight]
	})

	// Set display mode to single page (not book/spread layout)
	pdf.setDisplayMode('fullwidth', 'single', null)

	// Also set PageLayout directly in the PDF catalog
	const pdfInternal = pdf.internal as any
	if (pdfInternal.events) {
		pdfInternal.events.subscribe('putCatalog', () => {
			pdfInternal.out('/PageLayout /SinglePage')
		})
	}

	// Register fonts used in the document
	await registerUsedFonts(pdf, doc, views, (loaded, total) => {
		// Font loading is 30-40% of progress
		onProgress?.(30 + Math.round((loaded / total) * 10))
	})

	// Render each slide
	for (let i = 0; i < views.length; i++) {
		const view = views[i]
		const viewObjects = getViewObjects(doc, view)

		// Calculate this view's dimensions in mm
		const vWidth = view.width || DEFAULT_WIDTH
		const vHeight = view.height || DEFAULT_HEIGHT
		const vPdfWidth = vWidth * mmPerPixel
		const vPdfHeight = vHeight * mmPerPixel

		// Add new page for subsequent slides
		if (i > 0) {
			pdf.addPage([vPdfWidth, vPdfHeight], vPdfWidth > vPdfHeight ? 'landscape' : 'portrait')
		}

		// Render slide to SVG
		const svg = await renderSlideToSVG(view, viewObjects, context)

		// Convert SVG to PDF using THIS view's dimensions
		await svg2pdf(svg, pdf, {
			x: 0,
			y: 0,
			width: vPdfWidth,
			height: vPdfHeight
		})

		// Update progress (40-100% for slide rendering)
		onProgress?.(40 + Math.round(((i + 1) / views.length) * 60))
	}

	// Save PDF
	pdf.save(finalFilename)
	onProgress?.(100)
}

/**
 * Download PDF export (convenience wrapper)
 */
export async function downloadPDF(
	doc: YPrezilloDocument,
	views: ViewNode[],
	ownerTag?: string,
	onProgress?: (progress: number) => void
): Promise<void> {
	await exportToPDF(doc, views, { ownerTag, onProgress })
}

// vim: ts=4
