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
 * MediaPickerUploadTab Component
 *
 * Upload tab for the media picker.
 * Allows users to upload new files with optional image cropping.
 */

import React, { useState, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'

import { LuUpload as IcUpload, LuX as IcClose, LuCheck as IcCheck } from 'react-icons/lu'

import { useApi, Button } from '@cloudillo/react'
import type { CropAspect } from '@cloudillo/base'

import { ImageUpload, type Aspect } from '../../image.js'
import type { MediaPickerResult } from '../../context/media-picker-atom.js'

interface MediaPickerUploadTabProps {
	mediaType?: string
	enableCrop?: boolean
	cropAspects?: CropAspect[]
	onUploadComplete: (file: MediaPickerResult) => void
}

type UploadState = 'idle' | 'uploading' | 'cropping' | 'complete' | 'error'

export function MediaPickerUploadTab({
	mediaType,
	enableCrop,
	cropAspects,
	onUploadComplete
}: MediaPickerUploadTabProps) {
	const { t } = useTranslation()
	const { api } = useApi()
	const fileInputRef = useRef<HTMLInputElement>(null)

	// State
	const [uploadState, setUploadState] = useState<UploadState>('idle')
	const [progress, setProgress] = useState(0)
	const [error, setError] = useState<string | null>(null)
	const [dragOver, setDragOver] = useState(false)

	// Image cropping state
	const [cropImageSrc, setCropImageSrc] = useState<string | null>(null)
	const [originalFile, setOriginalFile] = useState<globalThis.File | null>(null)

	// Get accepted file types for input
	const getAcceptType = useCallback(() => {
		if (!mediaType) return '*/*'
		if (mediaType === 'image/*') return 'image/*'
		if (mediaType === 'video/*') return 'video/*'
		if (mediaType === 'audio/*') return 'audio/*'
		if (mediaType === 'application/pdf') return '.pdf'
		return mediaType
	}, [mediaType])

	// Convert CropAspect to Aspect
	const getAspects = useCallback((): Aspect[] | undefined => {
		if (!cropAspects || cropAspects.length === 0) return undefined
		return cropAspects.map((a) => {
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
			if (isImage && enableCrop) {
				// Read file as data URL for cropping
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

			// Upload directly
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
			setProgress(0)

			try {
				const name =
					fileName || (file instanceof globalThis.File ? file.name : 'upload.jpg')
				const contentType = file.type || 'application/octet-stream'

				// Upload using API
				const result = await api.files.uploadBlob('media', name, file, contentType)

				if (result?.fileId) {
					setUploadState('complete')
					onUploadComplete({
						fileId: result.fileId,
						fileName: name,
						contentType: contentType,
						visibility: 'F' // Default visibility
					})
				} else {
					throw new Error('No file ID returned')
				}
			} catch (err) {
				console.error('Upload failed:', err)
				setError(t('Upload failed'))
				setUploadState('error')
			}
		},
		[api, onUploadComplete, t]
	)

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
		setUploadState('idle')
		setProgress(0)
		setError(null)
		setCropImageSrc(null)
		setOriginalFile(null)
	}, [])

	// Show cropping dialog
	if (uploadState === 'cropping' && cropImageSrc) {
		return (
			<ImageUpload
				src={cropImageSrc}
				aspects={getAspects()}
				onSubmit={handleCropComplete}
				onCancel={handleCropCancel}
			/>
		)
	}

	return (
		<div className="media-picker-upload">
			<input
				ref={fileInputRef}
				type="file"
				accept={getAcceptType()}
				style={{ display: 'none' }}
				onChange={handleInputChange}
			/>

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

			{uploadState === 'uploading' && (
				<div className="media-picker-upload-progress">
					<span>{t('Uploading...')}</span>
					<div className="media-picker-upload-progress-bar">
						<div
							className="media-picker-upload-progress-fill"
							style={{ width: `${progress}%` }}
						/>
					</div>
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
					<Button onClick={handleReset}>{t('Try again')}</Button>
				</div>
			)}
		</div>
	)
}

// vim: ts=4
