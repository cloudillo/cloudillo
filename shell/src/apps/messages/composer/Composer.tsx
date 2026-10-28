// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import {
	Alert,
	Button,
	FileButton,
	HBox,
	IcClose,
	IcEdit,
	IcFile,
	IcSend,
	Image,
	Panel,
	Popover,
	Progress,
	RichTextInput,
	type RichTextInputHandle,
	Text,
	VBox,
	VisuallyHidden
} from '@cloudillo/react'
import data from '@emoji-mart/data'
import Picker from '@emoji-mart/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import type { Profile } from '@cloudillo/types'

import { IcAttached, IcEmoji } from '../../../icons.js'
import { ImageUpload } from '../../../image.js'
import type { UseMessages } from '../hooks/useMessages.js'
import type { ActionEvt } from '../types.js'
import { clearDraft, loadDraft, saveDraft } from './drafts.js'
import {
	MentionPicker,
	mentionOptionId,
	mentionOptions,
	mentionQuery,
	selectMentionQuery
} from './MentionPicker.js'
import type { PendingAttachment, UseAttachments } from './useAttachments.js'

export interface ComposerProps {
	convId: string
	/** `useAttachments()`, owned by the host so the conversation-wide drop zone can feed it */
	attachments: UseAttachments
	replyTo?: ActionEvt
	editing?: ActionEvt
	/** Dismisses the reply / edit target */
	onClearTarget: () => void
	send: UseMessages['send']
	reply: UseMessages['reply']
	edit: UseMessages['edit']
	/** Group members offered by the `@` autocomplete (others than me); none in DMs */
	mentionMembers?: Profile[]
	/** Offer `@all` (moderator+) */
	canMentionAll?: boolean
	/** Called on each keystroke that leaves text (throttled PRES:TYPING) */
	onTyping?: () => void
}

export function Composer({
	convId,
	attachments,
	replyTo,
	editing,
	onClearTarget,
	send,
	reply,
	edit,
	mentionMembers,
	canMentionAll,
	onTyping
}: ComposerProps) {
	const { t, i18n } = useTranslation()
	const [content, setContent] = React.useState(() => loadDraft(convId))
	const [emojiOpen, setEmojiOpen] = React.useState(false)
	const [cropKey, setCropKey] = React.useState<string | undefined>()
	const editorRef = React.useRef<HTMLDivElement>(null)
	const editHandle = React.useRef<RichTextInputHandle>(null)
	const savedRangeRef = React.useRef<Range | null>(null)
	const convIdRef = React.useRef<string | undefined>(convId)
	convIdRef.current = convId
	const contentRef = React.useRef(content)
	contentRef.current = content
	const sendingRef = React.useRef(false)
	const hintId = React.useId()
	const reasonId = React.useId()
	const mentionListId = React.useId()
	const [mention, setMention] = React.useState<string | undefined>()
	const [mentionIdx, setMentionIdx] = React.useState(0)
	const { reset: resetAttachments } = attachments

	// An unmounted instance (conversation switch remounts us) must not touch host state
	React.useEffect(() => {
		convIdRef.current = convId
		return () => {
			convIdRef.current = undefined
		}
	}, [convId])

	// Conversation switch: load its draft, drop the other conversation's attachments.
	// Deps: on conversation switch only
	React.useEffect(() => {
		setContent(loadDraft(convId))
		resetAttachments()
		setCropKey(undefined)
	}, [convId])

	// Edit mode shows the message's text; leaving it brings the saved draft back (the
	// draft is never overwritten while editing).
	// Deps: on edit target change only
	React.useEffect(() => {
		setContent(editing ? (editing.content ?? '') : loadDraft(convId))
		if (editing) editorRef.current?.focus()
	}, [editing?.actionId])

	function onChange(value: string) {
		setContent(value)
		if (!editing) saveDraft(convId, value)
		if (!editing && value.trim()) onTyping?.()
	}

	// `@query` at the caret. Read after render: use-editable restores the caret then.
	function updateMention() {
		const q =
			mentionMembers && document.activeElement === editorRef.current
				? mentionQuery(editorRef.current)
				: undefined
		if (q === mention) return
		setMention(q)
		setMentionIdx(0)
	}
	// Deps: re-read on every text change
	React.useEffect(updateMention, [content])

	const mentionOpts =
		mention !== undefined && mentionMembers
			? mentionOptions(mentionMembers, mention, !!canMentionAll, t('Everyone in this group'))
			: []
	const mentionOpen = mentionOpts.length > 0

	function pickMention(idTag: string) {
		const editor = editorRef.current
		if (!editor) return
		editor.focus()
		selectMentionQuery(editor)
		editHandle.current?.insert(`@${idTag} `)
		setMention(undefined)
	}

	// Capture phase: while the picker is open its keys never reach the editor (Enter
	// would send) or the composer's Esc handler.
	function onMentionKeyCapture(evt: React.KeyboardEvent) {
		if (!mentionOpen) return
		const n = mentionOpts.length
		if (evt.key === 'ArrowDown') setMentionIdx((i) => (i + 1) % n)
		else if (evt.key === 'ArrowUp') setMentionIdx((i) => (i - 1 + n) % n)
		else if (evt.key === 'Enter' || evt.key === 'Tab')
			pickMention(mentionOpts[Math.min(mentionIdx, n - 1)].idTag)
		else if (evt.key === 'Escape') setMention(undefined)
		else return
		evt.preventDefault()
		evt.stopPropagation()
	}

	function refocus() {
		// Re-seat the contentEditable caret (see RichTextInput autoFocus)
		setTimeout(() => {
			editorRef.current?.blur()
			editorRef.current?.focus()
		}, 0)
	}

	async function doSubmit() {
		if (sendingRef.current) return
		const text = content.trim()
		const sentConv = convId
		if (editing) {
			if (!text) return
			sendingRef.current = true
			const ok = await edit(editing.actionId, text).catch(() => false)
			sendingRef.current = false
			// Success clears the target; the edit effect then restores the draft.
			if (ok && convIdRef.current === sentConv) onClearTarget()
			return
		}
		if (attachments.uploading || attachments.failed) return
		const attachmentIds = attachments.attachmentIds
		// Only the sent ones are cleared after; files added mid-send stay.
		const sentKeys = attachments.items.map((i) => i.key)
		if (!text && !attachmentIds.length) return
		const input = { content: text, attachmentIds, subType: attachments.subType }
		sendingRef.current = true
		// Clear optimistically, so text typed while the send is in flight survives it
		setContent('')
		clearDraft(sentConv)
		// A reject takes the `!ok` restore path instead of leaving the composer locked.
		const ok = await (replyTo ? reply(replyTo.actionId, input) : send(input)).catch(() => false)
		sendingRef.current = false
		if (!ok) {
			// Put the text back, unless something new was typed meanwhile
			if (convIdRef.current === sentConv) {
				if (!contentRef.current.trim()) {
					setContent(text)
					saveDraft(sentConv, text)
				}
			} else if (!loadDraft(sentConv)) saveDraft(sentConv, text)
			return
		}
		if (convIdRef.current !== sentConv) return
		for (const k of sentKeys) attachments.remove(k)
		onClearTarget()
		refocus()
	}

	function onKeyDown(evt: React.KeyboardEvent) {
		if (evt.key === 'Escape' && (editing || replyTo) && !emojiOpen && !cropKey) {
			evt.preventDefault()
			onClearTarget()
		}
	}

	// Files pasted into the input become attachments; text paste stays with RichTextInput.
	function onPasteCapture(evt: React.ClipboardEvent) {
		if (editing) return
		const files = Array.from(evt.clipboardData?.files ?? [])
		if (!files.length) return
		evt.preventDefault()
		evt.stopPropagation()
		attachments.add(files)
	}

	function captureEditorSelection() {
		const sel = window.getSelection()
		savedRangeRef.current =
			sel && sel.rangeCount > 0 && editorRef.current?.contains(sel.anchorNode)
				? sel.getRangeAt(0).cloneRange()
				: null
	}

	function handleEmojiSelect(emoji: { native: string }) {
		const editor = editorRef.current
		if (!editor) return
		editor.focus()
		const range = savedRangeRef.current
		const sel = window.getSelection()
		if (range && sel) {
			sel.removeAllRanges()
			sel.addRange(range)
		}
		editHandle.current?.insert(emoji.native)
		savedRangeRef.current = null
		setEmojiOpen(false)
		// The popover hands focus back to its trigger on close; the caret belongs in the editor
		requestAnimationFrame(() => editor.focus())
	}

	const blockedReason = editing
		? undefined
		: attachments.uploading
			? t('Waiting for uploads…')
			: attachments.failed
				? t('Remove or retry the failed upload.')
				: undefined
	const cropItem = cropKey ? attachments.items.find((i) => i.key === cropKey) : undefined

	return (
		<VBox onKeyDown={onKeyDown}>
			{(replyTo || editing) && (
				<Alert
					color="neutral"
					compact
					actions={
						<Button
							variant="ghost"
							size="sm"
							icon={<IcClose />}
							aria-label={t('Cancel')}
							onClick={onClearTarget}
						/>
					}
				>
					{editing
						? t('Editing message')
						: t('Replying to {{name}}', {
								name: replyTo?.issuer.name || replyTo?.issuer.idTag
							})}
				</Alert>
			)}
			{attachments.refusal && !editing && (
				<Alert color="warning" compact onDismiss={attachments.clearRefusal}>
					{attachments.refusal}
				</Alert>
			)}
			{mentionOpen && (
				<MentionPicker
					id={mentionListId}
					options={mentionOpts}
					activeIndex={Math.min(mentionIdx, mentionOpts.length - 1)}
					onPick={pickMention}
				/>
			)}
			<Panel>
				{!editing && attachments.items.length > 0 && (
					<HBox gap={2} wrap padding={1}>
						{attachments.items.map((it) => (
							<AttachmentChip
								key={it.key}
								item={it}
								onRemove={() => attachments.remove(it.key)}
								onRetry={() => attachments.retry(it.key)}
								onEdit={() => setCropKey(it.key)}
							/>
						))}
					</HBox>
				)}
				<VBox
					onPasteCapture={onPasteCapture}
					onKeyDownCapture={onMentionKeyCapture}
					onSelect={updateMention}
					onBlur={() => setMention(undefined)}
				>
					<RichTextInput
						ref={editorRef}
						editRef={editHandle}
						value={content}
						onChange={onChange}
						onSubmit={doSubmit}
						submitKey="enter"
						autoFocus
						aria-label={t('Message')}
						aria-describedby={hintId}
						aria-autocomplete={mentionMembers ? 'list' : undefined}
						aria-controls={mentionOpen ? mentionListId : undefined}
						aria-activedescendant={
							mentionOpen
								? mentionOptionId(
										mentionListId,
										Math.min(mentionIdx, mentionOpts.length - 1)
									)
								: undefined
						}
						actions={
							<>
								<Popover
									placement="top-end"
									open={emojiOpen}
									onOpenChange={setEmojiOpen}
									trigger={
										<Button
											variant="ghost"
											icon={<IcEmoji />}
											aria-label={t('Emoji')}
											onPointerDown={captureEditorSelection}
										/>
									}
								>
									<Picker
										data={data}
										onEmojiSelect={handleEmojiSelect}
										locale={i18n.language}
									/>
								</Popover>
								{!editing && (
									<FileButton
										variant="ghost"
										icon={<IcAttached />}
										aria-label={t('Add attachment')}
										multiple
										onFiles={attachments.add}
									/>
								)}
								<Button
									color="primary"
									icon={<IcSend />}
									aria-label={editing ? t('Save') : t('Send')}
									aria-describedby={blockedReason ? reasonId : undefined}
									disabled={!!blockedReason}
									onClick={doSubmit}
								/>
							</>
						}
					/>
				</VBox>
				<VisuallyHidden id={hintId}>
					{t('Enter to send, Shift+Enter for a new line')}
				</VisuallyHidden>
				{blockedReason && (
					<Text id={reasonId} size="sm" emphasis="muted" role="status" className="px-2">
						{blockedReason}
					</Text>
				)}
			</Panel>
			{cropItem?.previewUrl && (
				<ImageUpload
					src={cropItem.previewUrl}
					aspects={['', '4:1', '3:1', '2:1', '16:9', '3:2', '1:1']}
					onSubmit={(blob) => {
						attachments.replace(cropItem.key, blob)
						setCropKey(undefined)
					}}
					onCancel={() => setCropKey(undefined)}
					allowXd
				/>
			)}
		</VBox>
	)
}

function AttachmentChip({
	item,
	onRemove,
	onRetry,
	onEdit
}: {
	item: PendingAttachment
	onRemove: () => void
	onRetry: () => void
	onEdit: () => void
}) {
	const { t } = useTranslation()
	const canCrop = item.isImage && !item.name.toLowerCase().endsWith('.svg')
	return (
		<VBox gap={1} style={{ width: item.isImage ? '6rem' : '12rem' }}>
			{item.isImage ? (
				<Image
					src={item.previewUrl}
					alt={item.name}
					fit="cover"
					style={{ width: '6rem', height: '4.5rem' }}
				/>
			) : (
				<HBox gap={1} align="center">
					<IcFile aria-hidden />
					<Text size="sm" truncate>
						{item.name}
					</Text>
				</HBox>
			)}
			{item.uploading && (
				<Progress
					value={item.progress}
					indeterminate={item.progress === undefined}
					aria-label={t('Uploading {{name}}', { name: item.name })}
				/>
			)}
			{item.error && (
				<Text size="sm" color="error" role="alert">
					{item.error}
				</Text>
			)}
			<HBox gap={1}>
				{item.error && (
					<Button size="sm" variant="ghost" onClick={onRetry}>
						{t('Retry')}
					</Button>
				)}
				{canCrop && (
					<Button
						size="sm"
						variant="ghost"
						icon={<IcEdit />}
						aria-label={t('Edit {{name}}', { name: item.name })}
						onClick={onEdit}
					/>
				)}
				<Button
					size="sm"
					variant="ghost"
					icon={<IcClose />}
					aria-label={t('Remove {{name}}', { name: item.name })}
					onClick={onRemove}
				/>
			</HBox>
		</VBox>
	)
}

// vim: ts=4
