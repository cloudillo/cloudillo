// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * PDF Export module for Prezillo presentations
 *
 * Provides browser-based PDF generation using svg2pdf.js + jsPDF.
 * Converts foreignObject elements (text, QR codes) to native SVG
 * for proper PDF conversion.
 */

export { exportToPDF, downloadPDF } from './pdf-export.js'
export type { PDFExportOptions, RenderContext, Bounds } from './types.js'

// vim: ts=4
