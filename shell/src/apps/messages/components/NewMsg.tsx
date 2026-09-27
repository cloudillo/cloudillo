// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import {
	Button,
	FileButton,
	HBox,
	Panel,
	Progress,
	RichTextInput,
	Text,
	useApi,
	useAuth
} from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuImage as IcImage, LuSendHorizontal as IcSend } from 'react-icons/lu'

import { AttachmentPreview } from '../../../components/AttachmentPreview.js'
import { useImageUpload } from '../../../hooks/useImageUpload.js'
import { ImageUpload } from '../../../image.js'

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

	const imageUpload = useImageUpload()

	function onFiles([file]: File[]) {
		if (!file) return
		if (file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')) {
			// SVGs upload directly — no crop step for vector graphics.
			imageUpload.uploadSvg(file)
		} else {
			imageUpload.selectFile(file)
		}
	}

	function onCancelCrop() {
		imageUpload.cancelCrop()
		imageUpload.clearUploadError()
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
			// Re-seat the contentEditable caret (see RichTextInput autoFocus)
			setTimeout(function () {
				editorRef.current?.blur()
				editorRef.current?.focus()
			}, 0)
		}
	}

	return (
		<>
			<Panel className={className} style={style}>
				<RichTextInput
					ref={editorRef}
					value={content}
					onChange={setContent}
					onSubmit={doSubmit}
					submitKey="enter"
					autoFocus
					aria-label={t('Message')}
					actions={
						<>
							<FileButton
								color="secondary"
								icon={<IcImage />}
								aria-label={t('Add image')}
								accept="image/*,.svg"
								onFiles={onFiles}
							/>
							<Button
								color="primary"
								icon={<IcSend />}
								aria-label={t('Send')}
								onClick={doSubmit}
							/>
						</>
					}
				/>
				{auth?.idTag && (
					<AttachmentPreview
						attachmentIds={imageUpload.attachmentIds}
						idTag={auth.idTag}
						onRemove={imageUpload.removeAttachment}
						compact
					/>
				)}
			</Panel>
			{imageUpload.isPreparing && !imageUpload.attachment && (
				<HBox gap={2} align="center" padding={2}>
					<Progress indeterminate className="flex-fill" />
					<Text size="sm">{t('Preparing image...')}</Text>
				</HBox>
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
