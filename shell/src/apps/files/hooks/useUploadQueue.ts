// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import type { ApiClient } from '@cloudillo/core'
import { useContextAwareApi } from '../../../context/index.js'

export interface UploadItem {
	id: string
	file: globalThis.File
	progress: number
	status: 'queued' | 'uploading' | 'complete' | 'error'
	error?: string
	fileId?: string
}

export interface UseUploadQueueOptions {
	parentId?: string | null
	onUploadComplete?: () => void
	apiOverride?: ApiClient | null
}

let uploadIdCounter = 0

export function useUploadQueue(options?: UseUploadQueueOptions) {
	const { api } = useContextAwareApi()
	const [queue, setQueue] = React.useState<UploadItem[]>([])
	const [isUploading, setIsUploading] = React.useState(false)
	const processingRef = React.useRef(false)

	const { parentId, onUploadComplete, apiOverride } = options || {}

	// Add files to the upload queue
	const addFiles = React.useCallback(function addFiles(files: globalThis.File[]) {
		const newItems: UploadItem[] = files.map((file) => ({
			id: `upload-${++uploadIdCounter}`,
			file,
			progress: 0,
			status: 'queued' as const
		}))

		setQueue((prev) => [...prev, ...newItems])
	}, [])

	// Remove an item from the queue
	const removeItem = React.useCallback(function removeItem(id: string) {
		setQueue((prev) => prev.filter((item) => item.id !== id))
	}, [])

	// Clear completed items
	const clearCompleted = React.useCallback(function clearCompleted() {
		setQueue((prev) => prev.filter((item) => item.status !== 'complete'))
	}, [])

	// Clear all items
	const clearAll = React.useCallback(function clearAll() {
		setQueue([])
	}, [])

	// Process the queue
	React.useEffect(
		function processQueue() {
			const effectiveApi = apiOverride ?? api
			if (!effectiveApi || processingRef.current) return

			const nextItem = queue.find((item) => item.status === 'queued')
			if (!nextItem) {
				if (isUploading) {
					setIsUploading(false)
				}
				return
			}

			processingRef.current = true
			setIsUploading(true)

			// Mark item as uploading
			setQueue((prev) =>
				prev.map((item) =>
					item.id === nextItem.id ? { ...item, status: 'uploading' as const } : item
				)
			)

			;(async function uploadFile() {
				try {
					// Upload the file
					const result = await effectiveApi.files.uploadBlob(
						'file', // preset
						nextItem.file.name,
						nextItem.file,
						nextItem.file.type
					)

					// If we have a parentId, move the file to that folder
					if (parentId) {
						await effectiveApi.files.update(result.fileId, { parentId })
					}

					// Mark as complete
					setQueue((prev) =>
						prev.map((item) =>
							item.id === nextItem.id
								? {
										...item,
										status: 'complete' as const,
										progress: 100,
										fileId: result.fileId
									}
								: item
						)
					)

					// Notify completion
					onUploadComplete?.()
				} catch (err) {
					// Mark as error
					setQueue((prev) =>
						prev.map((item) =>
							item.id === nextItem.id
								? {
										...item,
										status: 'error' as const,
										error: err instanceof Error ? err.message : 'Upload failed'
									}
								: item
						)
					)
				} finally {
					processingRef.current = false
				}
			})()
		},
		[api, apiOverride, queue, parentId, onUploadComplete, isUploading]
	)

	const stats = React.useMemo(
		function computeStats() {
			const total = queue.length
			const completed = queue.filter((item) => item.status === 'complete').length
			const errors = queue.filter((item) => item.status === 'error').length
			const pending = queue.filter(
				(item) => item.status === 'queued' || item.status === 'uploading'
			).length

			return { total, completed, errors, pending }
		},
		[queue]
	)

	return {
		queue,
		isUploading,
		stats,
		addFiles,
		removeItem,
		clearCompleted,
		clearAll
	}
}

// vim: ts=4
