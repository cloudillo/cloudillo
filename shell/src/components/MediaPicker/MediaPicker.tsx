// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * MediaPicker Component
 *
 * A modal dialog for selecting or uploading media files.
 * Used by:
 * - External apps via message bus (media:pick.req)
 * - Internal shell components via useMediaPicker hook
 */

import { ActionBar, Button, Dialog, Tab, Tabs, VBox } from '@cloudillo/react'
import { useAtom, useSetAtom } from 'jotai'
import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
	LuMusic as IcAudio,
	LuFileText as IcDocument,
	LuFiles as IcFiles,
	LuImage as IcImage,
	LuVideo as IcVideo
} from 'react-icons/lu'

import {
	closeMediaPickerAtom,
	type MediaPickerResult,
	mediaPickerAtom,
	openMediaPickerAtom
} from '../../context/media-picker-atom.js'
import { setMediaPickerCallback } from '../../message-bus/handlers/media.js'
import { MediaPickerBrowseTab } from './MediaPickerBrowseTab.js'
import { MediaPickerUploadTab } from './MediaPickerUploadTab.js'

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
	const handleUploadComplete = useCallback(
		(file: MediaPickerResult) => {
			closeMediaPicker(file)
		},
		[closeMediaPicker]
	)

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

	return (
		<Dialog
			open
			onClose={handleCancel}
			size="lg"
			icon={getMediaTypeIcon(mediaType)}
			title={title}
			description={getMediaTypeLabel(t, mediaType)}
			footer={
				!isCropping && (
					<ActionBar>
						<Button onClick={handleCancel}>{t('Cancel')}</Button>
						<Button color="primary" disabled={!selectedFile} onClick={handleSelect}>
							{t('Select')}
						</Button>
					</ActionBar>
				)
			}
		>
			<VBox gap={2} fill>
				<Tabs value={activeTab} onTabChange={(v) => setActiveTab(v as TabType)}>
					<Tab value="browse">{t('Browse')}</Tab>
					<Tab value="upload">{t('Upload')}</Tab>
				</Tabs>
				{activeTab === 'browse' ? (
					<MediaPickerBrowseTab
						mediaType={mediaType}
						documentVisibility={state.options?.documentVisibility}
						documentFileId={state.options?.documentFileId}
						requirePublic={state.options?.requirePublic}
						isExternalContext={state.options?.isExternalContext}
						idTag={state.options?.idTag}
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
						idTag={state.options?.idTag}
						documentFileId={state.options?.documentFileId}
						onUploadComplete={handleUploadComplete}
						onCroppingChange={setIsCropping}
					/>
				)}
			</VBox>
		</Dialog>
	)
}

// vim: ts=4
