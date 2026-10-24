// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * Collaborative speaker notes editor for one slide: Quill bound to the slide's `doc.vn` Y.Text.
 *
 * The Y.Text is created lazily (first time the slide's notes are shown, once synced). The Quill
 * instance is keyed on the Y.Text instance, so switching slides, or another client's concurrent
 * create winning the map key, rebinds to the current entry; typing into the losing text is
 * appended to the winner. Undo/redo is local to the editor.
 */

import Quill from 'quill'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { QuillBinding } from 'y-quill'
import * as Y from 'yjs'

import type { ViewId, YPrezilloDocument } from '../crdt'
import { appendNotesDelta, getOrCreateViewNotes, lostConcurrentCreate } from '../crdt'

export interface NotesEditorProps {
	yDoc: Y.Doc
	doc: YPrezilloDocument
	viewId: ViewId
	/** Document synced: before that a missing entry may just not have arrived yet */
	synced: boolean
	/** Accessible name of the editor */
	ariaLabel?: string
}

export function NotesEditor({ yDoc, doc, viewId, synced, ariaLabel }: NotesEditorProps) {
	const { t } = useTranslation()
	const hostRef = React.useRef<HTMLDivElement>(null)
	const undoRef = React.useRef<Y.UndoManager | null>(null)
	const placeholder = t('Add speaker notes…')

	// Re-render when a notes entry is added, replaced or removed (shallow: not on every keystroke)
	const [, rerender] = React.useReducer((n: number) => n + 1, 0)
	React.useEffect(() => {
		doc.vn.observe(rerender)
		return () => doc.vn.unobserve(rerender)
	}, [doc])
	const yText = doc.vn.get(viewId)

	// The entry this client created, and a snapshot of its content: if another client's create
	// wins the key, Yjs deletes the loser's content, so the snapshot is what gets carried over
	const createdRef = React.useRef<{ viewId: ViewId; text: Y.Text } | null>(null)
	const lastDeltaRef = React.useRef<ReturnType<Y.Text['toDelta']>>([])

	// Lazy creation; the map observer above picks up the new entry
	React.useEffect(() => {
		if (yText || !synced || !doc.v.has(viewId)) return
		createdRef.current = { viewId, text: getOrCreateViewNotes(yDoc, doc, viewId) }
		lastDeltaRef.current = []
	}, [yDoc, doc, viewId, yText, synced])

	React.useEffect(() => {
		const created = createdRef.current
		if (!yText || created?.viewId !== viewId) return
		if (yText === created.text) {
			const snapshot = () => {
				if (!created.text._item?.deleted) lastDeltaRef.current = created.text.toDelta()
			}
			yText.observe(snapshot)
			return () => yText.unobserve(snapshot)
		}
		// Lost the key to a concurrent create; a later replace (undo restore) already has the content
		if (lostConcurrentCreate(yText, created.text)) {
			appendNotesDelta(yDoc, yText, lastDeltaRef.current)
		}
		createdRef.current = null
		lastDeltaRef.current = []
	}, [yDoc, viewId, yText])

	React.useEffect(() => {
		const host = hostRef.current
		if (!host || !yText) return

		// A fresh element per binding, so a rebind never reuses a Quill-initialised node
		const el = document.createElement('div')
		host.appendChild(el)
		const quill = new Quill(el, {
			theme: false as unknown as string, // No theme, styled by the app
			modules: { toolbar: false, history: false },
			formats: ['bold', 'italic', 'list'],
			placeholder
		})
		quill.root.setAttribute('role', 'textbox')
		quill.root.setAttribute('aria-multiline', 'true')
		if (ariaLabel) quill.root.setAttribute('aria-label', ariaLabel)

		// No awareness: prezillo registers no quill-cursors
		const binding = new QuillBinding(yText, quill)
		// y-quill transacts with origin = binding; the default {null} would record nothing
		const undo = new Y.UndoManager(yText, { trackedOrigins: new Set([binding]) })
		undoRef.current = undo

		return () => {
			undoRef.current = null
			undo.destroy()
			binding.destroy()
			el.remove()
		}
	}, [yText, placeholder, ariaLabel])

	function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
		const undo = undoRef.current
		if (!undo || !(e.ctrlKey || e.metaKey) || e.altKey) return
		const key = e.key.toLowerCase()
		const redo = (key === 'z' && e.shiftKey) || (key === 'y' && e.ctrlKey && !e.shiftKey)
		if (key !== 'z' && !redo) return
		// Keep the canvas undo out of it
		e.preventDefault()
		e.stopPropagation()
		if (redo) undo.redo()
		else undo.undo()
	}

	return <div ref={hostRef} className="c-notes-editor" onKeyDown={onKeyDown} />
}

// vim: ts=4
