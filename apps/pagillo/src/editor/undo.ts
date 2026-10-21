// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * Per-user undo/redo: a Y.UndoManager over `tx f st ms s`, tracking only the local origin
 * (`yDoc.clientID`), so remote edits, the bid normaliser (`NORMALIZE_ORIGIN`) and applying a
 * template (`TEMPLATE_ORIGIN`) are never undone.
 * `secs` is out of scope (invariant), so undoing a section break leaves an orphan `secs`
 * id, which `toEnginePublication` skips; the caret follows undo via the editor's remote mapping.
 */

import * as React from 'react'
import * as Y from 'yjs'

import type { YPagilloDocument } from '../crdt/stored-types'

export interface Undo {
	undo(): void
	redo(): void
	canUndo: boolean
	canRedo: boolean
	/** Local undo stack depth. */
	depth(): number
	/** Close the open capture group (later edits start a new step) and return `depth()`. */
	mark(): number
	/** Undo local steps until the stack is `depth` deep (Edit layout Discard). */
	undoTo(depth: number): void
}

export function useUndo(yDoc: Y.Doc, doc: YPagilloDocument, synced: boolean): Undo {
	const um = React.useMemo(
		() =>
			new Y.UndoManager([doc.tx, doc.f, doc.st, doc.ms, doc.s], {
				trackedOrigins: new Set([yDoc.clientID])
			}),
		[yDoc, doc]
	)
	// The clientID can change at sync (reused id assigned post-sync), see prezillo.
	React.useEffect(() => {
		if (synced) um.trackedOrigins.add(yDoc.clientID)
	}, [synced, yDoc, um])

	const [, bump] = React.useReducer((n: number) => n + 1, 0)
	React.useEffect(() => {
		const events = ['stack-item-added', 'stack-item-popped', 'stack-cleared'] as const
		for (const ev of events) um.on(ev, bump)
		// No destroy() here: StrictMode re-runs effects on the same memoised manager.
		return () => {
			for (const ev of events) um.off(ev, bump)
		}
	}, [um])

	return {
		undo: () => um.undo(),
		redo: () => um.redo(),
		canUndo: um.canUndo(),
		canRedo: um.canRedo(),
		depth: () => um.undoStack.length,
		mark: () => {
			um.stopCapturing()
			return um.undoStack.length
		},
		undoTo: (depth) => {
			while (um.undoStack.length > depth && um.undo()) {}
		}
	}
}

// vim: ts=4
