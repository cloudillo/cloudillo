// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Export modules for Prezillo presentations
 *
 * - PDF: svg2pdf.js + jsPDF (vector PDF)
 * - PPTX: PptxGenJS (native PowerPoint shapes)
 */

export { exportToPDF, downloadPDF } from './pdf-export.js'
export { exportToPPTX, downloadPPTX } from './pptx-export.js'
export type { PDFExportOptions, RenderContext, Bounds } from './types.js'
export type { PPTXExportOptions } from './pptx-export.js'

// vim: ts=4
