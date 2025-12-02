/**
 * Constants for the Sheello spreadsheet application.
 * Centralizes magic numbers and configuration values.
 */

// Default sheet dimensions
export const DEFAULT_ROWS = 100
export const DEFAULT_COLS = 26 // Standard spreadsheet columns (A-Z)

// Formula recalculation timing
export const FORMULA_RECALC_DEBOUNCE_MS = 100
export const FORMULA_RECALC_MAX_DELAY_MS = 1000 // Force recalc after this delay

// UI timing
export const FROZEN_PANE_APPLY_DELAY_MS = 100

// Awareness/cursor tracking
export const CURSOR_POLL_INTERVAL_MS = 100
export const CURSOR_DEBOUNCE_DELAY_MS = 300
export const CURSOR_THROTTLE_DELAY_MS = 1000

// vim: ts=4
