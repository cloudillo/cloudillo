// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
/**
 * DocumentPicker Component
 *
 * A modal dialog for selecting documents to embed.
 * Used by:
 * - External apps via message bus (doc:pick.req)
 * - Internal shell components via useDocumentPicker hook
 */

import { useState, useEffect, useCallback } from 'react'
import { useAtom, useSetAtom } from 'jotai'
import { useTranslation } from 'react-i18next'
import { createPortal } from 'react-dom'

import { LuX as IcClose, LuFileText as IcDocument } from 'react-icons/lu'

import { Button, useEscapeKey, useBodyScrollLock } from '@cloudillo/react'

import {
	docPickerAtom,
	openDocPickerAtom,
	closeDocPickerAtom,
	type DocPickerResult
} from '../../context/doc-picker-atom.js'
import { setDocPickerCallback } from '../../message-bus/handlers/document.js'

import { DocumentPickerBrowseTab } from './DocumentPickerBrowseTab.js'

import './document-picker.css'

export function DocumentPicker() {
	const { t } = useTranslation()
	const [state] = useAtom(docPickerAtom)
	const closeDocPicker = useSetAtom(closeDocPickerAtom)

	// Selection state
	const [selectedFile, setSelectedFile] = useState<DocPickerResult | null>(null)

	// Close handlers
	useEscapeKey(() => handleCancel(), state.isOpen)
	useBodyScrollLock(state.isOpen)

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

	const content = (
		<div className="c-modal show doc-picker-overlay" onClick={handleCancel}>
			<div className="c-panel emph p-0 doc-picker" onClick={(e) => e.stopPropagation()}>
				{/* Header */}
				<div className="doc-picker-header">
					<div className="c-hbox g-2 align-items-center">
						<IcDocument />
						<h3 className="m-0">{title}</h3>
					</div>
					<button
						type="button"
						className="c-link secondary"
						onClick={handleCancel}
						aria-label={t('Close')}
					>
						<IcClose />
					</button>
				</div>

				{/* Content */}
				<div className="doc-picker-content">
					<DocumentPickerBrowseTab
						fileTp={state.options?.fileTp}
						contentType={state.options?.contentType}
						sourceFileId={state.options?.sourceFileId}
						idTag={state.options?.idTag}
						selectedFile={selectedFile}
						onSelect={handleFileSelected}
						onDoubleClick={handleDoubleClick}
					/>
				</div>

				{/* Footer */}
				<div className="doc-picker-footer">
					<Button onClick={handleCancel}>{t('Cancel')}</Button>
					<Button primary disabled={!selectedFile} onClick={handleSelect}>
						{t('Select')}
					</Button>
				</div>
			</div>
		</div>
	)

	return createPortal(content, document.body)
}

// vim: ts=4
