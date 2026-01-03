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
 * MediaPicker Component
 *
 * A modal dialog for selecting or uploading media files.
 * Used by:
 * - External apps via message bus (media:pick.req)
 * - Internal shell components via useMediaPicker hook
 */

import React, { useState, useEffect, useCallback } from 'react'
import { useAtom, useSetAtom } from 'jotai'
import { useTranslation } from 'react-i18next'
import { createPortal } from 'react-dom'

import {
	LuX as IcClose,
	LuImage as IcImage,
	LuVideo as IcVideo,
	LuMusic as IcAudio,
	LuFileText as IcDocument,
	LuFiles as IcFiles
} from 'react-icons/lu'

import { Modal, Button, useEscapeKey, useBodyScrollLock } from '@cloudillo/react'

import {
	mediaPickerAtom,
	openMediaPickerAtom,
	closeMediaPickerAtom,
	type MediaPickerResult
} from '../../context/media-picker-atom.js'
import { setMediaPickerCallback } from '../../message-bus/handlers/media.js'

import { MediaPickerBrowseTab } from './MediaPickerBrowseTab.js'
import { MediaPickerUploadTab } from './MediaPickerUploadTab.js'

import './media-picker.css'

type TabType = 'browse' | 'upload'

/**
 * Get icon for media type filter
 */
function getMediaTypeIcon(mediaType?: string): React.ReactNode {
	if (!mediaType) return <IcFiles />
	if (mediaType.startsWith('image/')) return <IcImage />
	if (mediaType.startsWith('video/')) return <IcVideo />
	if (mediaType.startsWith('audio/')) return <IcAudio />
	if (mediaType === 'application/pdf') return <IcDocument />
	return <IcFiles />
}

/**
 * Get label for media type filter
 */
function getMediaTypeLabel(t: (key: string) => string, mediaType?: string): string {
	if (!mediaType) return t('All files')
	if (mediaType.startsWith('image/')) return t('Images')
	if (mediaType.startsWith('video/')) return t('Videos')
	if (mediaType.startsWith('audio/')) return t('Audio')
	if (mediaType === 'application/pdf') return t('PDF documents')
	return t('Files')
}

export function MediaPicker() {
	const { t } = useTranslation()
	const [state] = useAtom(mediaPickerAtom)
	const closeMediaPicker = useSetAtom(closeMediaPickerAtom)

	// Tab state
	const [activeTab, setActiveTab] = useState<TabType>('browse')

	// Selection state
	const [selectedFile, setSelectedFile] = useState<MediaPickerResult | null>(null)

	// Track when crop mode is active (to hide footer)
	const [isCropping, setIsCropping] = useState(false)

	// Close handlers
	useEscapeKey(() => handleCancel(), state.isOpen)
	useBodyScrollLock(state.isOpen)

	// Get the atom setter for external app requests
	const openPicker = useSetAtom(openMediaPickerAtom)

	// Register callback for external app requests
	useEffect(() => {
		setMediaPickerCallback((options, onResult) => {
			// Open the picker by updating the atom state
			openPicker({
				options,
				onResult
			})
		})

		return () => {
			setMediaPickerCallback(null)
		}
	}, [openPicker])

	// Reset state when opening
	useEffect(() => {
		if (state.isOpen) {
			setActiveTab('browse')
			setSelectedFile(null)
			setIsCropping(false)
		}
	}, [state.isOpen])

	const handleCancel = useCallback(() => {
		closeMediaPicker(null)
	}, [closeMediaPicker])

	const handleSelect = useCallback(() => {
		if (selectedFile) {
			closeMediaPicker(selectedFile)
		}
	}, [selectedFile, closeMediaPicker])

	const handleFileSelected = useCallback((file: MediaPickerResult) => {
		setSelectedFile(file)
	}, [])

	// Handle upload completion - close dialog and return result
	const handleUploadComplete = useCallback((file: MediaPickerResult) => {
		closeMediaPicker(file)
	}, [closeMediaPicker])

	const handleDoubleClick = useCallback(
		(file: MediaPickerResult) => {
			closeMediaPicker(file)
		},
		[closeMediaPicker]
	)

	if (!state.isOpen) return null

	const title = state.options?.title || t('Select media')
	const mediaType = state.options?.mediaType

	// Default enableCrop to true for images unless explicitly disabled
	const enableCrop =
		state.options?.enableCrop !== false && (!mediaType || mediaType.startsWith('image/'))

	const content = (
		<div className="c-modal show media-picker-overlay" onClick={handleCancel}>
			<div className="c-panel emph p-0 media-picker" onClick={(e) => e.stopPropagation()}>
				{/* Header */}
				<div className="media-picker-header">
					<div className="c-hbox g-2 align-items-center">
						{getMediaTypeIcon(mediaType)}
						<h3 className="m-0">{title}</h3>
						<span className="text-muted ms-2">{getMediaTypeLabel(t, mediaType)}</span>
					</div>
					<button
						type="button"
						className="c-button ghost"
						onClick={handleCancel}
						aria-label={t('Close')}
					>
						<IcClose />
					</button>
				</div>

				{/* Tabs */}
				<div className="c-tabs media-picker-tabs">
					<button
						type="button"
						className={`c-tab ${activeTab === 'browse' ? 'active' : ''}`}
						onClick={() => setActiveTab('browse')}
					>
						{t('Browse')}
					</button>
					<button
						type="button"
						className={`c-tab ${activeTab === 'upload' ? 'active' : ''}`}
						onClick={() => setActiveTab('upload')}
					>
						{t('Upload')}
					</button>
				</div>

				{/* Content */}
				<div className="media-picker-content">
					{activeTab === 'browse' ? (
						<MediaPickerBrowseTab
							mediaType={mediaType}
							documentVisibility={state.options?.documentVisibility}
							documentFileId={state.options?.documentFileId}
							isExternalContext={state.options?.isExternalContext}
							selectedFile={selectedFile}
							onSelect={handleFileSelected}
							onDoubleClick={handleDoubleClick}
						/>
					) : (
						<MediaPickerUploadTab
							mediaType={mediaType}
							enableCrop={enableCrop}
							cropAspects={state.options?.cropAspects}
							isExternalContext={state.options?.isExternalContext}
							onUploadComplete={handleUploadComplete}
							onCroppingChange={setIsCropping}
						/>
					)}
				</div>

				{/* Footer - hidden during crop mode */}
				{!isCropping && (
					<div className="media-picker-footer">
						<Button onClick={handleCancel}>{t('Cancel')}</Button>
						<Button primary disabled={!selectedFile} onClick={handleSelect}>
							{t('Select')}
						</Button>
					</div>
				)}
			</div>
		</div>
	)

	return createPortal(content, document.body)
}

// vim: ts=4
