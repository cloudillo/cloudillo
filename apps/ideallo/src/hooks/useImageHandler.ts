// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Hook for handling image insertion via MediaPicker
 *
 * UX Flow:
 * - Click Image tool in toolbar
 * - MediaPicker opens immediately
 * - User selects/uploads an image
 * - Image is placed at canvas center
 * - Switch to select tool automatically
 */

import * as React from 'react'
import type * as Y from 'yjs'
import { getAppBus, type MediaFileResolvedPush } from '@cloudillo/core'

import type { YIdealloDocument, ObjectId, NewImageInput } from '../crdt/index.js'
import { addObject, updateObject } from '../crdt/index.js'

export interface UseImageHandlerOptions {
	yDoc: Y.Doc
	doc: YIdealloDocument
	enabled: boolean
	documentFileId?: string // For visibility comparison in MediaPicker
	onObjectCreated?: (id: ObjectId) => void
	onInsertComplete?: () => void // Called after insertion to switch tool
}

// Default image size (will be square, aspect ratio determined by actual image)
const DEFAULT_IMAGE_SIZE = 300

// Track temp file ID -> object ID mapping for resolution
// This is module-level since it needs to persist across re-renders
const pendingTempIds = new Map<string, { yDoc: Y.Doc; doc: YIdealloDocument; objectId: ObjectId }>()

export function useImageHandler(options: UseImageHandlerOptions) {
	const { yDoc, doc, enabled, documentFileId, onObjectCreated, onInsertComplete } = options

	// Track if we're currently inserting (to prevent double-opens)
	const [isInserting, setIsInserting] = React.useState(false)

	// Set up listener for file ID resolution messages
	React.useEffect(() => {
		const bus = getAppBus()

		const handleFileResolved = (msg: MediaFileResolvedPush) => {
			const { tempId, finalId } = msg.payload
			const pending = pendingTempIds.get(tempId)

			if (pending) {
				console.log('[ImageHandler] Resolving temp ID:', tempId, '->', finalId)
				// Update the object's fileId in the CRDT
				updateObject(pending.yDoc, pending.doc, pending.objectId, { fileId: finalId })
				pendingTempIds.delete(tempId)
			}
		}

		bus.on('media:file.resolved', handleFileResolved)

		return () => {
			bus.off('media:file.resolved')
		}
	}, [])

	/**
	 * Open MediaPicker and insert image at given canvas coordinates
	 * If no coordinates provided, uses default position (0, 0)
	 */
	const insertImage = React.useCallback(
		async (centerX: number = 0, centerY: number = 0) => {
			if (!enabled || isInserting) return

			setIsInserting(true)

			try {
				const bus = getAppBus()
				const result = await bus.pickMedia({
					mediaType: 'image/*',
					documentFileId,
					title: 'Insert Image'
				})

				if (!result) {
					// User cancelled the picker
					setIsInserting(false)
					onInsertComplete?.()
					return
				}

				// Use dimensions from MediaPicker result, fallback to default
				const [width, height] = result.dim || [DEFAULT_IMAGE_SIZE, DEFAULT_IMAGE_SIZE]

				// Create image object at canvas center
				const obj: NewImageInput = {
					type: 'image',
					x: centerX - width / 2,
					y: centerY - height / 2,
					width,
					height,
					fileId: result.fileId,
					rotation: 0,
					pivotX: 0.5,
					pivotY: 0.5,
					locked: false,
					style: {
						strokeColor: 'transparent',
						fillColor: 'transparent',
						strokeWidth: 0,
						strokeStyle: 'solid',
						opacity: 1
					}
				}

				const objectId = addObject(yDoc, doc, obj)

				// Register for file ID resolution if this is a temp ID
				if (result.fileId.startsWith('@')) {
					pendingTempIds.set(result.fileId, { yDoc, doc, objectId })
				}

				onObjectCreated?.(objectId)
				onInsertComplete?.()
			} catch (error) {
				console.error('Failed to insert image:', error)
			} finally {
				setIsInserting(false)
			}
		},
		[enabled, isInserting, yDoc, doc, documentFileId, onObjectCreated, onInsertComplete]
	)

	// Memoize return value
	return React.useMemo(
		() => ({
			isInserting,
			insertImage
		}),
		[isInserting, insertImage]
	)
}

// vim: ts=4
