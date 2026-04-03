// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * PPTX Import Module
 *
 * Converts PowerPoint (.pptx) files into Prezillo's CRDT structure.
 * Uses JSZip for extraction and fast-xml-parser for XML parsing,
 * then creates views/objects via existing CRDT operations.
 */

import type * as Y from 'yjs'
import JSZip from 'jszip'
import { XMLParser } from 'fast-xml-parser'

import type { YPrezilloDocument, ShapeStyle, TextStyle, ObjectId } from '../crdt'
import { generateObjectId, generateViewId, toViewId, getOrCreateRichText } from '../crdt'
import type {
	StoredRect,
	StoredEllipse,
	StoredLine,
	StoredText,
	StoredImage
} from '../crdt/stored-types'
import { getInstanceUrl } from '@cloudillo/core'
import { registerPendingImageTempId } from '../hooks/useImageHandler'

import type {
	ParsedTheme,
	ParsedShape,
	ParsedSlide,
	ParsedFill,
	ParsedColor,
	ParsedParagraph,
	ParsedTextRun,
	ParsedTransform,
	ImportResult
} from './types'
import { emuToPx } from './types'

// ============================================================================
// XML Parser setup
// ============================================================================

const xmlParser = new XMLParser({
	ignoreAttributes: false,
	attributeNamePrefix: '@_',
	parseTagValue: false,
	// Preserve arrays for elements that can repeat
	isArray: (name) =>
		[
			'p:sp',
			'p:pic',
			'p:cxnSp',
			'p:grpSp',
			'p:graphicFrame',
			'a:p',
			'a:r',
			'a:br',
			'a:gs',
			'Relationship',
			'p:sldId'
		].includes(name)
})

// ============================================================================
// Main import function
// ============================================================================

/** Upload context needed for image imports */
export interface ImportUploadContext {
	ownerTag: string
	token: string
	documentFileId: string
}

/**
 * Import a PPTX file into an existing Prezillo Y.Doc
 */
export async function importPptx(
	yDoc: Y.Doc,
	doc: YPrezilloDocument,
	data: ArrayBuffer,
	uploadCtx?: ImportUploadContext
): Promise<ImportResult> {
	const zip = await JSZip.loadAsync(data)
	const warnings: string[] = []
	let objectsCreated = 0
	let imagesImported = 0

	// Parse presentation.xml to get slide order, dimensions, and theme path
	const { slideRefs, slideDimensions, themePath } = await parsePresentation(zip)

	// Parse theme colors
	const theme = await parseTheme(zip, themePath)
	const slideW = slideDimensions.width
	const slideH = slideDimensions.height

	// Parse each slide
	const parsedSlides: ParsedSlide[] = []
	for (let i = 0; i < slideRefs.length; i++) {
		try {
			const slide = await parseSlide(zip, slideRefs[i], i)
			parsedSlides.push(slide)

			if (slide.graphicFrameCount > 0)
				warnings.push(
					`Slide ${i + 1}: ${slide.graphicFrameCount} table/chart(s) not imported`
				)
		} catch (err) {
			warnings.push(`Failed to parse slide ${i + 1}: ${err}`)
		}
	}

	// Clear existing views and objects (fresh import into empty doc)
	yDoc.transact(() => {
		// Clear view order
		while (doc.vo.length > 0) doc.vo.delete(0, 1)
		// Clear root children
		while (doc.r.length > 0) doc.r.delete(0, 1)
		// Clear views
		doc.v.forEach((_v, key) => {
			doc.v.delete(key)
		})
		// Clear objects
		doc.o.forEach((_o, key) => {
			doc.o.delete(key)
		})
		// Clear rich texts
		doc.rt.forEach((_t, key) => {
			doc.rt.delete(key)
		})
	}, yDoc.clientID)

	// Update document dimensions to match PPTX slide size
	yDoc.transact(() => {
		doc.m.set('defaultViewWidth', slideW)
		doc.m.set('defaultViewHeight', slideH)
	}, yDoc.clientID)

	// Create views and objects
	for (let i = 0; i < parsedSlides.length; i++) {
		const slide = parsedSlides[i]

		// Create view
		const viewId = generateViewId()
		const viewX = i * (slideW + 100)

		yDoc.transact(() => {
			doc.v.set(viewId, {
				name: `Slide ${i + 1}`,
				x: viewX,
				y: 0,
				width: slideW,
				height: slideH,
				backgroundColor: resolveBackground(slide.background, theme),
				showBorder: true
			})
			doc.vo.push([viewId])
		}, yDoc.clientID)

		// Create objects for each shape on the slide
		for (const shape of slide.shapes) {
			try {
				const count = await createObjectFromShape(
					yDoc,
					doc,
					shape,
					toViewId(viewId),
					slide,
					zip,
					theme,
					warnings,
					uploadCtx
				)
				objectsCreated += count
				if (shape.type === 'picture' && count > 0) imagesImported++
			} catch (err) {
				warnings.push(`Failed to import shape "${shape.name}": ${err}`)
			}
		}
	}

	return {
		slidesImported: parsedSlides.length,
		objectsCreated,
		imagesImported,
		warnings
	}
}

// ============================================================================
// Utility
// ============================================================================

/** Resolve a relative path against a base directory (handles ../ segments) */
function resolvePath(base: string, relative: string): string {
	const parts = base.split('/').concat(relative.split('/'))
	const resolved: string[] = []
	for (const part of parts) {
		if (part === '..') resolved.pop()
		else if (part !== '.' && part !== '') resolved.push(part)
	}
	return resolved.join('/')
}

// ============================================================================
// PPTX XML Parsing
// ============================================================================

/** Get slide file references and dimensions from presentation.xml */
async function parsePresentation(zip: JSZip): Promise<{
	slideRefs: string[]
	slideDimensions: { width: number; height: number }
	themePath: string
}> {
	const presXml = await zip.file('ppt/presentation.xml')?.async('text')
	if (!presXml) throw new Error('Missing ppt/presentation.xml')

	const presRels = await zip.file('ppt/_rels/presentation.xml.rels')?.async('text')
	if (!presRels) throw new Error('Missing presentation.xml.rels')

	const pres = xmlParser.parse(presXml)
	const rels = xmlParser.parse(presRels)

	// Build rId → target map and find theme path by relationship type
	const relMap = new Map<string, string>()
	let themePath = 'ppt/theme/theme1.xml'
	const relationships = ensureArray(rels?.Relationships?.Relationship)
	for (const rel of relationships) {
		if (rel['@_Id'] && rel['@_Target']) {
			relMap.set(rel['@_Id'], rel['@_Target'])
		}
		if (rel['@_Type']?.endsWith('/theme') && rel['@_Target']) {
			const target = rel['@_Target'] as string
			themePath = target.startsWith('/') ? target.slice(1) : `ppt/${target}`
		}
	}

	// Get slide references in order
	const slideIds = ensureArray(pres?.['p:presentation']?.['p:sldIdLst']?.['p:sldId'])
	const slideRefs: string[] = []
	for (const sldId of slideIds) {
		const rId = sldId['@_r:id']
		const target = relMap.get(rId)
		if (target) {
			// Target is relative to ppt/
			slideRefs.push(target.startsWith('/') ? target.slice(1) : `ppt/${target}`)
		}
	}

	// Parse slide dimensions
	const sldSz = pres?.['p:presentation']?.['p:sldSz']
	const slideDimensions = sldSz
		? {
				width: Math.round(emuToPx(Number(sldSz['@_cx']) || 0)) || 1920,
				height: Math.round(emuToPx(Number(sldSz['@_cy']) || 0)) || 1080
			}
		: { width: 1920, height: 1080 }

	return { slideRefs, slideDimensions, themePath }
}

/** Parse theme colors */
async function parseTheme(zip: JSZip, themePath: string): Promise<ParsedTheme> {
	const themeXml = await zip.file(themePath)?.async('text')
	if (!themeXml) return {}

	const theme = xmlParser.parse(themeXml)
	const clrScheme = theme?.['a:theme']?.['a:themeElements']?.['a:clrScheme']
	if (!clrScheme) return {}

	const getColor = (node: unknown): string | undefined => {
		if (!node || typeof node !== 'object') return undefined
		const obj = node as Record<string, unknown>
		const srgb = obj['a:srgbClr'] as Record<string, string> | undefined
		if (srgb?.['@_val']) return srgb['@_val']
		const sys = obj['a:sysClr'] as Record<string, string> | undefined
		if (sys?.['@_lastClr']) return sys['@_lastClr']
		return undefined
	}

	return {
		dk1: getColor(clrScheme['a:dk1']),
		lt1: getColor(clrScheme['a:lt1']),
		dk2: getColor(clrScheme['a:dk2']),
		lt2: getColor(clrScheme['a:lt2']),
		accent1: getColor(clrScheme['a:accent1']),
		accent2: getColor(clrScheme['a:accent2']),
		accent3: getColor(clrScheme['a:accent3']),
		accent4: getColor(clrScheme['a:accent4']),
		accent5: getColor(clrScheme['a:accent5']),
		accent6: getColor(clrScheme['a:accent6']),
		hlink: getColor(clrScheme['a:hlink']),
		folHlink: getColor(clrScheme['a:folHlink'])
	}
}

/** Parse a single slide */
async function parseSlide(zip: JSZip, slidePath: string, index: number): Promise<ParsedSlide> {
	const slideXml = await zip.file(slidePath)?.async('text')
	if (!slideXml) throw new Error(`Missing ${slidePath}`)

	// Parse relationships for this slide
	const slideDir = slidePath.substring(0, slidePath.lastIndexOf('/'))
	const slideName = slidePath.substring(slidePath.lastIndexOf('/') + 1)
	const relsPath = `${slideDir}/_rels/${slideName}.rels`
	const relsXml = await zip.file(relsPath)?.async('text')

	const relationships = new Map<string, string>()
	if (relsXml) {
		const rels = xmlParser.parse(relsXml)
		for (const rel of ensureArray(rels?.Relationships?.Relationship)) {
			if (rel['@_Id'] && rel['@_Target']) {
				relationships.set(rel['@_Id'], rel['@_Target'])
			}
		}
	}

	const slide = xmlParser.parse(slideXml)
	const cSld = slide?.['p:sld']?.['p:cSld']
	const spTree = cSld?.['p:spTree']

	// Parse background
	const bgNode = cSld?.['p:bg']
	let background: ParsedFill | undefined
	if (bgNode?.['p:bgPr']) {
		background = parseFill(bgNode['p:bgPr'])
	}

	// Parse shapes (including flattened group contents)
	const shapes: ParsedShape[] = []
	if (spTree) {
		shapes.push(...parseShapes(spTree, 'p:sp', 'shape'))
		shapes.push(...parseShapes(spTree, 'p:pic', 'picture'))
		shapes.push(...parseShapes(spTree, 'p:cxnSp', 'connector'))
		shapes.push(...flattenGroups(spTree))
	}

	// Count unsupported graphic frames (tables, charts, SmartArt)
	const graphicFrameCount = spTree ? ensureArray(spTree['p:graphicFrame']).length : 0

	return { index, shapes, background, relationships, graphicFrameCount }
}

// ============================================================================
// Shape Parsing
// ============================================================================

function parseShapes(
	spTree: Record<string, unknown>,
	elementName: string,
	type: ParsedShape['type']
): ParsedShape[] {
	const shapes: ParsedShape[] = []
	for (const sp of ensureArray(spTree[elementName]) as Record<string, unknown>[]) {
		const shape = parseShape(sp, type)
		if (shape) shapes.push(shape)
	}
	return shapes
}

/** Group transform: maps child coordinate space to parent coordinate space */
interface GroupTransform {
	// Parent position (where the group is placed)
	x: number
	y: number
	cx: number
	cy: number
	// Child coordinate space (the internal coordinate system of the group)
	chOffX: number
	chOffY: number
	chExtCx: number
	chExtCy: number
	rotation?: number
}

function parseGroupTransform(grpSpPr: Record<string, unknown>): GroupTransform | null {
	const xfrm = grpSpPr['a:xfrm'] as Record<string, unknown> | undefined
	if (!xfrm) return null

	const off = xfrm['a:off'] as Record<string, string> | undefined
	const ext = xfrm['a:ext'] as Record<string, string> | undefined
	const chOff = xfrm['a:chOff'] as Record<string, string> | undefined
	const chExt = xfrm['a:chExt'] as Record<string, string> | undefined

	return {
		x: Number(off?.['@_x']) || 0,
		y: Number(off?.['@_y']) || 0,
		cx: Number(ext?.['@_cx']) || 0,
		cy: Number(ext?.['@_cy']) || 0,
		chOffX: Number(chOff?.['@_x']) || 0,
		chOffY: Number(chOff?.['@_y']) || 0,
		chExtCx: Number(chExt?.['@_cx']) || 1,
		chExtCy: Number(chExt?.['@_cy']) || 1,
		// Convert OOXML 1/60000th-degree units to degrees at parse time
		// so that rotation accumulation in applyGroupTransform works for nested groups
		rotation: Number(xfrm['@_rot']) ? Number(xfrm['@_rot']) / 60000 : undefined
	}
}

/** Transform a child shape's position from group-local coordinates to parent coordinates */
function applyGroupTransform(shape: ParsedShape, gt: GroupTransform): ParsedShape {
	const t = shape.transform
	// Map child coordinates to parent space:
	// parentX = group.x + (child.x - childOffset.x) * (group.cx / childExtent.cx)
	const scaleX = gt.cx / gt.chExtCx
	const scaleY = gt.cy / gt.chExtCy

	return {
		...shape,
		transform: {
			...t,
			x: gt.x + (t.x - gt.chOffX) * scaleX,
			y: gt.y + (t.y - gt.chOffY) * scaleY,
			cx: t.cx * scaleX,
			cy: t.cy * scaleY,
			// Combine rotations (group rotation + child rotation)
			rotation: gt.rotation || t.rotation ? (gt.rotation || 0) + (t.rotation || 0) : undefined
		}
	}
}

/**
 * Flatten group shapes (p:grpSp) into individual shapes with transformed coordinates.
 * Recursively handles nested groups.
 */
function flattenGroups(container: Record<string, unknown>): ParsedShape[] {
	const shapes: ParsedShape[] = []

	for (const grp of ensureArray(container['p:grpSp']) as Record<string, unknown>[]) {
		const grpSpPr = grp['p:grpSpPr'] as Record<string, unknown> | undefined
		const gt = grpSpPr ? parseGroupTransform(grpSpPr) : null
		if (!gt) continue

		// Parse child shapes of each type
		const children: ParsedShape[] = [
			...parseShapes(grp, 'p:sp', 'shape'),
			...parseShapes(grp, 'p:pic', 'picture'),
			...parseShapes(grp, 'p:cxnSp', 'connector'),
			// Recurse into nested groups
			...flattenGroups(grp)
		]

		// Transform each child from group-local to parent coordinates
		for (const child of children) {
			shapes.push(applyGroupTransform(child, gt))
		}
	}

	return shapes
}

function parseShape(sp: Record<string, unknown>, type: ParsedShape['type']): ParsedShape | null {
	// Get non-visual properties
	const nvPr =
		(sp['p:nvSpPr'] as Record<string, unknown>) ??
		(sp['p:nvPicPr'] as Record<string, unknown>) ??
		(sp['p:nvCxnSpPr'] as Record<string, unknown>)
	const cNvPr = nvPr?.['p:cNvPr'] as Record<string, string> | undefined
	const id = cNvPr?.['@_id'] || '0'
	const name = cNvPr?.['@_name'] || ''

	// Get shape properties
	const spPr = sp['p:spPr'] as Record<string, unknown> | undefined

	// Parse transform
	const xfrm = spPr?.['a:xfrm'] as Record<string, unknown> | undefined
	if (!xfrm) return null // Skip shapes without position

	const transform = parseTransform(xfrm)

	// Parse preset geometry
	const prstGeom = spPr?.['a:prstGeom'] as Record<string, string> | undefined
	const presetGeometry = prstGeom?.['@_prst']

	// Parse fill
	const fill = parseFill(spPr)

	// Parse line
	const lineNode = spPr?.['a:ln'] as Record<string, unknown> | undefined
	const line = lineNode
		? {
				fill: parseFill(lineNode),
				width: Number(lineNode['@_w']) || undefined,
				headEnd: (lineNode['a:headEnd'] as Record<string, string>)?.['@_type'],
				tailEnd: (lineNode['a:tailEnd'] as Record<string, string>)?.['@_type']
			}
		: undefined

	// Parse text body
	const txBody = sp['p:txBody'] as Record<string, unknown> | undefined
	const text = txBody ? parseParagraphs(txBody) : undefined
	const bodyPr = txBody?.['a:bodyPr'] as Record<string, string> | undefined
	const verticalAnchor = bodyPr?.['@_anchor']

	// For pictures: get image reference
	let imageRId: string | undefined
	if (type === 'picture') {
		const blipFill = sp['p:blipFill'] as Record<string, unknown> | undefined
		const blip = blipFill?.['a:blip'] as Record<string, string> | undefined
		imageRId = blip?.['@_r:embed']
	}

	return {
		type,
		id,
		name,
		presetGeometry,
		transform,
		fill,
		line,
		text,
		imageRId,
		verticalAnchor
	}
}

function parseTransform(xfrm: Record<string, unknown>): ParsedTransform {
	const off = xfrm['a:off'] as Record<string, string> | undefined
	const ext = xfrm['a:ext'] as Record<string, string> | undefined

	return {
		x: Number(off?.['@_x']) || 0,
		y: Number(off?.['@_y']) || 0,
		cx: Number(ext?.['@_cx']) || 0,
		cy: Number(ext?.['@_cy']) || 0,
		rotation: Number(xfrm['@_rot']) ? Number(xfrm['@_rot']) / 60000 : undefined,
		flipH: xfrm['@_flipH'] === '1',
		flipV: xfrm['@_flipV'] === '1'
	}
}

function parseFill(node: Record<string, unknown> | undefined): ParsedFill | undefined {
	if (!node) return undefined

	if (node['a:noFill'] !== undefined) {
		return { type: 'none' }
	}

	if (node['a:solidFill']) {
		const fill = node['a:solidFill'] as Record<string, unknown>
		return { type: 'solid', color: parseColor(fill) }
	}

	if (node['a:gradFill']) {
		const gradFill = node['a:gradFill'] as Record<string, unknown>
		const gsLst = gradFill['a:gsLst'] as Record<string, unknown> | undefined
		const stops: Array<{ position: number; color: ParsedColor }> = []

		for (const gs of ensureArray(gsLst?.['a:gs']) as Record<string, unknown>[]) {
			stops.push({
				position: Number(gs['@_pos']) / 1000, // OOXML uses 0-100000 → 0-100 (percent, not 0-1 fraction)
				color: parseColor(gs)
			})
		}

		// Check for linear gradient angle
		const lin = gradFill['a:lin'] as Record<string, string> | undefined
		const angle = lin ? Number(lin['@_ang']) / 60000 : undefined

		return {
			type: 'gradient',
			stops,
			gradientAngle: angle,
			gradientType: lin ? 'linear' : 'radial'
		}
	}

	return undefined
}

function parseColor(node: Record<string, unknown>): ParsedColor {
	const srgb = node['a:srgbClr'] as Record<string, string | unknown> | undefined
	if (srgb) {
		return {
			type: 'rgb',
			value: String(srgb['@_val'] || '000000'),
			alpha: Number((srgb['a:alpha'] as Record<string, string>)?.['@_val']) || undefined
		}
	}

	const scheme = node['a:schemeClr'] as Record<string, string> | undefined
	if (scheme) {
		return { type: 'scheme', value: scheme['@_val'] || '' }
	}

	return { type: 'none', value: '' }
}

function parseParagraphs(txBody: Record<string, unknown>): ParsedParagraph[] {
	const paragraphs: ParsedParagraph[] = []

	for (const p of ensureArray(txBody['a:p']) as Record<string, unknown>[]) {
		const pPr = p['a:pPr'] as Record<string, unknown> | undefined
		const runs: ParsedTextRun[] = []

		// TODO: fast-xml-parser doesn't preserve interleaving order between different
		// element types (a:r and a:br), so we process a:r first and append a:br as
		// newline runs at the end. This means mid-paragraph line breaks with mixed
		// formatting (e.g. "bold\nitalic") will have incorrect text order.
		// Consider using preserveOrder: true for text body parsing to fix this.
		for (const r of ensureArray(p['a:r']) as Record<string, unknown>[]) {
			const rPr = r['a:rPr'] as Record<string, unknown> | undefined
			const text = r['a:t']

			if (text === undefined || text === null) continue

			const fontNode = rPr?.['a:latin'] as Record<string, string> | undefined

			runs.push({
				text: String(text),
				bold: rPr?.['@_b'] === '1' || rPr?.['@_b'] === 'true',
				italic: rPr?.['@_i'] === '1' || rPr?.['@_i'] === 'true',
				underline: rPr?.['@_u'] as string | undefined,
				strikethrough: rPr?.['@_strike'] as string | undefined,
				fontSize: Number(rPr?.['@_sz']) || undefined,
				fontFamily: fontNode?.['@_typeface'],
				color: rPr ? parseColor(rPr) : undefined
			})
		}

		// Handle in-paragraph line breaks (a:br = Shift+Enter)
		const brCount = ensureArray(p['a:br']).length
		for (let bi = 0; bi < brCount; bi++) {
			runs.push({ text: '\n' })
		}

		paragraphs.push({
			runs,
			align: (pPr?.['@_algn'] as string) || undefined,
			bullet: pPr?.['a:buChar'] !== undefined || pPr?.['a:buFont'] !== undefined,
			numbered: pPr?.['a:buAutoNum'] !== undefined,
			level: Number(pPr?.['@_lvl']) || undefined
		})
	}

	return paragraphs
}

// ============================================================================
// Shape → Prezillo Object Conversion
// ============================================================================

/** Resolve a ParsedColor to a hex string (with #) */
function resolveColor(color: ParsedColor | undefined, theme: ParsedTheme): string {
	if (!color) return '#000000'
	if (color.type === 'rgb') return `#${color.value}`
	if (color.type === 'scheme') {
		const schemeMap: Record<string, string | undefined> = {
			dk1: theme.dk1,
			lt1: theme.lt1,
			dk2: theme.dk2,
			lt2: theme.lt2,
			accent1: theme.accent1,
			accent2: theme.accent2,
			accent3: theme.accent3,
			accent4: theme.accent4,
			accent5: theme.accent5,
			accent6: theme.accent6,
			hlink: theme.hlink,
			folHlink: theme.folHlink,
			// Common aliases
			tx1: theme.dk1,
			tx2: theme.dk2,
			bg1: theme.lt1,
			bg2: theme.lt2
		}
		const resolved = schemeMap[color.value]
		if (resolved) return `#${resolved}`
	}
	return '#000000'
}

/** Resolve background fill to a color string */
function resolveBackground(fill: ParsedFill | undefined, theme: ParsedTheme): string {
	if (!fill) return '#ffffff'
	if (fill.type === 'solid' && fill.color) {
		return resolveColor(fill.color, theme)
	}
	if (fill.type === 'gradient' && fill.stops && fill.stops.length > 0) {
		// Use first stop color as fallback
		return resolveColor(fill.stops[0].color, theme)
	}
	return '#ffffff'
}

/** Map PPTX alignment to Prezillo text align code */
function mapTextAlign(align?: string): 'l' | 'c' | 'r' | 'j' | undefined {
	switch (align) {
		case 'l':
			return 'l'
		case 'ctr':
			return 'c'
		case 'r':
			return 'r'
		case 'just':
			return 'j'
		default:
			return undefined
	}
}

/** Map vertical anchor to Prezillo vertical align code */
function mapVerticalAlign(anchor?: string): 't' | 'm' | 'b' | undefined {
	switch (anchor) {
		case 't':
			return 't'
		case 'ctr':
			return 'm'
		case 'b':
			return 'b'
		default:
			return undefined
	}
}

/** Convert parsed fill to Prezillo ShapeStyle fill fields */
function fillToShapeStyle(fill: ParsedFill | undefined, theme: ParsedTheme): Partial<ShapeStyle> {
	if (!fill || fill.type === 'none') return {}
	if (fill.type === 'solid' && fill.color) {
		return { f: resolveColor(fill.color, theme) }
	}
	if (fill.type === 'gradient' && fill.stops && fill.stops.length > 0) {
		return { f: resolveColor(fill.stops[0].color, theme) }
	}
	return {}
}

/** Convert parsed line to ShapeStyle stroke fields */
function lineToShapeStyle(line: ParsedShape['line'], theme: ParsedTheme): Partial<ShapeStyle> {
	if (!line) return {}
	const result: Partial<ShapeStyle> = {}
	if (line.fill?.type === 'solid' && line.fill.color) {
		result.s = resolveColor(line.fill.color, theme)
	}
	if (line.width) {
		result.sw = Math.round(emuToPx(line.width) * 10) / 10
	}
	return result
}

/** Map PPTX preset geometry to prezillo object type */
function mapPresetGeometry(preset?: string): 'R' | 'E' | 'L' | undefined {
	switch (preset) {
		case 'rect':
		case 'roundRect':
		case 'snip1Rect':
		case 'snip2DiagRect':
		case 'snip2SameRect':
		case 'snipRoundRect':
		case 'round1Rect':
		case 'round2DiagRect':
		case 'round2SameRect':
			return 'R'
		case 'ellipse':
			return 'E'
		case 'line':
		case 'straightConnector1':
		case 'bentConnector3':
		case 'curvedConnector3':
			return 'L'
		default:
			return undefined
	}
}

/** Create Prezillo objects from a parsed shape */
async function createObjectFromShape(
	yDoc: Y.Doc,
	doc: YPrezilloDocument,
	shape: ParsedShape,
	viewId: ReturnType<typeof toViewId>,
	slide: ParsedSlide,
	zip: JSZip,
	theme: ParsedTheme,
	warnings: string[],
	uploadCtx?: ImportUploadContext
): Promise<number> {
	const t = shape.transform
	const x = Math.round(emuToPx(t.x))
	const y = Math.round(emuToPx(t.y))
	const w = Math.round(emuToPx(t.cx)) || 100
	const h = Math.round(emuToPx(t.cy)) || 100
	const rotation = t.rotation || 0

	// Build shape style
	const fillStyle = fillToShapeStyle(shape.fill, theme)
	const strokeStyle = lineToShapeStyle(shape.line, theme)
	const shapeStyle: ShapeStyle | undefined =
		Object.keys(fillStyle).length > 0 || Object.keys(strokeStyle).length > 0
			? { ...fillStyle, ...strokeStyle }
			: undefined

	// Build text style
	const textStyle = buildTextStyle(shape, theme)

	const objectId = generateObjectId()

	if (shape.type === 'picture') {
		// Handle image import
		return createImageObject(
			yDoc,
			doc,
			objectId,
			shape,
			slide,
			zip,
			viewId,
			x,
			y,
			w,
			h,
			rotation,
			warnings,
			uploadCtx
		)
	}

	if (shape.type === 'connector') {
		// Create as a line
		const stored: StoredLine = {
			t: 'L',
			vi: viewId,
			xy: [x, y],
			wh: [w, h],
			r: rotation || undefined,
			pts: [
				[0, h / 2],
				[w, h / 2]
			],
			s: shapeStyle
		}
		yDoc.transact(() => {
			doc.o.set(objectId, stored)
			doc.r.push([[0, objectId]])
		}, yDoc.clientID)
		return 1
	}

	// Check if shape has substantial text content
	const hasText = shape.text?.some((p) => p.runs.some((r) => r.text.trim().length > 0))
	const isTextBox =
		hasText &&
		(!shape.presetGeometry || shape.presetGeometry === 'rect') &&
		(!shape.fill || shape.fill.type === 'none')

	if (isTextBox || (hasText && !shape.presetGeometry)) {
		// Create as text object
		return createTextObject(
			yDoc,
			doc,
			objectId,
			shape,
			theme,
			viewId,
			x,
			y,
			w,
			h,
			rotation,
			shapeStyle,
			textStyle
		)
	}

	// Map to geometric shape
	const typeCode = mapPresetGeometry(shape.presetGeometry)

	if (typeCode === 'E') {
		const stored: StoredEllipse = {
			t: 'E',
			vi: viewId,
			xy: [x, y],
			wh: [w, h],
			r: rotation || undefined,
			s: shapeStyle
		}
		yDoc.transact(() => {
			doc.o.set(objectId, stored)
			doc.r.push([[0, objectId]])
		}, yDoc.clientID)

		// If shape also has text, create a text object on top
		if (hasText) {
			createTextObject(
				yDoc,
				doc,
				generateObjectId(),
				shape,
				theme,
				viewId,
				x,
				y,
				w,
				h,
				rotation,
				undefined,
				textStyle
			)
			return 2
		}
		return 1
	}

	if (typeCode === 'L') {
		const stored: StoredLine = {
			t: 'L',
			vi: viewId,
			xy: [x, y],
			wh: [w, h],
			r: rotation || undefined,
			pts: [
				[0, h / 2],
				[w, h / 2]
			],
			s: shapeStyle
		}
		yDoc.transact(() => {
			doc.o.set(objectId, stored)
			doc.r.push([[0, objectId]])
		}, yDoc.clientID)
		return 1
	}

	// Default: rectangle (with optional text overlay)
	const isRounded =
		shape.presetGeometry === 'roundRect' ||
		shape.presetGeometry === 'round1Rect' ||
		shape.presetGeometry === 'round2DiagRect' ||
		shape.presetGeometry === 'round2SameRect'

	const stored: StoredRect = {
		t: 'R',
		vi: viewId,
		xy: [x, y],
		wh: [w, h],
		r: rotation || undefined,
		s: shapeStyle,
		cr: isRounded ? Math.round(Math.min(w, h) * 0.1) : undefined
	}

	yDoc.transact(() => {
		doc.o.set(objectId, stored)
		doc.r.push([[0, objectId]])
	}, yDoc.clientID)

	// If rect also has text, add a text object on top
	if (hasText) {
		createTextObject(
			yDoc,
			doc,
			generateObjectId(),
			shape,
			theme,
			viewId,
			x,
			y,
			w,
			h,
			rotation,
			undefined,
			textStyle
		)
		return 2
	}
	return 1
}

/** Create a text object from parsed paragraphs */
function createTextObject(
	yDoc: Y.Doc,
	doc: YPrezilloDocument,
	objectId: string,
	shape: ParsedShape,
	theme: ParsedTheme,
	viewId: string,
	x: number,
	y: number,
	w: number,
	h: number,
	rotation: number,
	shapeStyle: ShapeStyle | undefined,
	textStyle: TextStyle | undefined
): number {
	const stored: StoredText = {
		t: 'T',
		vi: viewId,
		xy: [x, y],
		wh: [w, h],
		r: rotation || undefined,
		s: shapeStyle,
		ts: textStyle
	}

	yDoc.transact(() => {
		doc.o.set(objectId, stored)

		// Create Y.Text and populate with rich content
		const richText = getOrCreateRichText(yDoc, doc, objectId)
		populateRichText(richText, shape.text || [], theme)

		doc.r.push([[0, objectId]])
	}, yDoc.clientID)

	return 1
}

/** Populate a Y.Text with content from parsed paragraphs */
function populateRichText(yText: Y.Text, paragraphs: ParsedParagraph[], theme: ParsedTheme): void {
	let offset = 0

	for (let pi = 0; pi < paragraphs.length; pi++) {
		const para = paragraphs[pi]

		for (const run of para.runs) {
			if (!run.text) continue

			const attrs: Record<string, unknown> = {}
			if (run.bold) attrs.bold = true
			if (run.italic) attrs.italic = true
			if (run.underline && run.underline !== 'none') attrs.underline = true
			if (run.strikethrough && run.strikethrough !== 'noStrike') attrs.strike = true
			if (run.fontFamily) attrs.font = run.fontFamily
			if (run.fontSize) {
				// OOXML fontSize is in hundredths of a point, convert to px-like size string
				attrs.size = `${Math.round((run.fontSize / 100) * 1.333)}px`
			}
			if (run.color && run.color.type !== 'none') {
				attrs.color = resolveColor(run.color, theme)
			}

			if (Object.keys(attrs).length > 0) {
				yText.insert(offset, run.text, attrs)
			} else {
				yText.insert(offset, run.text)
			}
			offset += run.text.length
		}

		// Add newline between paragraphs (but not after the last one)
		if (pi < paragraphs.length - 1) {
			yText.insert(offset, '\n')
			offset++
		}
	}
}

/** Build text style from first paragraph/run */
function buildTextStyle(shape: ParsedShape, theme: ParsedTheme): TextStyle | undefined {
	if (!shape.text || shape.text.length === 0) return undefined

	const firstPara = shape.text[0]
	const firstRun = firstPara?.runs[0]
	if (!firstRun) return undefined

	const ts: TextStyle = {}

	if (firstRun.fontFamily) ts.ff = firstRun.fontFamily
	if (firstRun.fontSize) {
		// hundredths of a point → px
		ts.fs = Math.round((firstRun.fontSize / 100) * 1.333)
	}
	if (firstRun.bold) ts.fw = 'bold'
	if (firstRun.italic) ts.fi = true
	if (firstRun.color && firstRun.color.type !== 'none') {
		ts.fc = resolveColor(firstRun.color, theme)
	}

	const align = mapTextAlign(firstPara.align)
	if (align) ts.ta = align

	const vAlign = mapVerticalAlign(shape.verticalAnchor)
	if (vAlign) ts.va = vAlign

	return Object.keys(ts).length > 0 ? ts : undefined
}

/** Detect MIME type from file extension */
function getMimeType(fileName: string): string {
	const ext = fileName.split('.').pop()?.toLowerCase()
	const mimeMap: Record<string, string> = {
		png: 'image/png',
		jpg: 'image/jpeg',
		jpeg: 'image/jpeg',
		gif: 'image/gif',
		svg: 'image/svg+xml',
		webp: 'image/webp',
		bmp: 'image/bmp',
		tiff: 'image/tiff',
		tif: 'image/tiff',
		emf: 'image/x-emf',
		wmf: 'image/x-wmf'
	}
	return mimeMap[ext || ''] || 'application/octet-stream'
}

/** Upload an image to the Cloudillo API and return the fileId */
async function uploadImage(
	imageData: ArrayBuffer,
	fileName: string,
	contentType: string,
	ctx: ImportUploadContext
): Promise<{ fileId: string; dim?: [number, number] }> {
	const url = `${getInstanceUrl(ctx.ownerTag)}/api/files/media/${encodeURIComponent(fileName)}?rootId=${encodeURIComponent(ctx.documentFileId)}`

	const res = await fetch(url, {
		method: 'POST',
		headers: {
			'Content-Type': contentType,
			Authorization: `Bearer ${ctx.token}`
		},
		body: imageData
	})

	if (!res.ok) {
		throw new Error(`Upload failed: ${res.status} ${res.statusText}`)
	}

	const result = await res.json()
	const data = result.data
	if (!data?.fileId) {
		throw new Error('Upload response missing fileId')
	}

	return { fileId: data.fileId, dim: data.dim }
}

/** Create an image object by uploading the image to Cloudillo storage */
async function createImageObject(
	yDoc: Y.Doc,
	doc: YPrezilloDocument,
	objectId: string,
	shape: ParsedShape,
	slide: ParsedSlide,
	zip: JSZip,
	viewId: string,
	x: number,
	y: number,
	w: number,
	h: number,
	rotation: number,
	warnings: string[],
	uploadCtx?: ImportUploadContext
): Promise<number> {
	if (!shape.imageRId) {
		warnings.push(`Image "${shape.name}" has no image reference`)
		return 0
	}

	// Resolve rId to file path
	const relTarget = slide.relationships.get(shape.imageRId)
	if (!relTarget) {
		warnings.push(`Image "${shape.name}": unresolved reference ${shape.imageRId}`)
		return 0
	}

	// Resolve relative path (relative to ppt/slides/)
	const imagePath = relTarget.startsWith('/')
		? relTarget.slice(1)
		: resolvePath('ppt/slides', relTarget)

	const imageFile = zip.file(imagePath)
	if (!imageFile) {
		warnings.push(`Image "${shape.name}": file not found at ${imagePath}`)
		return 0
	}

	// If no upload context, create placeholder
	if (!uploadCtx) {
		return createImagePlaceholder(
			yDoc,
			doc,
			objectId,
			viewId,
			x,
			y,
			w,
			h,
			rotation,
			warnings,
			shape.name
		)
	}

	// Extract image binary and upload
	try {
		const imageData = await imageFile.async('arraybuffer')
		const fileName = imagePath.split('/').pop() || 'image.png'
		const contentType = getMimeType(fileName)

		const result = await uploadImage(imageData, fileName, contentType, uploadCtx)

		const stored: StoredImage = {
			t: 'I',
			vi: viewId,
			xy: [x, y],
			wh: [w, h],
			r: rotation || undefined,
			fid: result.fileId
		}

		yDoc.transact(() => {
			doc.o.set(objectId, stored)
			doc.r.push([[0, objectId]])
		}, yDoc.clientID)

		// Register for temp ID resolution if needed
		if (result.fileId.startsWith('@')) {
			registerPendingImageTempId(result.fileId, yDoc, doc, objectId as ObjectId)
		}

		return 1
	} catch (err) {
		warnings.push(`Image "${shape.name}": upload failed (${err}), using placeholder`)
		return createImagePlaceholder(
			yDoc,
			doc,
			objectId,
			viewId,
			x,
			y,
			w,
			h,
			rotation,
			warnings,
			shape.name
		)
	}
}

/** Create a placeholder rectangle for images that couldn't be uploaded */
function createImagePlaceholder(
	yDoc: Y.Doc,
	doc: YPrezilloDocument,
	objectId: string,
	viewId: string,
	x: number,
	y: number,
	w: number,
	h: number,
	rotation: number,
	warnings: string[],
	name?: string
): number {
	const stored: StoredRect = {
		t: 'R',
		vi: viewId,
		xy: [x, y],
		wh: [w, h],
		r: rotation || undefined,
		s: { f: '#f0f0f0', s: '#cccccc', sw: 1 }
	}

	yDoc.transact(() => {
		doc.o.set(objectId, stored)
		doc.r.push([[0, objectId]])
	}, yDoc.clientID)

	if (name) {
		warnings.push(`Image "${name}": imported as placeholder`)
	}
	return 1
}

// ============================================================================
// Utilities
// ============================================================================

/** Ensure a value is always an array */
function ensureArray<T>(value: T | T[] | undefined | null): T[] {
	if (value === undefined || value === null) return []
	return Array.isArray(value) ? value : [value]
}

// vim: ts=4
