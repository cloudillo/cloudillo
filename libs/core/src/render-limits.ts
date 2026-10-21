// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

// Leaf module: the message-bus schema and the host sanitizer both import these

/** Largest SVG page a host accepts */
export const MAX_RENDER_SVG_SIZE = 5 * 1024 * 1024
/** Most pages one render may answer */
export const MAX_RENDER_PAGES = 200
/** Largest summed size of one render's pages */
export const MAX_RENDER_TOTAL_SIZE = 50 * 1024 * 1024
/** Most elements one page may hold, nested SVGs included */
export const MAX_RENDER_SVG_ELEMENTS = 100_000

// vim: ts=4
