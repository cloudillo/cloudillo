// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The single text-editing slot, for every kind of object that can carry text.
 *
 * There is only ever ONE editor on screen, and exactly one rule for closing it, so there is one
 * piece of state and one close path here. useStickyHandler and useTextHandler hold only the
 * CREATION halves - they build very different objects - and hand the result to `startEditing`.
 *
 * Closing always COMMITS: every keystroke went straight into the CRDT and is already on every
 * collaborator's screen, so there is nothing to write back and nothing to discard. Ctrl+Z is the
 * way out. The single exception is an object that would be invisible without text, which
 * `shouldRemoveOnEditEnd` decides.
 */

import * as React from 'react'
import type * as Y from 'yjs'

import type { IdealloObject, ObjectId, YIdealloDocument } from '../crdt/index.js'
import {
	deleteObjectsWithBindingCleanup,
	ensureObjectYText,
	getObject,
	getObjectYText
} from '../crdt/index.js'
import { shouldRemoveOnEditEnd } from '../tools/lifecycle.js'
import type { CaretPoint, ObjectEditState } from '../tools/types.js'
import { objectTextBox } from '../utils/object-text.js'

export interface UseObjectTextEditorOptions {
	yDoc: Y.Doc
	doc: YIdealloDocument
	/** An empty text object is removed on close; the selection must let go of it. */
	onObjectDeleted?: (id: ObjectId) => void
	onEditStart?: (id: ObjectId) => void
	onEditEnd?: () => void
}

export interface ObjectTextEditor {
	editing: ObjectEditState | null
	startEditing: (object: IdealloObject, caretPoint?: CaretPoint) => void
	endEditing: () => void
	isEditing: (objectId: ObjectId) => boolean
}

export function useObjectTextEditor(options: UseObjectTextEditorOptions): ObjectTextEditor {
	const { yDoc, doc, onObjectDeleted, onEditStart, onEditEnd } = options

	const [editing, setEditing] = React.useState<ObjectEditState | null>(null)

	// Assigned during render, so the close path never reads a value one render behind. NOT
	// useLatestRef: startEditing writes this eagerly (see there), and an insertion-effect write
	// would land after the close that must already see the editor opening.
	const editingRef = React.useRef<ObjectEditState | null>(null)
	editingRef.current = editing

	/**
	 * Close the editor, and drop the object if nothing was typed into one that needs text.
	 *
	 * Read-and-clear: the click that ends an edit and the blur it causes both land here, and the
	 * second call must not try to delete an object the first one already removed.
	 */
	const endEditing = React.useCallback(() => {
		const current = editingRef.current
		editingRef.current = null
		setEditing(null)
		if (!current) return
		onEditEnd?.()

		// Gone already - a collaborator deleted it, or an earlier close cleaned it up
		const object = getObject(doc, current.id)
		if (!object) return

		const text = getObjectYText(doc, current.id)?.toString() ?? ''
		if (!shouldRemoveOnEditEnd(object.type, text)) return

		deleteObjectsWithBindingCleanup(yDoc, doc, [current.id])
		onObjectDeleted?.(current.id)
	}, [yDoc, doc, onObjectDeleted, onEditEnd])

	/**
	 * Open the editor on an object, from a double-click, from Enter, or from a tool that just
	 * created it.
	 *
	 * The Y.Text is created HERE rather than in addObject: a board full of empty Y.Texts is pure
	 * overhead, and a shape is born without text.
	 */
	const startEditing = React.useCallback(
		(object: IdealloObject, caretPoint?: CaretPoint) => {
			// Gone already - a collaborator deleted it between the gesture and this call
			if (!ensureObjectYText(yDoc, doc, object.id)) return
			const next: ObjectEditState = { id: object.id, ...objectTextBox(object), caretPoint }
			// Eagerly, not just via the render assignment: a close arriving before the next render
			// must see the editor that is opening, not the one that just closed
			editingRef.current = next
			setEditing(next)
			onEditStart?.(object.id)
		},
		[yDoc, doc, onEditStart]
	)

	const isEditing = React.useCallback((objectId: ObjectId) => editing?.id === objectId, [editing])

	return React.useMemo(
		() => ({ editing, startEditing, endEditing, isEditing }),
		[editing, startEditing, endEditing, isEditing]
	)
}

// vim: ts=4
