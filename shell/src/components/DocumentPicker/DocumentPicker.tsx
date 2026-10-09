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

import { ActionBar, Button, Dialog, Text, useToast } from '@cloudillo/react'
import { useAtom, useSetAtom } from 'jotai'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LuFileText as IcDocument } from 'react-icons/lu'
import { useNavigate } from 'react-router-dom'

import {
	closeDocPickerAtom,
	type DocPickerResult,
	docPickerAtom,
	openDocPickerAtom
} from '../../context/doc-picker-atom.js'
import {
	setDocGrantConfirm,
	setDocLinkConfirm,
	setDocOpenCallback,
	setDocPickerCallback,
	setDocPickerNotifier
} from '../../message-bus/handlers/document.js'
import { DocumentPickerBrowseTab } from './DocumentPickerBrowseTab.js'

export function DocumentPicker() {
	const { t } = useTranslation()
	const { error: toastError } = useToast()
	const [state] = useAtom(docPickerAtom)
	const closeDocPicker = useSetAtom(closeDocPickerAtom)
	const navigate = useNavigate()

	// Selection state
	const [selectedFile, setSelectedFile] = useState<DocPickerResult | null>(null)
	// A non-public pick awaiting the permission disclosure
	const [pendingFile, setPendingFile] = useState<DocPickerResult | null>(null)
	// The paste path (doc:link.req) asking for the same disclosure, or doc:grant.req
	// asking before an embed is made editable from the host
	const [linkConfirm, setLinkConfirm] = useState<{ fileName: string; host?: string } | null>(null)
	// Its resolver: a superseded or unmounted confirm answers `false` rather than leaking
	const linkResolveRef = useRef<((ok: boolean) => void) | null>(null)

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
		const messages = {
			'share-denied': t(
				'You do not have permission to share this file, so the embed may not be readable by others.'
			),
			'share-failed': t(
				'The embed was inserted, but access could not be granted — it may not be readable by others.'
			),
			'link-foreign': t('Only documents from this context can be embedded.'),
			'link-failed': t('The linked document could not be embedded.'),
			'link-not-embeddable': t("This kind of document can't be embedded."),
			'link-read-only': t("You can't add embeds to this document.")
		}
		setDocPickerNotifier((notice) => toastError(messages[notice]))
		return () => {
			setDocPickerNotifier(null)
		}
	}, [toastError, t])

	useEffect(() => {
		// `host` set: a grant (doc:grant.req) naming the document it is made editable from
		const ask = (fileName: string, host?: string) =>
			new Promise<boolean>((resolve) => {
				linkResolveRef.current?.(false)
				linkResolveRef.current = resolve
				setLinkConfirm({ fileName, host })
			})
		setDocLinkConfirm((fileName) => ask(fileName))
		setDocGrantConfirm((fileName, hostName) => ask(fileName, hostName))
		return () => {
			setDocLinkConfirm(null)
			setDocGrantConfirm(null)
			linkResolveRef.current?.(false)
			linkResolveRef.current = null
		}
	}, [])

	// An app's "Open source" (doc:open.push) navigates the shell
	useEffect(() => {
		setDocOpenCallback((path) => navigate(path))
		return () => {
			setDocOpenCallback(null)
		}
	}, [navigate])

	// Reset state when opening
	useEffect(() => {
		if (state.isOpen) {
			setSelectedFile(null)
			setPendingFile(null)
		}
	}, [state.isOpen])

	const handleCancel = useCallback(() => {
		closeDocPicker(null)
	}, [closeDocPicker])

	// Embedding grants the host document's readers access to the WHOLE file — say so
	// before a non-public one is handed back.
	const choose = useCallback(
		(file: DocPickerResult) => {
			if (state.options?.sourceFileId && file.visibility !== 'P') {
				setPendingFile(file)
			} else {
				closeDocPicker(file)
			}
		},
		[state.options?.sourceFileId, closeDocPicker]
	)

	const handleSelect = useCallback(() => {
		if (selectedFile) choose(selectedFile)
	}, [selectedFile, choose])

	const handleFileSelected = useCallback((file: DocPickerResult) => {
		setSelectedFile(file)
	}, [])

	const answerLink = (ok: boolean) => {
		linkResolveRef.current?.(ok)
		linkResolveRef.current = null
		setLinkConfirm(null)
	}

	const disclosure = (fileName: string) =>
		t(
			'People who can see this document will be able to open all of "{{name}}", not only the part you embed.',
			{ name: fileName }
		)

	if (linkConfirm) {
		const action = linkConfirm.host !== undefined ? t('Allow editing') : t('Embed')
		return (
			<Dialog
				open
				onClose={() => answerLink(false)}
				size="sm"
				icon={<IcDocument />}
				title={action}
				footer={
					<ActionBar>
						<Button onClick={() => answerLink(false)}>{t('Cancel')}</Button>
						<Button onClick={() => answerLink(true)}>{action}</Button>
					</ActionBar>
				}
			>
				<Text as="p">
					{linkConfirm.host !== undefined
						? t('Allow editing “{{name}}” from “{{host}}”?', {
								name: linkConfirm.fileName,
								host: linkConfirm.host
							})
						: disclosure(linkConfirm.fileName)}
				</Text>
			</Dialog>
		)
	}

	if (!state.isOpen) return null

	const title = state.options?.title || t('Select document')

	if (pendingFile) {
		return (
			<Dialog
				open
				onClose={handleCancel}
				size="lg"
				icon={<IcDocument />}
				title={title}
				footer={
					<ActionBar>
						<Button onClick={() => setPendingFile(null)}>{t('Cancel')}</Button>
						<Button onClick={() => closeDocPicker(pendingFile)}>{t('Embed')}</Button>
					</ActionBar>
				}
			>
				<Text as="p">{disclosure(pendingFile.fileName)}</Text>
			</Dialog>
		)
	}

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
				embeddableOnly={state.options?.embeddableOnly}
				idTag={state.options?.idTag}
				selectedFile={selectedFile}
				onSelect={handleFileSelected}
				onDoubleClick={choose}
			/>
		</Dialog>
	)
}

// vim: ts=4
