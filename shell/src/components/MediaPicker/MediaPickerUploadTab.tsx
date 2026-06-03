// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * MediaPickerUploadTab Component
 *
 * Upload tab for the media picker.
 * Allows users to upload new files with optional image cropping.
 */

import type { CropAspect, Visibility } from '@cloudillo/core'
import { Button, Progress, useApi } from '@cloudillo/react'
import type { TFunction } from 'i18next'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
	LuCheck as IcCheck,
	LuChevronDown as IcChevronDown,
	LuX as IcClose,
	LuUserCheck as IcConnected,
	LuUserPlus as IcFollowers,
	LuInfo as IcInfo,
	LuGlobe as IcPublic,
	LuUpload as IcUpload,
	LuTriangleAlert as IcWarning
} from 'react-icons/lu'

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

/**
 * Visibility options for the dropdown
 */
interface MediaPickerVisibilityOption {
	value: Visibility
	label: string
	icon: React.ComponentType<{ className?: string }>
}

const getVisibilityOptions = (t: TFunction): MediaPickerVisibilityOption[] => [
	{ value: 'P', label: t('Public'), icon: IcPublic },
	{ value: 'F', label: t('Followers'), icon: IcFollowers },
	{ value: 'C', label: t('Connected'), icon: IcConnected }
]

/**
 * Get visibility option by value
 */
function getVisibilityOption(t: TFunction, value: Visibility): MediaPickerVisibilityOption {
	const opts = getVisibilityOptions(t)
	return opts.find((opt) => opt.value === value) || opts[0]
}

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
	const api =
		(idTagProp ? getClientFor(idTagProp, { auth: 'required' }) : defaultApi) || defaultApi
	const fileInputRef = useRef<HTMLInputElement>(null)
	const abortControllerRef = useRef<AbortController | null>(null)
	const lastUploadedBlobRef = useRef<{ blob: globalThis.File | Blob; fileName?: string } | null>(
		null
	)

	// State
	const [uploadState, setUploadState] = useState<UploadState>('idle')
	const [progress, setProgress] = useState<number | undefined>(undefined)
	const [error, setError] = useState<string | null>(null)
	const [dragOver, setDragOver] = useState(false)

	// Image cropping state
	const [cropImageSrc, setCropImageSrc] = useState<string | null>(null)
	const [originalFile, setOriginalFile] = useState<globalThis.File | null>(null)

	// Visibility state: default to 'P' (Public) for external context, 'F' (Followers) otherwise
	const [visibility, setVisibility] = useState<Visibility>(isExternalContext ? 'P' : 'F')
	const [showVisibilityDropdown, setShowVisibilityDropdown] = useState(false)

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

	// Handle file input change
	const handleInputChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const file = e.target.files?.[0]
			if (file) {
				handleFileSelect(file)
			}
			// Reset input so same file can be selected again
			e.target.value = ''
		},
		[handleFileSelect]
	)

	// Handle drag and drop
	const handleDragOver = useCallback((e: React.DragEvent) => {
		e.preventDefault()
		setDragOver(true)
	}, [])

	const handleDragLeave = useCallback((e: React.DragEvent) => {
		e.preventDefault()
		setDragOver(false)
	}, [])

	const handleDrop = useCallback(
		(e: React.DragEvent) => {
			e.preventDefault()
			setDragOver(false)

			const file = e.dataTransfer.files?.[0]
			if (file) {
				handleFileSelect(file)
			}
		},
		[handleFileSelect]
	)

	// Handle click on dropzone
	const handleDropzoneClick = useCallback(() => {
		fileInputRef.current?.click()
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

	// Handle visibility change
	const handleVisibilityChange = useCallback((value: Visibility) => {
		setVisibility(value)
		setShowVisibilityDropdown(false)
	}, [])

	const visibilityOptions = React.useMemo(() => getVisibilityOptions(t), [t])

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

	const currentVisibilityOption = getVisibilityOption(t, visibility)
	const VisibilityIcon = currentVisibilityOption.icon

	// Check if non-public visibility is selected in external context
	const showNonPublicWarning = isExternalContext && visibility !== 'P'

	return (
		<div className="media-picker-upload">
			<input
				ref={fileInputRef}
				type="file"
				accept={getAcceptType()}
				style={{ display: 'none' }}
				onChange={handleInputChange}
			/>

			{/* Info banner for external context */}
			{isExternalContext && uploadState === 'idle' && !showNonPublicWarning && (
				<div className="media-picker-upload-info">
					<IcInfo />
					<span>
						{t('Public visibility ensures all document viewers can see this file.')}
					</span>
				</div>
			)}

			{/* Warning when non-public visibility selected in external context */}
			{showNonPublicWarning && uploadState === 'idle' && (
				<div className="media-picker-upload-warning">
					<IcWarning />
					<span>
						{t(
							'Only public files can be embedded. Some viewers may not see this file.'
						)}
					</span>
				</div>
			)}

			{/* Visibility selector */}
			{uploadState === 'idle' && (
				<div className="media-picker-upload-visibility">
					<label>{t('Visibility')}</label>
					<div className="media-picker-visibility-selector">
						<button
							type="button"
							className="c-button ghost small"
							onClick={() => setShowVisibilityDropdown(!showVisibilityDropdown)}
						>
							<VisibilityIcon />
							<span>{currentVisibilityOption.label}</span>
							<IcChevronDown />
						</button>
						{showVisibilityDropdown && (
							<div className="media-picker-visibility-dropdown">
								{visibilityOptions.map((opt) => {
									const OptionIcon = opt.icon
									return (
										<button
											key={opt.value}
											type="button"
											className={`media-picker-visibility-option ${visibility === opt.value ? 'active' : ''}`}
											onClick={() => handleVisibilityChange(opt.value)}
										>
											<OptionIcon />
											<span>{opt.label}</span>
										</button>
									)
								})}
							</div>
						)}
					</div>
				</div>
			)}

			{uploadState === 'idle' && (
				<div
					className={`media-picker-dropzone ${dragOver ? 'dragover' : ''}`}
					onClick={handleDropzoneClick}
					onDragOver={handleDragOver}
					onDragLeave={handleDragLeave}
					onDrop={handleDrop}
				>
					<IcUpload />
					<div className="media-picker-dropzone-text">
						<strong>{t('Drag and drop a file here')}</strong>
						<span>{t('or click to browse')}</span>
					</div>
				</div>
			)}

			{uploadState === 'preparing' && (
				<div className="media-picker-upload-progress">
					<span>{t('Preparing image...')}</span>
					<Progress indeterminate />
				</div>
			)}

			{uploadState === 'uploading' && !cropImageSrc && (
				<div className="media-picker-upload-progress">
					<span>
						{t('Uploading...')}
						{progress !== undefined ? ` ${progress}%` : ''}
					</span>
					{progress === undefined ? (
						<Progress indeterminate />
					) : (
						<Progress value={progress} />
					)}
					<Button onClick={handleCancelUpload}>{t('Cancel')}</Button>
				</div>
			)}

			{uploadState === 'complete' && (
				<div className="media-picker-dropzone">
					<IcCheck />
					<div className="media-picker-dropzone-text">
						<strong>{t('Upload complete')}</strong>
						<span>{t('Click Select to use this file')}</span>
					</div>
					<Button onClick={handleReset}>{t('Upload another')}</Button>
				</div>
			)}

			{uploadState === 'error' && (
				<div className="media-picker-dropzone">
					<IcClose />
					<div className="media-picker-dropzone-text">
						<strong>{error || t('Upload failed')}</strong>
					</div>
					<div className="c-hbox g-2">
						<Button variant="primary" onClick={handleRetryUpload}>
							{t('Retry')}
						</Button>
						<Button onClick={handleReset}>{t('Try again')}</Button>
					</div>
				</div>
			)}
		</div>
	)
}

// vim: ts=4
