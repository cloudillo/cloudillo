// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Smart Upload Hook
 *
 * Wraps useUploadQueue with import/conversion detection.
 * When files with convertible MIME types are uploaded, presents
 * the user with a choice to upload as-is or convert to a native document.
 */

import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { useAuth } from '@cloudillo/react'

import { useContextAwareApi, useCurrentContextIdTag } from '../../../context/index.js'
import { getImportHandlers, type ImportHandler } from '../../../manifest-registry.js'
import { setPendingImport } from '../../../message-bus/handlers/import.js'
import { useUploadQueue, type UseUploadQueueOptions } from './useUploadQueue.js'

// ============================================
// TYPES
// ============================================

export interface PendingConversion {
	file: globalThis.File
	handlers: ImportHandler[]
}

// ============================================
// HOOK
// ============================================

export function useSmartUpload(options?: UseUploadQueueOptions) {
	const { t } = useTranslation()
	const [auth] = useAuth()
	const { api } = useContextAwareApi()
	const contextIdTag = useCurrentContextIdTag()
	const navigate = useNavigate()

	const uploadQueue = useUploadQueue(options)
	const [pendingConversions, setPendingConversions] = React.useState<PendingConversion[]>([])

	/**
	 * Handle files for upload — detects convertible types and shows dialog
	 */
	const handleFilesForUpload = React.useCallback(
		function handleFilesForUpload(files: globalThis.File[]) {
			const plainFiles: globalThis.File[] = []
			const convertible: PendingConversion[] = []

			for (const file of files) {
				const handlers = getImportHandlers(detectMimeType(file))
				if (handlers.length > 0) {
					convertible.push({ file, handlers })
				} else {
					plainFiles.push(file)
				}
			}

			// Upload non-convertible files immediately
			if (plainFiles.length > 0) {
				uploadQueue.addFiles(plainFiles)
			}

			// Show dialog for convertible files
			if (convertible.length > 0) {
				setPendingConversions((prev) => [...prev, ...convertible])
			}
		},
		[uploadQueue.addFiles]
	)

	/**
	 * Upload a convertible file as-is (user chose "Upload as file")
	 */
	const uploadAsFile = React.useCallback(
		function uploadAsFile(file: globalThis.File) {
			uploadQueue.addFiles([file])
			setPendingConversions((prev) => prev.filter((pc) => pc.file !== file))
		},
		[uploadQueue.addFiles]
	)

	/**
	 * Convert a file using the selected handler (user chose "Convert to...")
	 */
	const startConversion = React.useCallback(
		async function startConversion(file: globalThis.File, handler: ImportHandler) {
			if (!api) return

			// Remove from pending
			setPendingConversions((prev) => prev.filter((pc) => pc.file !== file))

			try {
				// Create document (RTDB for apps like notillo, CRDT for others)
				const fileTp = handler.manifest.capabilities?.includes('rtdb') ? 'RTDB' : 'CRDT'
				const res = await api.files.create({
					fileTp,
					contentType: handler.targetMimeType,
					parentId: options?.parentId || undefined
				})
				if (!res?.fileId) {
					console.error('[SmartUpload] Failed to create document: no fileId returned')
					return
				}

				// Set filename (strip extension, add nothing — calcillo shows as-is)
				const baseName = file.name.replace(/\.[^.]+$/, '')
				await api.files.update(res.fileId, {
					fileName: baseName || t('Untitled document')
				})

				// Read file as base64 — use proper UTF-8 encoding for text files
				const detectedType = detectMimeType(file)
				let base64: string
				if (detectedType.startsWith('text/')) {
					const text = await file.text()
					base64 = arrayBufferToBase64(
						new TextEncoder().encode(text).buffer as ArrayBuffer
					)
				} else {
					const buffer = await file.arrayBuffer()
					base64 = arrayBufferToBase64(buffer)
				}

				const ownerTag = contextIdTag || auth?.idTag
				if (!ownerTag) {
					console.error('[SmartUpload] Missing owner tag for import')
					return
				}
				const resId = `${ownerTag}:${res.fileId}`

				setPendingImport(resId, {
					sourceMimeType: detectedType,
					fileName: file.name,
					data: base64
				})

				// Navigate to the app with import flag
				const appId = handler.manifest.id
				navigate(`/app/${ownerTag}/${appId}/${res.fileId}?import=1`)
			} catch (err) {
				console.error('[SmartUpload] Conversion failed:', err)
			}
		},
		[api, auth?.idTag, contextIdTag, navigate, options?.parentId, t]
	)

	/**
	 * Dismiss all pending conversions (upload all as files)
	 */
	const dismissAll = React.useCallback(
		function dismissAll() {
			const files = pendingConversions.map((pc) => pc.file)
			if (files.length > 0) {
				uploadQueue.addFiles(files)
			}
			setPendingConversions([])
		},
		[pendingConversions, uploadQueue.addFiles]
	)

	return {
		// Pass through upload queue interface
		...uploadQueue,
		// Smart upload additions
		handleFilesForUpload,
		pendingConversions,
		uploadAsFile,
		startConversion,
		dismissAll
	}
}

// ============================================
// HELPERS
// ============================================

/**
 * Detect MIME type with extension-based fallback.
 * Browsers often report .md files as "" or "text/plain" or "text/x-markdown".
 */
function detectMimeType(file: globalThis.File): string {
	if (file.type === 'text/x-markdown') return 'text/markdown'
	if (file.type && file.type !== 'text/plain') return file.type
	const ext = file.name.split('.').pop()?.toLowerCase()
	if (ext === 'md' || ext === 'markdown') return 'text/markdown'
	return file.type || 'application/octet-stream'
}

/**
 * Convert ArrayBuffer to base64 string using chunked encoding.
 * Avoids btoa() input size limits and O(n^2) string concatenation.
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer)
	const chunks: string[] = []
	const chunkSize = 8192
	for (let i = 0; i < bytes.length; i += chunkSize) {
		chunks.push(String.fromCharCode(...bytes.subarray(i, i + chunkSize)))
	}
	return btoa(chunks.join(''))
}

// vim: ts=4
