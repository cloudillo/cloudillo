// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * DocumentPicker Component
 *
 * A modal dialog for selecting documents to embed.
 * Used by:
 * - External apps via message bus (doc:pick.req)
 * - Internal shell components via useDocumentPicker hook
 */

import { ActionBar, Button, Dialog, useToast } from '@cloudillo/react'
import { useAtom, useSetAtom } from 'jotai'
import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LuFileText as IcDocument } from 'react-icons/lu'

import {
	closeDocPickerAtom,
	type DocPickerResult,
	docPickerAtom,
	openDocPickerAtom
} from '../../context/doc-picker-atom.js'
import { setDocPickerCallback, setDocPickerNotifier } from '../../message-bus/handlers/document.js'
import { DocumentPickerBrowseTab } from './DocumentPickerBrowseTab.js'

export function DocumentPicker() {
	const { t } = useTranslation()
	const { error: toastError } = useToast()
	const [state] = useAtom(docPickerAtom)
	const closeDocPicker = useSetAtom(closeDocPickerAtom)

	// Selection state
	const [selectedFile, setSelectedFile] = useState<DocPickerResult | null>(null)

	// Get the atom setter for external app requests
	const openPicker = useSetAtom(openDocPickerAtom)

	// Register callback for external app requests
	useEffect(() => {
		setDocPickerCallback((options, onResult) => {
			openPicker({
				options,
				onResult
			})
		})

		return () => {
			setDocPickerCallback(null)
		}
	}, [openPicker])

	// The share grant that follows a pick runs after the dialog has closed, so
	// the handler needs a way back to the user for its failures.
	useEffect(() => {
		setDocPickerNotifier((notice) =>
			toastError(
				notice === 'share-denied'
					? t(
							'You do not have permission to share this file, so the embed may not be readable by others.'
						)
					: t(
							'The embed was inserted, but access could not be granted — it may not be readable by others.'
						)
			)
		)
		return () => {
			setDocPickerNotifier(null)
		}
	}, [toastError, t])

	// Reset state when opening
	useEffect(() => {
		if (state.isOpen) {
			setSelectedFile(null)
		}
	}, [state.isOpen])

	const handleCancel = useCallback(() => {
		closeDocPicker(null)
	}, [closeDocPicker])

	const handleSelect = useCallback(() => {
		if (selectedFile) {
			closeDocPicker(selectedFile)
		}
	}, [selectedFile, closeDocPicker])

	const handleFileSelected = useCallback((file: DocPickerResult) => {
		setSelectedFile(file)
	}, [])

	const handleDoubleClick = useCallback(
		(file: DocPickerResult) => {
			closeDocPicker(file)
		},
		[closeDocPicker]
	)

	if (!state.isOpen) return null

	const title = state.options?.title || t('Select document')

	return (
		<Dialog
			open
			onClose={handleCancel}
			size="lg"
			icon={<IcDocument />}
			title={title}
			footer={
				<ActionBar>
					<Button onClick={handleCancel}>{t('Cancel')}</Button>
					<Button color="primary" disabled={!selectedFile} onClick={handleSelect}>
						{t('Select')}
					</Button>
				</ActionBar>
			}
		>
			<DocumentPickerBrowseTab
				fileTp={state.options?.fileTp}
				contentType={state.options?.contentType}
				sourceFileId={state.options?.sourceFileId}
				requirePublic={state.options?.requirePublic}
				idTag={state.options?.idTag}
				selectedFile={selectedFile}
				onSelect={handleFileSelected}
				onDoubleClick={handleDoubleClick}
			/>
		</Dialog>
	)
}

// vim: ts=4
