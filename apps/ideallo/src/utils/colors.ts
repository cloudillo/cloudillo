// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Color palette and utilities for Ideallo
 */

// Core drawing colors (from design plan)
export const PALETTE = {
	black: '#1e1e1e',
	gray: '#868e96',
	white: '#ffffff',
	red: '#e03131',
	orange: '#f76707',
	yellow: '#fcc419',
	green: '#2f9e44',
	teal: '#1098ad',
	blue: '#1971c2',
	purple: '#7048e8',
	pink: '#c2255c'
} as const

// Palette as array for quick access in UI
export const PALETTE_COLORS = [
	PALETTE.black,
	PALETTE.white,
	PALETTE.red,
	PALETTE.orange,
	PALETTE.yellow,
	PALETTE.green,
	PALETTE.blue,
	PALETTE.purple
] as const

// UI colors
export const UI = {
	canvasBg: '#f8f9fa',
	canvasDot: '#dee2e6',
	uiBg: 'rgba(255, 255, 255, 0.85)',
	uiBorder: 'rgba(0, 0, 0, 0.1)',
	uiShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
	selectionColor: '#339af0',
	selectionHandle: '#228be6',
	snapColor: '#845ef7'
} as const

// Default stroke widths
export const STROKE_WIDTHS = [1, 2, 4, 8] as const

/**
 * Corner-radius presets, as a ladder rather than a number field.
 *
 * 0 = square, 4 = the sticky note's rx, 12 ~ a card, 24 ~ a pill at typical shape sizes. SVG
 * clamps rx to width/2, so 24 stays safe on a small shape.
 */
export const CORNER_RADII = [0, 4, 12, 24] as const

/**
 * The colour to draw a collaborator's cursor, ghost or label in.
 *
 * Derived by the VIEWER from the peer's idTag rather than read off the wire, so
 * a peer cannot assert an arbitrary colour; and the idTag it derives from is
 * stamped by the `/ws/crdt` relay from the sender's own token (see
 * `cloudillo-rs/crates/cloudillo-crdt/src/websocket.rs`), so it cannot be forged
 * either. Anonymous guests fall back to their awareness clientId, which is
 * stable for the length of their session.
 *
 * `idHue` is the platform-wide rule, so the same person is the same colour in
 * every app. SVG attributes cannot use the `.c-id-color` CSS route, so this
 * returns a literal string; the caller passes the theme, because a hidden bus
 * read cannot appear in a memo's prop comparison or a `useEffect` dep array.
 */
// vim: ts=4
