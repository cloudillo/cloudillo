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
 * Lightweight text diff utility for Y.Text CRDT updates.
 *
 * Uses simple prefix/suffix matching to compute minimal delta operations.
 * This approach is O(n) and works well for single-cursor textarea editing.
 */

import * as Y from 'yjs'

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
