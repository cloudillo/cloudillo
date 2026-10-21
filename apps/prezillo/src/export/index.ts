// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * Export modules for Prezillo presentations
 *
 * - PDF: svg2pdf.js + jsPDF (vector PDF)
 * - PPTX: PptxGenJS (native PowerPoint shapes)
 */

export { downloadPDF, exportToPDF } from './pdf-export.js'
export type { PPTXExportOptions } from './pptx-export.js'
export { downloadPPTX, exportToPPTX } from './pptx-export.js'
export type { Bounds, PDFExportOptions, RenderContext } from './types.js'

// vim: ts=4
