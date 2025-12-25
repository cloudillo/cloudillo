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
 * Hook for handling image insertion via MediaPicker
 *
 * UX Flow:
 * - Click Image tool in toolbar
 * - MediaPicker opens immediately
 * - User selects/uploads an image
 * - Image is placed at view center
 * - Switch to select tool automatically
 */

import * as React from 'react'
import * as Y from 'yjs'
import { getAppBus } from '@cloudillo/base'

import type { YPrezilloDocument, ObjectId, ImageObject } from '../crdt/index.js'
import { addObject } from '../crdt/index.js'

export interface UseImageHandlerOptions {
	yDoc: Y.Doc
	doc: YPrezilloDocument
	enabled: boolean
	documentFileId?: string // For visibility comparison in MediaPicker
	onObjectCreated?: (id: ObjectId) => void
	onInsertComplete?: () => void // Called after insertion to switch tool
}

// Default image size (will be square, aspect ratio determined by actual image)
const DEFAULT_IMAGE_SIZE = 300

export function useImageHandler(options: UseImageHandlerOptions) {
	const { yDoc, doc, enabled, documentFileId, onObjectCreated, onInsertComplete } = options

	// Track if we're currently inserting (to prevent double-opens)
	const [isInserting, setIsInserting] = React.useState(false)

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

				// Create image object at specified center
				const obj: Omit<ImageObject, 'id'> = {
					type: 'image',
					x: centerX - DEFAULT_IMAGE_SIZE / 2,
					y: centerY - DEFAULT_IMAGE_SIZE / 2,
					width: DEFAULT_IMAGE_SIZE,
					height: DEFAULT_IMAGE_SIZE,
					fileId: result.fileId,
					rotation: 0,
					pivotX: 0.5,
					pivotY: 0.5,
					opacity: 1,
					visible: true,
					locked: false
				}

				const objectId = addObject(yDoc, doc, obj as ImageObject)
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
