// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * MediaPickerUploadTab Component
 *
 * Upload tab for the media picker.
 * Allows users to upload new files with optional image cropping.
 */

import type { CropAspect, Visibility } from '@cloudillo/core'
import {
	ActionBar,
	Alert,
	Button,
	DropZone,
	EmptyState,
	Field,
	PERSONAL_VISIBILITY,
	Progress,
	Text,
	useApi,
	VBox,
	VisibilitySelect
} from '@cloudillo/react'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LuCheck as IcCheck, LuX as IcClose } from 'react-icons/lu'

import { useApiContext } from '../../context/index.js'
import type { MediaPickerResult } from '../../context/media-picker-atom.js'
import { type Aspect, ImageUpload } from '../../image.js'
import { getUploadErrorMessage } from '../../upload-errors.js'

interface MediaPickerUploadTabProps {
	mediaType?: string
	enableCrop?: boolean
	cropAspects?: CropAspect[]
	isExternalContext?: boolean // True when opened from external app
	idTag?: string // Document's context idTag
	documentFileId?: string // Document file ID for rootId association
	onUploadComplete: (file: MediaPickerResult) => void
	onCroppingChange?: (isCropping: boolean) => void // Signal when crop mode is active
}

type UploadState = 'idle' | 'preparing' | 'cropping' | 'uploading' | 'complete' | 'error'

export function MediaPickerUploadTab({
	mediaType,
	enableCrop,
	cropAspects,
	isExternalContext,
	idTag: idTagProp,
	documentFileId,
	onUploadComplete,
	onCroppingChange
}: MediaPickerUploadTabProps) {
	const { t } = useTranslation()
	const { api: defaultApi } = useApi()
	const { getClientFor } = useApiContext()
	// 'required' already yields a stable registry client (or null), but memoized
	// for consistency with the other `getClientFor` call sites, whose fallbacks
	// do return a fresh client per call.
	const api = React.useMemo(
		() =>
			// Explicit: uploading into that tenant is a user-initiated action.
			(idTagProp
				? getClientFor(idTagProp, { auth: 'required', explicit: true })
				: defaultApi) || defaultApi,
		[idTagProp, defaultApi, getClientFor]
	)
	const abortControllerRef = useRef<AbortController | null>(null)
	const lastUploadedBlobRef = useRef<{ blob: globalThis.File | Blob; fileName?: string } | null>(
		null
	)

	// State
	const [uploadState, setUploadState] = useState<UploadState>('idle')
	const [progress, setProgress] = useState<number | undefined>(undefined)
	const [error, setError] = useState<string | null>(null)

	// Image cropping state
	const [cropImageSrc, setCropImageSrc] = useState<string | null>(null)
	const [originalFile, setOriginalFile] = useState<globalThis.File | null>(null)

	// Visibility state: default to 'P' (Public) for external context, 'F' (Followers) otherwise
	const [visibility, setVisibility] = useState<Visibility>(isExternalContext ? 'P' : 'F')

	// Notify parent when cropping state changes
	useEffect(() => {
		onCroppingChange?.(uploadState === 'cropping')
	}, [uploadState, onCroppingChange])

	// Get accepted file types for input
	const getAcceptType = useCallback(() => {
		if (!mediaType) return '*/*'
		if (mediaType === 'image/*') return 'image/*,.svg' // Include SVG files
		if (mediaType === 'video/*') return 'video/*'
		if (mediaType === 'audio/*') return 'audio/*'
		if (mediaType === 'application/pdf') return '.pdf'
		return mediaType
	}, [mediaType])

	// Convert CropAspect to Aspect - provide defaults if none specified
	const getAspects = useCallback((): Aspect[] => {
		const aspects =
			cropAspects && cropAspects.length > 0 ? cropAspects : ['free', '16:9', '4:3', '1:1'] // Default aspects, free first
		return aspects.map((a) => {
			if (a === 'free') return ''
			return a as Aspect
		})
	}, [cropAspects])

	// Handle file selection
	const handleFileSelect = useCallback(
		async (file: globalThis.File) => {
			setError(null)

			// Check if we should show crop dialog for images
			const isImage = file.type.startsWith('image/')
			// SVG files should NOT be cropped (they're vector graphics that scale perfectly)
			const isSvg = file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')

			if (isImage && enableCrop && !isSvg) {
				// Read file as data URL for cropping (only for raster images)
				setUploadState('preparing')
				const reader = new FileReader()
				reader.onload = (e) => {
					setCropImageSrc(e.target?.result as string)
					setOriginalFile(file)
					setUploadState('cropping')
				}
				reader.onerror = () => {
					setError(t('Failed to read file'))
					setUploadState('error')
				}
				reader.readAsDataURL(file)
				return
			}

			// Upload directly (including SVG files)
			await uploadFile(file)
		},
		[enableCrop, t]
	)

	// Upload file to server
	const uploadFile = useCallback(
		async (file: globalThis.File | Blob, fileName?: string) => {
			if (!api) {
				setError(t('Not connected'))
				setUploadState('error')
				return
			}

			setUploadState('uploading')
			setProgress(undefined)
			lastUploadedBlobRef.current = { blob: file, fileName }

			abortControllerRef.current?.abort()
			const abortController = new AbortController()
			abortControllerRef.current = abortController

			try {
				const name =
					fileName || (file instanceof globalThis.File ? file.name : 'upload.jpg')
				const contentType = file.type || 'application/octet-stream'

				// Upload using API
				const result = await api.files.uploadBlob('media', name, file, contentType, {
					...(documentFileId ? { rootId: documentFileId } : {}),
					onProgress: setProgress,
					signal: abortController.signal
				})

				if (result?.fileId) {
					// Apply visibility setting to the uploaded file
					await api.files.update(result.fileId, { visibility })

					setUploadState('complete')
					onUploadComplete({
						fileId: result.fileId,
						fileName: name,
						contentType: contentType,
						dim: result.dim,
						visibility: visibility
					})
				} else {
					throw new Error('No file ID returned')
				}
			} catch (err) {
				if (err instanceof DOMException && err.name === 'AbortError') {
					if (abortControllerRef.current === abortController) {
						setUploadState('idle')
						setProgress(undefined)
						abortControllerRef.current = null
					}
					return
				}
				console.error('Upload failed:', err)
				if (abortControllerRef.current === abortController) {
					setError(getUploadErrorMessage(t, err))
					setUploadState('error')
				}
			} finally {
				if (abortControllerRef.current === abortController) {
					abortControllerRef.current = null
				}
			}
		},
		[api, onUploadComplete, t, visibility, documentFileId]
	)

	const handleCancelUpload = useCallback(() => {
		abortControllerRef.current?.abort()
	}, [])

	const handleRetryUpload = useCallback(() => {
		const last = lastUploadedBlobRef.current
		if (!last) return
		setError(null)
		uploadFile(last.blob, last.fileName)
	}, [uploadFile])

	// Handle crop complete
	const handleCropComplete = useCallback(
		async (blob: Blob) => {
			setCropImageSrc(null)
			await uploadFile(blob, originalFile?.name)
			setOriginalFile(null)
		},
		[originalFile, uploadFile]
	)

	// Handle crop cancel
	const handleCropCancel = useCallback(() => {
		setCropImageSrc(null)
		setOriginalFile(null)
		setUploadState('idle')
	}, [])

	// Reset state
	const handleReset = useCallback(() => {
		abortControllerRef.current?.abort()
		abortControllerRef.current = null
		lastUploadedBlobRef.current = null
		setUploadState('idle')
		setProgress(undefined)
		setError(null)
		setCropImageSrc(null)
		setOriginalFile(null)
	}, [])

	// Show cropping dialog
	if ((uploadState === 'cropping' || uploadState === 'uploading') && cropImageSrc) {
		return (
			<ImageUpload
				src={cropImageSrc}
				aspects={getAspects()}
				onSubmit={handleCropComplete}
				onCancel={handleCropCancel}
				onRetry={handleRetryUpload}
				embedded
				allowXd
				isUploading={uploadState === 'uploading'}
				uploadProgress={progress}
				uploadError={error ?? undefined}
				onAbort={handleCancelUpload}
			/>
		)
	}

	// Check if non-public visibility is selected in external context
	const showNonPublicWarning = isExternalContext && visibility !== 'P'

	return (
		<VBox gap={3} fill>
			{isExternalContext && uploadState === 'idle' && !showNonPublicWarning && (
				<Alert color="info" compact>
					{t('Public visibility ensures all document viewers can see this file.')}
				</Alert>
			)}

			{showNonPublicWarning && uploadState === 'idle' && (
				<Alert color="warning" compact>
					{t('Only public files can be embedded. Some viewers may not see this file.')}
				</Alert>
			)}

			{uploadState === 'idle' && (
				<>
					<Field label={t('Visibility')} orientation="horizontal" size="sm">
						<VisibilitySelect
							value={visibility}
							onChange={(v) => setVisibility(v as Visibility)}
							options={PERSONAL_VISIBILITY}
						/>
					</Field>
					<DropZone
						variant="area"
						multiple={false}
						accept={getAcceptType()}
						onFiles={(files) => {
							if (files[0]) handleFileSelect(files[0])
						}}
						title={t('Drag and drop a file here')}
						hint={t('or click to browse')}
					/>
				</>
			)}

			{uploadState === 'preparing' && (
				<VBox gap={2}>
					<Text>{t('Preparing image...')}</Text>
					<Progress indeterminate />
				</VBox>
			)}

			{uploadState === 'uploading' && !cropImageSrc && (
				<VBox gap={2}>
					<Text>
						{t('Uploading...')}
						{progress !== undefined ? ` ${progress}%` : ''}
					</Text>
					{progress === undefined ? (
						<Progress indeterminate />
					) : (
						<Progress value={progress} />
					)}
					<ActionBar>
						<Button onClick={handleCancelUpload}>{t('Cancel')}</Button>
					</ActionBar>
				</VBox>
			)}

			{uploadState === 'complete' && (
				<EmptyState
					color="success"
					icon={<IcCheck />}
					title={t('Upload complete')}
					description={t('Click Select to use this file')}
					actions={<Button onClick={handleReset}>{t('Upload another')}</Button>}
				/>
			)}

			{uploadState === 'error' && (
				<EmptyState
					color="error"
					icon={<IcClose />}
					title={error || t('Upload failed')}
					actions={
						<>
							<Button color="primary" onClick={handleRetryUpload}>
								{t('Retry')}
							</Button>
							<Button onClick={handleReset}>{t('Try again')}</Button>
						</>
					}
				/>
			)}
		</VBox>
	)
}

// vim: ts=4
