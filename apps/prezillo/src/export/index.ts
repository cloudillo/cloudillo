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
 * PDF Export module for Prezillo presentations
 *
 * Provides browser-based PDF generation using svg2pdf.js + jsPDF.
 * Converts foreignObject elements (text, QR codes) to native SVG
 * for proper PDF conversion.
 */

export { exportToPDF, downloadPDF } from './pdf-export.js'
export type { PDFExportOptions, RenderContext, Bounds } from './types.js'

// vim: ts=4
