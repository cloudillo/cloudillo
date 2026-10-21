// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * PDF Export: a cell range, paginated by `renderRangeSvg`, drawn as vectors with svg2pdf.js.
 */

import { docBaseName, downloadBlob, parseSvg, sanitizeFilename } from '@cloudillo/core'
import { collectSvgFonts, type FontFaceRef, registerPdfFonts } from '@cloudillo/fonts'
import { jsPDF } from 'jspdf'
import { svg2pdf } from 'svg2pdf.js'
import type * as Y from 'yjs'

import type { ResolvedRange } from './named-ranges'
import { renderRangeSvg } from './render-svg'

export type PdfPaper = 'a4' | 'letter'
export type PdfOrientation = 'portrait' | 'landscape'

export interface PdfExportOptions {
	range: ResolvedRange
	paper: PdfPaper
	orientation: PdfOrientation
	fitWidth: boolean
	repeatHead: boolean
	/** Without extension */
	fileName: string
}

const PAPER_MM: Record<PdfPaper, [number, number]> = {
	a4: [210, 297],
	letter: [215.9, 279.4]
}
const MARGIN_MM = 10
const PX_PER_MM = 96 / 25.4

export async function exportRangePdf(yDoc: Y.Doc, opts: PdfExportOptions): Promise<void> {
	const [pw, ph] = PAPER_MM[opts.paper]
	const [wMm, hMm] = opts.orientation === 'landscape' ? [ph, pw] : [pw, ph]
	const bodyW = wMm - 2 * MARGIN_MM
	const bodyH = hMm - 2 * MARGIN_MM

	const svgs = renderRangeSvg(yDoc, opts.range, {
		w: bodyW * PX_PER_MM,
		h: bodyH * PX_PER_MM,
		fitWidth: opts.fitWidth,
		repeatHead: opts.repeatHead
	})
	// Own output (text escaped, colors allow-listed): no sanitizing needed, only parsing
	// (svg2pdf and the font scan take Elements)
	const pages = svgs.map((s) => {
		const el = parseSvg(s)
		if (!el) throw new Error('Failed to render range')
		return el
	})

	const pdf = new jsPDF({ orientation: opts.orientation, unit: 'mm', format: opts.paper })
	const faces: FontFaceRef[] = pages.flatMap((el) => collectSvgFonts(el))
	await registerPdfFonts(pdf, faces)

	for (let i = 0; i < pages.length; i++) {
		if (i > 0) pdf.addPage(opts.paper, opts.orientation)
		await svg2pdf(pages[i], pdf, { x: MARGIN_MM, y: MARGIN_MM, width: bodyW, height: bodyH })
	}

	// opts.fileName is the sheet or range name
	const base = [docBaseName(), opts.fileName].filter(Boolean).join(' - ')
	downloadBlob(pdf.output('blob'), `${sanitizeFilename(base || 'spreadsheet')}.pdf`)
}

// vim: ts=4
