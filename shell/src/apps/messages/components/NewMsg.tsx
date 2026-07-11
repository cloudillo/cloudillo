// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { generateFragments, mergeClasses, Progress, useApi, useAuth } from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuImage as IcImage, LuSendHorizontal as IcSend } from 'react-icons/lu'
import { type Position, useEditable } from 'use-editable'

import { AttachmentPreview } from '../../../components/AttachmentPreview.js'
import { useImageUpload } from '../../../hooks/useImageUpload.js'
import { ImageUpload } from '../../../image.js'
import { handleEditablePaste } from '../../../utils/editablePaste.js'

export interface SendInput {
	content: string
	attachmentIds: string[]
}

// New Msg composer. `onSend` performs the optimistic insert + network create +
// reconciliation (owned by `useMessages`) and resolves `true` on success so the
// composer clears its content/attachments only then (failed sends keep the text).
export function NewMsg({
	className,
	style,
	onSend
}: {
	className?: string
	style?: React.CSSProperties
	onSend: (input: SendInput) => Promise<boolean>
}) {
	const { t } = useTranslation()
	const { api } = useApi()
	const [auth] = useAuth()
	const [content, setContent] = React.useState('')
	const editorRef = React.useRef<HTMLDivElement>(null)
	const imgInputRef = React.useRef<HTMLInputElement>(null)
	const imgInputId = React.useId()

	const imageUpload = useImageUpload()

	const edit = useEditable(editorRef, onChange)

	// Re-seat the use-editable contentEditable caret on open: a freshly mounted
	// contentEditable can land with a detached/zero-width selection, so a blur/focus
	// round-trip restores a working caret while leaving the composer focused. Deferred one
	// frame past layout (0ms), matching the identical round-trip in doSubmit.
	React.useEffect(() => {
		setTimeout(function () {
			editorRef.current?.blur()
			editorRef.current?.focus()
		}, 0)
	}, [])

	function onChange(text: string, _pos: Position) {
		setContent(text)
	}

	function onFileChange() {
		const file = imgInputRef.current?.files?.[0]
		if (file) {
			if (file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')) {
				// SVGs upload directly — no crop step for vector graphics.
				imageUpload.uploadSvg(file)
			} else {
				imageUpload.selectFile(file)
			}
			if (imgInputRef.current) imgInputRef.current.value = ''
		}
	}

	function onCancelCrop() {
		imageUpload.cancelCrop()
		imageUpload.clearUploadError()
		if (imgInputRef.current) imgInputRef.current.value = ''
	}

	async function doSubmit() {
		const hasText = !!content.trim()
		const hasAttachments = imageUpload.attachmentIds.length > 0
		if (!api || !auth?.idTag || (!hasText && !hasAttachments)) return
		const ok = await onSend({
			content: content.trim(),
			attachmentIds: imageUpload.attachmentIds
		})
		if (ok) {
			setContent('')
			imageUpload.reset()
			setTimeout(function () {
				editorRef.current?.blur()
				editorRef.current?.focus()
			}, 0)
		}
	}

	function onKeyDown(e: React.KeyboardEvent) {
		if (!e.shiftKey && e.key == 'Enter') {
			e.preventDefault()
			doSubmit()
		}
	}

	return (
		<>
			<div className={mergeClasses('c-panel', className)}>
				<div className="h-100" style={style}>
					<div className="c-input-group">
						<label htmlFor={imgInputId} className="c-button secondary align-self-start">
							<IcImage />
						</label>
						<input
							ref={imgInputRef}
							id={imgInputId}
							type="file"
							accept="image/*,.svg"
							style={{ display: 'none' }}
							onChange={onFileChange}
						/>
						<div
							ref={editorRef}
							className="c-input flex-fill"
							tabIndex={0}
							onKeyDown={onKeyDown}
							onPasteCapture={(e) => handleEditablePaste(e, edit, content)}
						>
							{generateFragments(content).map((n, i) => (
								<React.Fragment key={i}>{n}</React.Fragment>
							))}
						</div>
						<button
							className="c-button primary align-self-end"
							aria-label={t('Send')}
							onClick={doSubmit}
						>
							<IcSend />
						</button>
					</div>
					{auth?.idTag && (
						<AttachmentPreview
							attachmentIds={imageUpload.attachmentIds}
							idTag={auth.idTag}
							onRemove={imageUpload.removeAttachment}
							compact
						/>
					)}
				</div>
			</div>
			{imageUpload.isPreparing && !imageUpload.attachment && (
				<div className="c-hbox g-2 align-items-center p-2">
					<Progress indeterminate className="flex-fill" />
					<span className="text-sm">{t('Preparing image...')}</span>
				</div>
			)}
			{imageUpload.attachment && (
				<ImageUpload
					src={imageUpload.attachment}
					aspects={['', '4:1', '3:1', '2:1', '16:9', '3:2', '1:1']}
					onSubmit={imageUpload.uploadAttachment}
					onCancel={onCancelCrop}
					onAbort={imageUpload.abortUpload}
					onRetry={imageUpload.retryUpload}
					isUploading={imageUpload.isUploading}
					uploadProgress={imageUpload.uploadProgress}
					uploadError={imageUpload.uploadError}
					allowXd
				/>
			)}
		</>
	)
}

// vim: ts=4
