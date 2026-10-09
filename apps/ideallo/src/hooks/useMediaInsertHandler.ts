// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Media insertion for the canvas tools: the Image and Document tools both open
 * the shell's picker, place the object at the given canvas center and switch the
 * tool back through `onInsertComplete` — one implementation keyed by kind.
 */

import {
	type DocLinkResult,
	type DocPickResult,
	getAppBus,
	type MediaFileResolvedPush,
	type MediaPickResult
} from '@cloudillo/core'
import * as React from 'react'
import type * as Y from 'yjs'

import type { NewDocumentInput, NewImageInput, ObjectId, YIdealloDocument } from '../crdt/index.js'
import { addObject, updateObject } from '../crdt/index.js'

export type MediaInsertKind = 'image' | 'document'

export interface UseMediaInsertHandlerOptions {
	yDoc: Y.Doc
	doc: YIdealloDocument
	enabled: boolean
	documentFileId?: string // For visibility comparison in the picker
	onObjectCreated?: (id: ObjectId) => void
	onInsertComplete?: () => void // Called after insertion to switch tool
}

// Default sizes (aspect ratio determined by the actual image for images)
const DEFAULT_IMAGE_SIZE = 300
const DEFAULT_DOC_WIDTH = 400
const DEFAULT_DOC_HEIGHT = 300

// Module-level: the temp ID -> object ID mapping must survive re-renders.
const pendingTempIds = new Map<string, { yDoc: Y.Doc; doc: YIdealloDocument; objectId: ObjectId }>()

// No visible border on insert (the colour is cleared), but the width picker
// starts on a REAL preset, so picking a colour immediately gives a 2px border
// rather than an invisible 0-width one.
const DEFAULT_STYLE = {
	strokeColor: 'transparent',
	fillColor: 'transparent',
	strokeWidth: 2,
	strokeStyle: 'solid',
	opacity: 1
} as const

function useMediaInsertHandler(kind: MediaInsertKind, options: UseMediaInsertHandlerOptions) {
	const { yDoc, doc, enabled, documentFileId, onObjectCreated, onInsertComplete } = options

	// Track if we're currently inserting (to prevent double-opens)
	const [isInserting, setIsInserting] = React.useState(false)

	// Set up listener for file ID resolution messages. Only images get temp IDs,
	// and the bus keeps ONE handler per message type — registering from the
	// document hook too would just take the slot from a future subscriber.
	React.useEffect(() => {
		if (kind !== 'image') return
		const bus = getAppBus()

		const handleFileResolved = (msg: MediaFileResolvedPush) => {
			const { tempId, finalId } = msg.payload
			const pending = pendingTempIds.get(tempId)

			if (pending) {
				console.log('[ImageHandler] Resolving temp ID:', tempId, '->', finalId)
				updateObject(pending.yDoc, pending.doc, pending.objectId, { fileId: finalId })
				pendingTempIds.delete(tempId)
			}
		}

		bus.on('media:file.resolved', handleFileResolved)

		return () => {
			bus.off('media:file.resolved', handleFileResolved)
		}
	}, [kind])

	const insert = React.useCallback(
		async (centerX: number = 0, centerY: number = 0, link?: DocLinkResult) => {
			// A pre-resolved `link` (pasted `cl:` ref) skips the picker and works with any tool
			if ((!enabled && !link) || isInserting) return

			setIsInserting(true)

			try {
				const bus = getAppBus()
				const result =
					kind === 'image'
						? await bus.pickMedia({
								mediaType: 'image/*',
								documentFileId,
								title: 'Insert Image'
							})
						: (link ??
							(await bus.pickDocument({
								sourceFileId: documentFileId,
								title: 'Embed Document'
							})))

				if (!result) {
					// User cancelled the picker
					onInsertComplete?.()
					return
				}

				let obj: NewImageInput | NewDocumentInput
				if (kind === 'image') {
					const picked = result as MediaPickResult
					const [width, height] = picked.dim || [DEFAULT_IMAGE_SIZE, DEFAULT_IMAGE_SIZE]
					obj = {
						type: 'image',
						x: centerX - width / 2,
						y: centerY - height / 2,
						width,
						height,
						fileId: picked.fileId,
						rotation: 0,
						pivotX: 0.5,
						pivotY: 0.5,
						locked: false,
						style: DEFAULT_STYLE
					}
				} else {
					const picked = result as DocPickResult
					obj = {
						type: 'document',
						x: centerX - DEFAULT_DOC_WIDTH / 2,
						y: centerY - DEFAULT_DOC_HEIGHT / 2,
						width: DEFAULT_DOC_WIDTH,
						height: DEFAULT_DOC_HEIGHT,
						fileId: picked.fileId,
						contentType: picked.contentType,
						appId: picked.appId,
						...(link?.nav && { navState: link.nav }),
						rotation: 0,
						pivotX: 0.5,
						pivotY: 0.5,
						locked: false,
						style: DEFAULT_STYLE
					}
				}

				const objectId = addObject(yDoc, doc, obj)

				if (kind === 'image' && (result as MediaPickResult).fileId.startsWith('@')) {
					pendingTempIds.set(result.fileId, { yDoc, doc, objectId })
				}

				onObjectCreated?.(objectId)
				// A paste didn't start from the tool, so it has no tool to switch back
				if (!link) onInsertComplete?.()
			} catch (error) {
				console.error(
					kind === 'image' ? 'Failed to insert image:' : 'Failed to embed document:',
					error
				)
				// Without this the tool stays on 'image': the effect that opens the
				// picker is keyed on activeTool alone, so re-clicking the button changes
				// nothing and the tool is inert until the user switches away and back.
				if (!link) onInsertComplete?.()
			} finally {
				setIsInserting(false)
			}
		},
		[enabled, isInserting, kind, yDoc, doc, documentFileId, onObjectCreated, onInsertComplete]
	)

	return React.useMemo(
		() => ({
			isInserting,
			insert
		}),
		[isInserting, insert]
	)
}

export interface UseImageHandlerOptions extends UseMediaInsertHandlerOptions {}

/** Image tool handler: opens the MediaPicker and places the image at the given center. */
export function useImageHandler(options: UseImageHandlerOptions) {
	const { insert, isInserting } = useMediaInsertHandler('image', options)
	return React.useMemo(() => ({ isInserting, insertImage: insert }), [isInserting, insert])
}

export interface UseDocumentHandlerOptions extends UseMediaInsertHandlerOptions {}

/** Document tool handler: opens the DocumentPicker and places the embed at the given center. */
export function useDocumentHandler(options: UseDocumentHandlerOptions) {
	const { insert, isInserting } = useMediaInsertHandler('document', options)
	return React.useMemo(() => ({ isInserting, insertDocument: insert }), [isInserting, insert])
}

// vim: ts=4
