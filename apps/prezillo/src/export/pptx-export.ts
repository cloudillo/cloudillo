// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * PPTX Export - generates PowerPoint presentations from Prezillo documents
 *
 * Uses PptxGenJS to create native PowerPoint shapes (not rasterized SVG),
 * ensuring maximum editability when opened in PowerPoint/LibreOffice.
 */

import type { YPrezilloDocument, ViewNode, PrezilloObject, QrCodeObject } from '../crdt'
import { getViewObjects } from './view-objects'
import { collectImageObjectsFromArray, preloadImages } from './image-embedder'
import { pxToInches, hexToColor } from './pptx-style-mapper'
import { addObjectToSlide } from './pptx-shape-mapper'

// Default slide dimensions (1920x1080 for 16:9)
const DEFAULT_WIDTH = 1920
const DEFAULT_HEIGHT = 1080

export interface PPTXExportOptions {
	filename?: string
	ownerTag?: string
	token?: string
	onProgress?: (progress: number) => void
}

/**
 * Render a QR code to a PNG data URL via canvas
 */
async function renderQrToDataUrl(obj: QrCodeObject): Promise<string> {
	const qrModule = await import('qrcode')
	// Handle both ESM default export and CJS-style module
	const QRCode = qrModule.default ?? qrModule
	const toDataURL = QRCode.toDataURL ?? qrModule.toDataURL
	if (typeof toDataURL !== 'function') {
		throw new Error('QRCode.toDataURL not available')
	}
	const ecMap: Record<string, 'L' | 'M' | 'Q' | 'H'> = {
		low: 'L',
		medium: 'M',
		quartile: 'Q',
		high: 'H'
	}
	return toDataURL(obj.url, {
		errorCorrectionLevel: ecMap[obj.errorCorrection || 'medium'] || 'M',
		color: {
			dark: obj.foreground || '#000000',
			light: obj.background || '#ffffff'
		},
		width: Math.max(obj.width, 256),
		margin: 1
	})
}

/**
 * Pre-render all QR codes to PNG data URLs
 */
async function preloadQrCodes(
	objects: PrezilloObject[],
	onProgress?: (loaded: number, total: number) => void
): Promise<Map<string, string>> {
	// Deduplicate by object ID (floating QR codes may appear on multiple slides)
	const seen = new Set<string>()
	const qrObjects = objects.filter((obj): obj is QrCodeObject => {
		if (obj.type !== 'qrcode' || seen.has(obj.id)) return false
		seen.add(obj.id)
		return true
	})
	const cache = new Map<string, string>()
	let loaded = 0

	for (const obj of qrObjects) {
		try {
			const dataUrl = await renderQrToDataUrl(obj)
			cache.set(obj.id, dataUrl)
		} catch (error) {
			console.error(`Failed to render QR code ${obj.id}:`, error)
		}
		loaded++
		onProgress?.(loaded, qrObjects.length)
	}

	return cache
}

/**
 * Export presentation to PPTX
 */
export async function exportToPPTX(
	doc: YPrezilloDocument,
	views: ViewNode[],
	options: PPTXExportOptions = {}
): Promise<void> {
	const { filename, ownerTag, token, onProgress } = options

	if (views.length === 0) {
		throw new Error('No slides to export')
	}

	// Dynamic import to avoid loading PptxGenJS at app startup
	const PptxGenJS = (await import('pptxgenjs')).default

	const docName = (doc.m.get('name') as string) || 'presentation'
	const safeName = docName.replace(/[^a-zA-Z0-9-_]/g, '_')
	const finalFilename = filename || `${safeName}.pptx`

	onProgress?.(0)

	// Collect all objects from all views (compute once per slide, reuse in render loop)
	const viewObjectsBySlide = views.map((view) => getViewObjects(doc, view))
	const allObjects = viewObjectsBySlide.flat()

	// Pre-load images (0-30% progress)
	const imageObjects = collectImageObjectsFromArray(allObjects)
	const imageCache = await preloadImages(imageObjects, ownerTag, token, (loaded, total) => {
		onProgress?.(total > 0 ? Math.round((loaded / total) * 30) : 0)
	})
	onProgress?.(30)

	// Pre-render QR codes (30-40% progress)
	const qrCache = await preloadQrCodes(allObjects, (loaded, total) => {
		onProgress?.(total > 0 ? 30 + Math.round((loaded / total) * 10) : 30)
	})
	onProgress?.(40)

	// Create presentation
	const pptx = new PptxGenJS()
	pptx.title = docName
	pptx.subject = 'Exported from Cloudillo Prezillo'

	// Use first slide dimensions to define the layout
	const firstView = views[0]
	const layoutW = pxToInches(firstView.width || DEFAULT_WIDTH)
	const layoutH = pxToInches(firstView.height || DEFAULT_HEIGHT)
	pptx.defineLayout({ name: 'PREZILLO', width: layoutW, height: layoutH })
	pptx.layout = 'PREZILLO'

	// Render each slide (40-95% progress)
	for (let i = 0; i < views.length; i++) {
		const view = views[i]
		const slide = pptx.addSlide()

		// Slide background
		// PptxGenJS doesn't support gradient backgrounds, so use first stop color as fallback
		if (view.backgroundGradient?.stops && view.backgroundGradient.stops.length > 0) {
			slide.background = { color: hexToColor(view.backgroundGradient.stops[0].color) }
		} else if (view.backgroundColor) {
			slide.background = { color: hexToColor(view.backgroundColor) }
		}

		// Slide notes
		if (view.notes) {
			slide.addNotes(view.notes)
		}

		// Hidden slide
		if (view.hidden) {
			slide.hidden = true
		}

		// Add objects
		const viewObjects = viewObjectsBySlide[i]
		for (const obj of viewObjects) {
			// Skip invisible, hidden (presentation mode), and prototype objects
			if (!obj.visible || obj.hidden) continue

			try {
				addObjectToSlide(slide, obj, { doc, imageCache, qrCache })
			} catch (error) {
				console.error(`Failed to export object ${obj.id} (${obj.type}):`, error)
			}
		}

		// Update progress
		onProgress?.(40 + Math.round(((i + 1) / views.length) * 55))
	}

	// Write file (95-100%)
	onProgress?.(95)
	await pptx.writeFile({ fileName: finalFilename })
	onProgress?.(100)
}

/**
 * Download PPTX export (convenience wrapper)
 */
export async function downloadPPTX(
	doc: YPrezilloDocument,
	views: ViewNode[],
	ownerTag?: string,
	token?: string,
	onProgress?: (progress: number) => void
): Promise<void> {
	await exportToPPTX(doc, views, { ownerTag, token, onProgress })
}

// vim: ts=4
