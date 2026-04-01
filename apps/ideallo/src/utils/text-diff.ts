// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Lightweight text diff utility for Y.Text CRDT updates.
 *
 * Uses simple prefix/suffix matching to compute minimal delta operations.
 * This approach is O(n) and works well for single-cursor textarea editing.
 */

import type * as Y from 'yjs'

/**
 * Apply minimal delta operations to sync Y.Text with new text content.
 *
 * Instead of replacing all content (which breaks collaborative editing),
 * this computes the minimal diff and applies only the changed region.
 *
 * Algorithm:
 * 1. Find common prefix (characters that match from start)
 * 2. Find common suffix (characters that match from end, not overlapping prefix)
 * 3. Delete the old middle portion and insert the new middle portion
 *
 * Example:
 *   Old: "Hello world"
 *   New: "Hello there world"
 *   Prefix: "Hello " (6 chars)
 *   Suffix: " world" (6 chars)
 *   Result: insert "there" at position 6
 *
 * @param yDoc - The Y.Doc to transact on
 * @param yText - The Y.Text to update
 * @param newText - The new text content
 */
export function applyTextDiff(yDoc: Y.Doc, yText: Y.Text, newText: string): void {
	const oldText = yText.toString()

	// Skip if no change
	if (oldText === newText) return

	// Find common prefix length
	let prefixLen = 0
	const minLen = Math.min(oldText.length, newText.length)
	while (prefixLen < minLen && oldText[prefixLen] === newText[prefixLen]) {
		prefixLen++
	}

	// Find common suffix (don't overlap with prefix)
	let oldSuffixStart = oldText.length
	let newSuffixStart = newText.length
	while (
		oldSuffixStart > prefixLen &&
		newSuffixStart > prefixLen &&
		oldText[oldSuffixStart - 1] === newText[newSuffixStart - 1]
	) {
		oldSuffixStart--
		newSuffixStart--
	}

	// Calculate delta operations
	const deleteCount = oldSuffixStart - prefixLen
	const insertText = newText.slice(prefixLen, newSuffixStart)

	// Apply to Y.Text in a transaction
	if (deleteCount > 0 || insertText.length > 0) {
		yDoc.transact(() => {
			if (deleteCount > 0) {
				yText.delete(prefixLen, deleteCount)
			}
			if (insertText.length > 0) {
				yText.insert(prefixLen, insertText)
			}
		}, yDoc.clientID)
	}
}

// vim: ts=4
