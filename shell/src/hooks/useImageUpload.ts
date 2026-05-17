// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { useApi } from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { getUploadErrorMessage } from '../upload-errors.js'

export interface UseImageUploadOptions {
	onUploadComplete?: (fileId: string) => void
}

export type AttachmentType = 'image' | 'video' | 'document' | undefined

export interface UseImageUploadReturn {
	attachment: string | undefined
	attachmentIds: string[]
	attachmentType: AttachmentType
	isPreparing: boolean
	isUploading: boolean
	uploadProgress: number | undefined
	uploadError: string | undefined
	initAttachments: (ids: string[], type: AttachmentType) => void
	selectFile: (file: File) => void
	uploadAttachment: (blob: Blob) => Promise<void>
	uploadSvg: (file: File) => Promise<void>
	uploadDocument: (file: File) => Promise<void>
	uploadVideo: (file: File) => Promise<void>
	retryUpload: () => Promise<void>
	removeAttachment: (id: string) => void
	cancelCrop: () => void
	reset: () => void
	abortUpload: () => void
	clearUploadError: () => void
}

interface LastUpload {
	preset: string
	data: Blob | File
	contentType?: string
	type: Exclude<AttachmentType, undefined>
	clearPreview: boolean
}

export function useImageUpload(options?: UseImageUploadOptions): UseImageUploadReturn {
	const { t } = useTranslation()
	const { api } = useApi()
	const [attachment, setAttachment] = React.useState<string | undefined>()
	const [attachmentIds, setAttachmentIds] = React.useState<string[]>([])
	const [attachmentType, setAttachmentType] = React.useState<AttachmentType>(undefined)
	const [isPreparing, setIsPreparing] = React.useState(false)
	const [isUploading, setIsUploading] = React.useState(false)
	const [uploadProgress, setUploadProgress] = React.useState<number | undefined>()
	const [uploadError, setUploadError] = React.useState<string | undefined>()

	const abortControllerRef = React.useRef<AbortController | null>(null)
	const lastUploadRef = React.useRef<LastUpload | null>(null)
	const optionsRef = React.useRef(options)
	React.useEffect(() => {
		optionsRef.current = options
	}, [options])

	// Cleanup on unmount - abort any active upload
	React.useEffect(() => {
		return () => {
			abortControllerRef.current?.abort()
			abortControllerRef.current = null
		}
	}, [])

	const initAttachments = React.useCallback((ids: string[], type: AttachmentType) => {
		setAttachmentIds(ids)
		setAttachmentType(type)
	}, [])

	const selectFile = React.useCallback(
		(file: File) => {
			lastUploadRef.current = null
			setUploadError(undefined)
			setIsPreparing(true)
			const reader = new FileReader()
			reader.onload = function (evt) {
				if (typeof evt?.target?.result === 'string') {
					setAttachment(evt.target.result)
				}
				setIsPreparing(false)
			}
			reader.onerror = function () {
				setIsPreparing(false)
				setUploadError(t('Failed to read file'))
			}
			reader.readAsDataURL(file)
		},
		[t]
	)

	const runUpload = React.useCallback(
		async (job: LastUpload) => {
			if (!api) return
			lastUploadRef.current = job

			abortControllerRef.current?.abort()
			const abortController = new AbortController()
			abortControllerRef.current = abortController

			setIsUploading(true)
			setUploadProgress(undefined)
			setUploadError(undefined)

			try {
				const result = await api.files.uploadBlob(
					job.preset,
					'attachment',
					job.data,
					job.contentType,
					{
						as: 'managed',
						onProgress: setUploadProgress,
						signal: abortController.signal
					}
				)
				if (result?.fileId) {
					const fileId = result.fileId
					setAttachmentIds((ids) => [...ids, fileId])
					setAttachmentType(job.type)
					optionsRef.current?.onUploadComplete?.(fileId)
					if (job.clearPreview) setAttachment(undefined)
				}
			} catch (err) {
				if (err instanceof DOMException && err.name === 'AbortError') return
				if (abortControllerRef.current === abortController) {
					setUploadError(getUploadErrorMessage(t, err))
				}
			} finally {
				if (abortControllerRef.current === abortController) {
					setIsUploading(false)
					setUploadProgress(undefined)
					abortControllerRef.current = null
				}
			}
		},
		[api, t]
	)

	const uploadAttachment = React.useCallback(
		(blob: Blob) =>
			runUpload({
				preset: 'image',
				data: blob,
				type: 'image',
				clearPreview: true
			}),
		[runUpload]
	)

	const uploadSvg = React.useCallback(
		(file: File) =>
			runUpload({
				preset: 'image',
				data: file,
				contentType: 'image/svg+xml',
				type: 'image',
				clearPreview: false
			}),
		[runUpload]
	)

	const uploadDocument = React.useCallback(
		(file: File) =>
			runUpload({
				preset: 'default',
				data: file,
				contentType: 'application/pdf',
				type: 'document',
				clearPreview: false
			}),
		[runUpload]
	)

	const uploadVideo = React.useCallback(
		(file: File) =>
			runUpload({
				preset: 'video',
				data: file,
				type: 'video',
				clearPreview: false
			}),
		[runUpload]
	)

	const retryUpload = React.useCallback(async () => {
		const last = lastUploadRef.current
		if (!last) return
		await runUpload(last)
	}, [runUpload])

	const removeAttachment = React.useCallback((id: string) => {
		setAttachmentIds((ids) => {
			const newIds = ids.filter((i) => i !== id)
			if (newIds.length === 0) {
				setAttachmentType(undefined)
			}
			return newIds
		})
	}, [])

	const cancelCrop = React.useCallback(() => {
		setAttachment(undefined)
	}, [])

	const reset = React.useCallback(() => {
		setAttachment(undefined)
		setAttachmentIds([])
		setAttachmentType(undefined)
		setIsPreparing(false)
		setIsUploading(false)
		setUploadProgress(undefined)
		setUploadError(undefined)
		lastUploadRef.current = null
	}, [])

	const abortUpload = React.useCallback(() => {
		abortControllerRef.current?.abort()
		abortControllerRef.current = null
	}, [])

	const clearUploadError = React.useCallback(() => {
		setUploadError(undefined)
	}, [])

	return {
		attachment,
		attachmentIds,
		attachmentType,
		isPreparing,
		isUploading,
		uploadProgress,
		uploadError,
		initAttachments,
		selectFile,
		uploadAttachment,
		uploadSvg,
		uploadDocument,
		uploadVideo,
		retryUpload,
		removeAttachment,
		cancelCrop,
		reset,
		abortUpload,
		clearUploadError
	}
}

// vim: ts=4
