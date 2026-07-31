// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Tool lifecycle: what happens to a tool once it has placed something.
 *
 * Placement tools are one-shot - they hand the pointer back to Select with the new object
 * selected, so the property bar and the transform handles are immediately about it. The tool
 * lock opts out of that for repeat placement.
 */

import type { IdealloObject } from '../crdt/index.js'
import { isDragShapeTool } from './catalog.js'
import type { ShapePreview, ToolType } from './types.js'

/** Tools that stay armed after every use - they have no natural "one use". */
export const CONTINUOUS_TOOLS: ReadonlySet<ToolType> = new Set<ToolType>([
	'select',
	'pen',
	'eraser'
])

/**
 * Tools that ignore the lock and always revert.
 *
 * Their picker is opened from an effect keyed on the active tool, so a locked image tool could
 * never be re-triggered: re-selecting the tool it is already on is not a state change.
 */
export const ALWAYS_REVERT_TOOLS: ReadonlySet<ToolType> = new Set<ToolType>(['image', 'document'])

/**
 * Tools that commit only on a drag: a bare tap makes nothing, because `isCommittableShapePreview`
 * discards sub-5px shapes and `useDrawingHandler` discards sub-2-point strokes. That is what lets a
 * flyout-dismissing pointerdown reach the canvas without creating anything by accident. Sticky,
 * text and eraser act AT pointerdown, so they are deliberately absent.
 */
export function isDragCommittedTool(tool: ToolType): boolean {
	return isDragShapeTool(tool) || tool === 'pen'
}

export function isOneShotTool(tool: ToolType): boolean {
	return !CONTINUOUS_TOOLS.has(tool)
}

/** Whether the tool lock has any effect on this tool - the others are always or never armed. */
export function canKeepActive(tool: ToolType): boolean {
	return !CONTINUOUS_TOOLS.has(tool) && !ALWAYS_REVERT_TOOLS.has(tool)
}

/** The tool that should be armed once `tool` has placed one object. */
export function nextToolAfterUse(tool: ToolType, locked: boolean): ToolType {
	if (CONTINUOUS_TOOLS.has(tool)) return tool
	if (locked && !ALWAYS_REVERT_TOOLS.has(tool)) return tool
	return 'select'
}

/** Whether the object just placed should become the selection. */
export function shouldSelectAfterUse(tool: ToolType, locked: boolean): boolean {
	return tool !== 'select' && nextToolAfterUse(tool, locked) === 'select'
}

/**
 * Whether closing an editor should also remove the object it was editing.
 *
 * Closing always COMMITS. Every keystroke went straight into the CRDT and is already on every
 * collaborator's screen, so there is no discard to offer - Ctrl+Z is the rollback.
 *
 * The single exception is an object that would be INVISIBLE without text. A text object renders its
 * text and a transparent hit rect and nothing else, so an empty one is a click trap nobody can see.
 * An empty sticky is still a visible 200x200 coloured card.
 *
 * A labelled SHAPE stays for the same reason a sticky does: the "at least one of stroke and fill"
 * invariant in utils/paint.ts means a rect, ellipse or polygon can never be cleared into
 * invisibility. That invariant is what keeps this rule true - do not weaken it.
 */
export function shouldRemoveOnEditEnd(objectType: IdealloObject['type'], text: string): boolean {
	return objectType === 'text' && !text.trim()
}

/** Below this a drag is a click, not a shape. */
const MIN_SHAPE_EXTENT = 5

/**
 * Client-space movement before a press counts as a drag rather than a click. In SCREEN pixels,
 * unlike MIN_SHAPE_EXTENT above: this is hand slop, so it must feel the same at every zoom.
 */
export const DRAG_THRESHOLD_PX = 3

/**
 * Whether a finished drag is big enough to become an object.
 *
 * A connector bound at BOTH ends is legitimately short - two adjacent boxes - so only that case
 * relaxes the size floor. A press-and-release over one shape binds the START terminal alone, and
 * committing that would add an invisible zero-length arrow to the document on every stray click.
 */
export function isCommittableShapePreview(preview: ShapePreview): boolean {
	const width = Math.abs(preview.endX - preview.startX)
	const height = Math.abs(preview.endY - preview.startY)
	if (width >= MIN_SHAPE_EXTENT || height >= MIN_SHAPE_EXTENT) return true
	return Boolean(preview.startObjectId && preview.endObjectId)
}

/**
 * Take a pending gesture result out of its ref, leaving the slot empty.
 *
 * A pointerup handler reads its pending state from a REF, not from React state, because the state
 * setter is asynchronous: two releases in the same frame both see the state as it was, so both
 * commit. Clearing the ref at each exit path is what the handlers used to do, and the commit paths
 * were the ones that forgot - a repeated release created a second shape, or applied the same drag
 * delta twice. Consuming it up front instead makes every exit path clear it, including the ones
 * nobody has written yet.
 *
 * Ref-shaped rather than value-shaped so the clear cannot be separated from the read.
 */
export function takePending<T>(ref: { current: T | null }): T | null {
	const pending = ref.current
	ref.current = null
	return pending
}

// vim: ts=4
