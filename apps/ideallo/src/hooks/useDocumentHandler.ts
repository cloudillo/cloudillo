// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Hook for handling document embedding via DocumentPicker
 *
 * UX Flow:
 * - Click Document tool in toolbar
 * - DocumentPicker opens immediately
 * - User selects a document
 * - Document embed is placed at canvas center
 * - Switch to select tool automatically
 */

import * as React from 'react'
import type * as Y from 'yjs'
import { getAppBus } from '@cloudillo/core'

import type { YIdealloDocument, ObjectId, NewDocumentInput } from '../crdt/index.js'
import { addObject } from '../crdt/index.js'

export interface UseDocumentHandlerOptions {
	yDoc: Y.Doc
	doc: YIdealloDocument
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
					onInsertComplete?.()
					return
				}

				const obj: NewDocumentInput = {
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
				onObjectCreated?.(objectId)
				onInsertComplete?.()
			} catch (error) {
				console.error('Failed to embed document:', error)
				onInsertComplete?.()
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
