// This file is part of the Cloudillo Platform.
// Copyright (C) 2024-2026  Szilárd Hajba
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
 * Hook for handling document embedding via DocumentPicker
 *
 * UX Flow:
 * - Click Document tool in toolbar
 * - DocumentPicker opens immediately
 * - User selects a document
 * - Document embed is placed at view center
 * - Switch to select tool automatically
 */

import * as React from 'react'
import * as Y from 'yjs'
import { getAppBus } from '@cloudillo/core'

import type { YPrezilloDocument, ObjectId, DocumentObject } from '../crdt/index.js'
import { addObject } from '../crdt/index.js'

export interface UseDocumentHandlerOptions {
	yDoc: Y.Doc
	doc: YPrezilloDocument
	enabled: boolean
	documentFileId?: string
	onObjectCreated?: (id: ObjectId) => void
	onInsertComplete?: () => void
}

const DEFAULT_DOC_WIDTH = 400
const DEFAULT_DOC_HEIGHT = 300

export function useDocumentHandler(options: UseDocumentHandlerOptions) {
	const { yDoc, doc, enabled, documentFileId, onObjectCreated, onInsertComplete } = options
	const [isInserting, setIsInserting] = React.useState(false)

	const insertDocument = React.useCallback(
		async (centerX: number = 0, centerY: number = 0) => {
			if (!enabled || isInserting) return

			setIsInserting(true)

			try {
				const bus = getAppBus()
				const result = await bus.pickDocument({
					sourceFileId: documentFileId,
					title: 'Embed Document'
				})

				if (!result) {
					setIsInserting(false)
					onInsertComplete?.()
					return
				}

				const obj: Omit<DocumentObject, 'id'> = {
					type: 'document',
					x: centerX - DEFAULT_DOC_WIDTH / 2,
					y: centerY - DEFAULT_DOC_HEIGHT / 2,
					width: DEFAULT_DOC_WIDTH,
					height: DEFAULT_DOC_HEIGHT,
					fileId: result.fileId,
					contentType: result.contentType,
					appId: result.appId,
					rotation: 0,
					pivotX: 0.5,
					pivotY: 0.5,
					opacity: 1,
					visible: true,
					locked: false,
					hidden: false
				}

				const objectId = addObject(yDoc, doc, obj as DocumentObject)
				onObjectCreated?.(objectId)
				onInsertComplete?.()
			} catch (error) {
				console.error('Failed to embed document:', error)
			} finally {
				setIsInserting(false)
			}
		},
		[enabled, isInserting, yDoc, doc, documentFileId, onObjectCreated, onInsertComplete]
	)

	return React.useMemo(
		() => ({
			isInserting,
			insertDocument
		}),
		[isInserting, insertDocument]
	)
}

// vim: ts=4
