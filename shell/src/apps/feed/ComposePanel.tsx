// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { createPortal } from 'react-dom'
import { useEditable, type Position } from 'use-editable'
import { useTranslation } from 'react-i18next'
import { usePopper } from 'react-popper'
import data from '@emoji-mart/data'
import Picker from '@emoji-mart/react'

import {
	LuSendHorizontal as IcSend,
	LuImage as IcImage,
	LuCamera as IcCamera,
	LuVideo as IcVideo,
	LuListChecks as IcPoll,
	LuCalendarDays as IcEvent,
	LuSmile as IcSmile,
	LuSave as IcSave,
	LuCalendarClock as IcSchedule,
	LuX as IcClose
} from 'react-icons/lu'

import type { NewAction, ActionView } from '@cloudillo/types'
import {
	useAuth,
	useApi,
	useDialog,
	Button,
	ProfilePicture,
	mergeClasses,
	generateFragments
} from '@cloudillo/react'

import { ImageUpload } from '../../image.js'
import { useImageUpload, type AttachmentType } from '../../hooks/useImageUpload.js'
import { AttachmentPreview } from '../../components/AttachmentPreview.js'
import { VisibilitySelector, type Visibility } from './VisibilitySelector.js'
import { SchedulePicker } from './SchedulePicker.js'

export interface ComposePanelProps {
	open: boolean
	onClose: () => void
	onSubmit?: (action: ActionView) => void
	idTag?: string
	initialMedia?: 'image' | 'camera' | 'video'
	draft?: ActionView
	className?: string
}

type SaveStatus = undefined | 'saving' | 'saved'

function inferAttachmentType(subType?: string): AttachmentType {
	switch (subType) {
		case 'VIDEO':
			return 'video'
		case 'DOC':
			return 'document'
		case 'IMG':
			return 'image'
		default:
			return undefined
	}
}

export function ComposePanel({
	open,
	onClose,
	onSubmit,
	idTag,
	initialMedia,
	draft,
	className
}: ComposePanelProps) {
	const { t, i18n } = useTranslation()
	const { api } = useApi()
	const [auth] = useAuth()
	const dialog = useDialog()
	const [content, setContent] = React.useState('')
	const [visibility, setVisibility] = React.useState<Visibility>('F')
	const [scheduleDate, setScheduleDate] = React.useState<Date | undefined>()
	const [showSchedule, setShowSchedule] = React.useState(false)
	const [saveStatus, setSaveStatus] = React.useState<SaveStatus>(undefined)
	const editorRef = React.useRef<HTMLDivElement>(null)
	const fileInputRef = React.useRef<HTMLInputElement>(null)
	const imgInputRef = React.useRef<HTMLInputElement>(null)
	const videoInputRef = React.useRef<HTMLInputElement>(null)
	const fileInputId = React.useId()
	const imgInputId = React.useId()
	const videoInputId = React.useId()
	const initialMediaTriggered = React.useRef(false)
	const draftIdRef = React.useRef<string | undefined>(draft?.actionId)
	const saveTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
	const savedFadeRef = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
	const submittingRef = React.useRef(false)

	const imageUpload = useImageUpload()
	const attachmentIdsKey = imageUpload.attachmentIds.join(',')

	const isEditingScheduled = draft?.status === 'S'

	const [emojiPickerOpen, setEmojiPickerOpen] = React.useState(false)
	const [emojiRefEl, setEmojiRefEl] = React.useState<HTMLElement | null>(null)
	const [emojiPopperEl, setEmojiPopperEl] = React.useState<HTMLElement | null>(null)
	const savedPosRef = React.useRef(0)
	const { styles: emojiPopperStyles, attributes: emojiAttributes } = usePopper(
		emojiRefEl,
		emojiPopperEl,
		{ placement: 'top-end', strategy: 'fixed' }
	)

	function onChange(text: string, pos: Position) {
		setContent(text)
		savedPosRef.current = pos.position
	}

	const edit = useEditable(editorRef, onChange, { disabled: !open })

	// Pre-fill from draft when editing
	React.useEffect(() => {
		// Clear pending auto-save to prevent stale content overwriting the new draft
		if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
		setSaveStatus(undefined)

		if (draft) {
			draftIdRef.current = draft.actionId
			if (typeof draft.content === 'string') {
				setContent(draft.content)
				// Sync editable DOM with draft content
				setTimeout(() => edit.update(draft.content as string), 0)
			}
			if (draft.visibility && ['P', 'C', 'F'].includes(draft.visibility)) {
				setVisibility(draft.visibility as Visibility)
			}
			if (draft.status === 'S') {
				// For scheduled drafts, the backend stores publish_at in created_at
				setScheduleDate(new Date(draft.createdAt))
				setShowSchedule(true)
			}
			// Pre-fill attachments
			if (draft.attachments?.length) {
				imageUpload.initAttachments(
					draft.attachments.map((a) => a.fileId),
					inferAttachmentType(draft.subType)
				)
			}
		} else {
			draftIdRef.current = undefined
			imageUpload.reset()
		}
	}, [draft, imageUpload.initAttachments, edit])

	// Load default visibility from settings
	React.useEffect(() => {
		if (!api || draft) return
		;(async function loadDefaultVisibility() {
			try {
				const setting = await api.settings.get('profile.default_visibility')
				const value = setting?.value
				if (typeof value === 'string' && ['P', 'C', 'F'].includes(value)) {
					setVisibility(value as Visibility)
				}
			} catch (_e) {
				// Use default 'F' if setting not found
			}
		})()
	}, [api, draft])

	// Auto-save with 1s debounce
	React.useEffect(() => {
		if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
		if (savedFadeRef.current) clearTimeout(savedFadeRef.current)

		if (!api || !auth?.idTag || !open) return

		const hasContent = content.trim().length > 0 || imageUpload.attachmentIds.length > 0
		if (!hasContent) return

		saveTimeoutRef.current = setTimeout(async () => {
			if (submittingRef.current) return

			const subType = getSubType()
			const publishAtUnix = scheduleDate
				? Math.floor(scheduleDate.getTime() / 1000)
				: undefined

			setSaveStatus('saving')
			try {
				if (draftIdRef.current) {
					await api.actions.update(draftIdRef.current, {
						content,
						subType,
						attachments: imageUpload.attachmentIds.length
							? imageUpload.attachmentIds
							: undefined,
						visibility,
						publishAt: publishAtUnix
					})
				} else {
					const action: NewAction = {
						type: 'POST',
						subType,
						content,
						attachments: imageUpload.attachmentIds.length
							? imageUpload.attachmentIds
							: undefined,
						audienceTag: idTag,
						visibility,
						draft: true,
						publishAt: publishAtUnix
					}
					const res = await api.actions.create(action)
					if (!submittingRef.current) {
						draftIdRef.current = res.actionId
					}
				}
				setSaveStatus('saved')
				if (savedFadeRef.current) clearTimeout(savedFadeRef.current)
				savedFadeRef.current = setTimeout(() => setSaveStatus(undefined), 2000)
			} catch (e) {
				console.error('Auto-save failed', e)
				setSaveStatus(undefined)
			}
		}, 1000)

		return () => {
			if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
		}
	}, [
		api,
		auth?.idTag,
		idTag,
		content,
		visibility,
		scheduleDate,
		attachmentIdsKey,
		imageUpload.attachmentType,
		open
	])

	// Cleanup fade timeout on unmount
	React.useEffect(() => {
		return () => {
			if (savedFadeRef.current) clearTimeout(savedFadeRef.current)
		}
	}, [])

	// Auto-focus text area on open, reset on close
	React.useEffect(() => {
		if (open) {
			const timeout = setTimeout(() => {
				editorRef.current?.focus()
			}, 50)
			return () => clearTimeout(timeout)
		}
		initialMediaTriggered.current = false
		// Reset stale draft ref when closing without submitting
		if (!draft) {
			draftIdRef.current = undefined
		}
	}, [open, draft])

	// Trigger initial media input when specified
	React.useEffect(() => {
		if (!open || !initialMedia || initialMediaTriggered.current) return
		initialMediaTriggered.current = true

		const timeout = setTimeout(() => {
			switch (initialMedia) {
				case 'image':
					fileInputRef.current?.click()
					break
				case 'camera':
					imgInputRef.current?.click()
					break
				case 'video':
					videoInputRef.current?.click()
					break
			}
		}, 100)
		return () => clearTimeout(timeout)
	}, [open, initialMedia])

	function onFileChange(which: 'file' | 'image' | 'video') {
		const inputRef =
			which === 'image' ? imgInputRef : which === 'video' ? videoInputRef : fileInputRef
		const file = inputRef.current?.files?.[0]
		if (!file) return

		if (file.type.startsWith('video/')) {
			imageUpload.uploadVideo(file)
		} else if (file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')) {
			imageUpload.uploadSvg(file)
		} else if (file.type === 'application/pdf') {
			imageUpload.uploadDocument(file)
		} else {
			imageUpload.selectFile(file)
		}
		if (inputRef.current) inputRef.current.value = ''
	}

	function getSubType() {
		return imageUpload.attachmentType === 'video'
			? 'VIDEO'
			: imageUpload.attachmentType === 'image'
				? 'IMG'
				: imageUpload.attachmentType === 'document'
					? 'DOC'
					: 'TEXT'
	}

	async function handleCancel() {
		if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
		submittingRef.current = true

		const hasContent = content.trim().length > 0 || imageUpload.attachmentIds.length > 0

		if (!draft && draftIdRef.current && hasContent) {
			const keepDraft = await dialog.ask(t('Keep as draft?'), t('You have unsaved content.'))
			if (keepDraft === undefined) {
				submittingRef.current = false
				return
			}
			if (!keepDraft) {
				api?.actions.delete(draftIdRef.current).catch(() => {})
			}
		} else if (!draft && draftIdRef.current && !hasContent) {
			api?.actions.delete(draftIdRef.current).catch(() => {})
		}

		resetForm()
		onClose()
		submittingRef.current = false
	}

	async function doSubmit() {
		if (!api || !auth?.idTag) return

		const hasContent = content.trim().length > 0 || imageUpload.attachmentIds.length > 0
		if (!hasContent) return

		// Cancel any pending auto-save
		if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
		submittingRef.current = true

		const subType = getSubType()
		const publishAtUnix = scheduleDate ? Math.floor(scheduleDate.getTime() / 1000) : undefined

		try {
			if (draftIdRef.current) {
				// Draft exists (either from editing or auto-saved) — update then publish
				await api.actions.update(draftIdRef.current, {
					content,
					subType,
					attachments: imageUpload.attachmentIds.length
						? imageUpload.attachmentIds
						: undefined,
					visibility,
					publishAt: publishAtUnix
				})
				if (publishAtUnix) {
					await api.actions.publish(draftIdRef.current, { publishAt: publishAtUnix })
				} else {
					await api.actions.publish(draftIdRef.current)
				}
				const updated = await api.actions.get(draftIdRef.current)
				onSubmit?.(updated)
			} else {
				// No draft yet — create and publish immediately
				const action: NewAction = {
					type: 'POST',
					subType,
					content,
					attachments: imageUpload.attachmentIds.length
						? imageUpload.attachmentIds
						: undefined,
					audienceTag: idTag,
					visibility,
					publishAt: publishAtUnix
				}
				const res = await api.actions.create(action)
				if (publishAtUnix) {
					await api.actions.publish(res.actionId, { publishAt: publishAtUnix })
					const updated = await api.actions.get(res.actionId)
					onSubmit?.(updated)
				} else {
					onSubmit?.(res)
				}
			}

			resetForm()
			onClose()
		} catch (e) {
			console.error('Failed to publish post', e)
		} finally {
			submittingRef.current = false
		}
	}

	function resetForm() {
		setContent('')
		setScheduleDate(undefined)
		setShowSchedule(false)
		setSaveStatus(undefined)
		draftIdRef.current = undefined
		imageUpload.reset()
	}

	function onKeyDown(e: React.KeyboardEvent) {
		if (e.ctrlKey && e.key === 'Enter') {
			e.preventDefault()
			doSubmit()
		}
	}

	React.useEffect(() => {
		if (!emojiPickerOpen || !emojiPopperEl) return

		function handleClickOutside(evt: MouseEvent) {
			if (!(evt.target instanceof Node)) return
			if (emojiPopperEl?.contains(evt.target) || emojiRefEl?.contains(evt.target)) return
			setEmojiPickerOpen(false)
		}

		document.addEventListener('click', handleClickOutside, true)
		return () => {
			document.removeEventListener('click', handleClickOutside, true)
		}
	}, [emojiPickerOpen, emojiPopperEl, emojiRefEl])

	function handleEmojiSelect(emoji: { native: string }) {
		const pos = savedPosRef.current
		const newContent = content.slice(0, pos) + emoji.native + content.slice(pos)
		editorRef.current?.focus()
		edit.update(newContent)
		edit.move(pos + emoji.native.length)
		setEmojiPickerOpen(false)
	}

	if (!open || !auth?.idTag) return null

	const isDisabled =
		imageUpload.attachmentType === 'video' ||
		imageUpload.attachmentType === 'document' ||
		imageUpload.isUploading

	const isScheduled = !!scheduleDate

	return (
		<>
			<div className={mergeClasses('c-vbox', className)}>
				<div className="c-panel g-2 c-vbox">
					<div className="c-hbox">
						<span className="flex-fill" />
						<Button kind="link" onClick={handleCancel} aria-label={t('Cancel')}>
							<IcClose />
						</Button>
					</div>
					{draft && (
						<div
							className="c-hbox g-1 align-items-center"
							style={{
								color: isEditingScheduled
									? 'var(--col-primary)'
									: 'var(--col-warning)',
								fontSize: '0.85rem'
							}}
						>
							{isEditingScheduled ? <IcSchedule /> : <IcSave />}
							<span>
								{isEditingScheduled
									? t('Editing scheduled post')
									: t('Editing draft')}
							</span>
						</div>
					)}
					<div className="c-hbox align-items-start">
						<ProfilePicture profile={{ profilePic: auth.profilePic }} small />
						<div className="c-input-group flex-fill">
							<div
								ref={editorRef}
								className="c-input"
								tabIndex={0}
								onKeyDown={onKeyDown}
								style={{ minHeight: '6rem' }}
							>
								{generateFragments(content).map((n, i) => (
									<React.Fragment key={i}>{n}</React.Fragment>
								))}
							</div>
							<div className="c-hbox g-1 align-self-end m-1">
								<VisibilitySelector value={visibility} onChange={setVisibility} />
								{saveStatus && (
									<span
										style={{
											fontSize: '0.75rem',
											color: 'var(--col-on-container)',
											opacity: 0.6,
											alignSelf: 'center'
										}}
									>
										{saveStatus === 'saving'
											? t('Saving...')
											: isEditingScheduled
												? t('Scheduled post updated')
												: t('Draft saved')}
									</span>
								)}
								{isScheduled ? (
									<Button
										variant="primary"
										size="small"
										onClick={doSubmit}
										title={
											isEditingScheduled
												? t('Update schedule')
												: t('Schedule post')
										}
									>
										<IcSchedule />
										{isEditingScheduled ? t('Update schedule') : t('Schedule')}
									</Button>
								) : (
									<Button kind="link" variant="primary" onClick={doSubmit}>
										<IcSend />
									</Button>
								)}
							</div>
						</div>
					</div>
					<AttachmentPreview
						attachmentIds={imageUpload.attachmentIds}
						idTag={auth.idTag}
						onRemove={imageUpload.removeAttachment}
					/>
					{imageUpload.uploadProgress !== undefined && (
						<div className="c-hbox g-2 align-items-center p-1">
							<div
								className="c-progress flex-fill"
								style={{
									height: '0.5rem',
									borderRadius: '0.25rem',
									background: 'var(--col-container)'
								}}
							>
								<div
									className="c-progress-bar"
									style={{
										width: `${imageUpload.uploadProgress}%`,
										height: '100%',
										borderRadius: '0.25rem',
										background: 'var(--col-primary)',
										transition: 'width 0.2s ease'
									}}
								/>
							</div>
							<span className="text-sm">{imageUpload.uploadProgress}%</span>
						</div>
					)}
					{showSchedule && (
						<>
							<hr className="w-100" />
							<SchedulePicker value={scheduleDate} onChange={setScheduleDate} />
						</>
					)}
					<hr className="w-100" />
					<div className="c-hbox g-3">
						<Button kind="link" disabled={process.env.NODE_ENV === 'production'}>
							<IcPoll />
							{t('Poll')}
						</Button>
						<Button kind="link" disabled={process.env.NODE_ENV === 'production'}>
							<IcEvent />
							{t('Event')}
						</Button>
						<Button
							kind="link"
							className={mergeClasses(
								'pos-relative',
								showSchedule ? 'active' : undefined
							)}
							onClick={() => setShowSchedule(!showSchedule)}
						>
							<IcSchedule />
							{t('Schedule')}
							{!showSchedule && scheduleDate && (
								<span className="c-badge pos-absolute top-0 left-100 bg bg-primary" />
							)}
						</Button>
						<div className="c-hbox g-2 ms-auto">
							<div ref={setEmojiRefEl}>
								<Button
									kind="link"
									onClick={() => setEmojiPickerOpen(!emojiPickerOpen)}
								>
									<IcSmile />
								</Button>
							</div>
							{emojiPickerOpen &&
								createPortal(
									<div
										ref={setEmojiPopperEl}
										className="c-popper high"
										style={{ ...emojiPopperStyles.popper, zIndex: 1000 }}
										onMouseDown={(e) => e.preventDefault()}
										{...emojiAttributes.popper}
									>
										<Picker
											data={data}
											onEmojiSelect={handleEmojiSelect}
											locale={i18n.language}
										/>
									</div>,
									document.getElementById('popper-container') ?? document.body
								)}
							<Button
								kind="link"
								disabled={isDisabled}
								onClick={() => fileInputRef.current?.click()}
							>
								<IcImage />
							</Button>
							<input
								ref={fileInputRef}
								id={fileInputId}
								type="file"
								accept="image/*,video/*,.pdf"
								style={{ display: 'none' }}
								onChange={() => onFileChange('file')}
							/>

							<Button
								kind="link"
								disabled={isDisabled}
								onClick={() => imgInputRef.current?.click()}
							>
								<IcCamera />
							</Button>
							<input
								ref={imgInputRef}
								id={imgInputId}
								type="file"
								capture="environment"
								accept="image/*,.svg"
								style={{ display: 'none' }}
								onChange={() => onFileChange('image')}
							/>

							<Button
								kind="link"
								disabled={
									imageUpload.attachmentType !== undefined ||
									imageUpload.isUploading
								}
								onClick={() => videoInputRef.current?.click()}
							>
								<IcVideo />
							</Button>
							<input
								ref={videoInputRef}
								id={videoInputId}
								type="file"
								capture="environment"
								accept="video/*"
								style={{ display: 'none' }}
								onChange={() => onFileChange('video')}
							/>
						</div>
					</div>
				</div>
			</div>
			{imageUpload.attachment && (
				<ImageUpload
					src={imageUpload.attachment}
					aspects={['', '4:1', '3:1', '2:1', '16:9', '3:2', '1:1']}
					onSubmit={imageUpload.uploadAttachment}
					onCancel={imageUpload.cancelCrop}
				/>
			)}
		</>
	)
}

// vim: ts=4
