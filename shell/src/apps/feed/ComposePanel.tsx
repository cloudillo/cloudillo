// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import {
	Button,
	generateFragments,
	mergeClasses,
	Progress,
	useApi,
	useAuth,
	useDialog
} from '@cloudillo/react'
import type { ActionView, NewAction } from '@cloudillo/types'
import data from '@emoji-mart/data'
import Picker from '@emoji-mart/react'
import * as React from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import {
	LuCamera as IcCamera,
	LuX as IcClose,
	LuCalendarDays as IcEvent,
	LuImage as IcImage,
	LuListChecks as IcPoll,
	LuRepeat2 as IcRepost,
	LuSave as IcSave,
	LuCalendarClock as IcSchedule,
	LuSendHorizontal as IcSend,
	LuSmile as IcSmile,
	LuVideo as IcVideo
} from 'react-icons/lu'
import { usePopper } from 'react-popper'
import { type Position, useEditable } from 'use-editable'

import { AttachmentPreview } from '../../components/AttachmentPreview.js'
import { type AttachmentType, useImageUpload } from '../../hooks/useImageUpload.js'
import { ImageUpload } from '../../image.js'
import { handleEditablePaste } from '../../utils/editablePaste.js'
import { AudienceSelector, type AudienceTarget } from './AudienceSelector.js'
import { EmbeddedPostCard } from './EmbeddedPostCard.js'
import { SchedulePicker } from './SchedulePicker.js'
import { type Visibility, VisibilitySelector } from './VisibilitySelector.js'

export interface ComposePanelProps {
	open: boolean
	onClose: () => void
	onSubmit?: (action: ActionView) => void
	idTag?: string
	initialMedia?: 'image' | 'camera' | 'video'
	draft?: ActionView
	// When set, the panel composes a repost (REPOST) wrapping `quotedAction`,
	// delivered to `target` (defaults to the user's own wall). Empty commentary
	// produces a boost; commentary produces a quote.
	quotedAction?: ActionView
	target?: AudienceTarget
	// The quoted action's `stat.ownRepostIds` — drives the informational ✓ badge
	// in the target picker, guarding against accidental duplicate reposts.
	ownRepostIds?: Record<string, string>
	/** Show the audience selector in the context bar (feed composer only). When false,
	 * the post is still addressed to `idTag` but the picker is hidden. */
	audiencePicker?: boolean
	className?: string
}

type SaveStatus = undefined | 'saving' | 'saved'

export interface SaveStatusHandle {
	setStatus: (s: SaveStatus) => void
}

interface SaveStatusIndicatorProps {
	isEditingScheduled: boolean
}

const SaveStatusIndicator = React.forwardRef<SaveStatusHandle, SaveStatusIndicatorProps>(
	function SaveStatusIndicator({ isEditingScheduled }, ref) {
		const { t } = useTranslation()
		const [status, setStatus] = React.useState<SaveStatus>(undefined)
		React.useImperativeHandle(ref, () => ({ setStatus }), [])
		if (!status) return null
		return (
			<span
				style={{
					fontSize: '0.75rem',
					color: 'var(--col-on-container)',
					opacity: 0.6,
					alignSelf: 'center'
				}}
			>
				{status === 'saving'
					? t('Saving...')
					: isEditingScheduled
						? t('Scheduled post updated')
						: t('Draft saved')}
			</span>
		)
	}
)

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
	quotedAction,
	target,
	ownRepostIds,
	audiencePicker,
	className
}: ComposePanelProps) {
	const { t, i18n } = useTranslation()
	const { api } = useApi()
	const [auth] = useAuth()
	const dialog = useDialog()
	const isQuote = !!quotedAction
	const [content, setContent] = React.useState('')
	const [visibility, setVisibility] = React.useState<Visibility>('F')

	const ownWallTarget = React.useMemo<AudienceTarget>(
		() => ({
			idTag: auth?.idTag ?? '',
			name: auth?.name,
			profilePic: auth?.profilePic,
			kind: 'me'
		}),
		[auth?.idTag, auth?.name, auth?.profilePic]
	)

	// Explicit quote `target` wins; else the context wall from `idTag`
	// (community / profile page); else own wall. The AudienceSelector enriches a
	// bare context idTag's name/pic from useCommunitiesList() and renders it as the
	// active "current" row even when it isn't a known community.
	const initialAudience = React.useMemo<AudienceTarget>(() => {
		if (target) return target
		if (idTag && idTag !== auth?.idTag) return { idTag, kind: 'community' }
		return ownWallTarget
	}, [target, idTag, auth?.idTag, ownWallTarget])

	const [audienceTarget, setAudienceTarget] = React.useState<AudienceTarget>(initialAudience)
	React.useEffect(() => {
		setAudienceTarget(initialAudience)
	}, [initialAudience])
	const [scheduleDate, setScheduleDate] = React.useState<Date | undefined>()
	const [showSchedule, setShowSchedule] = React.useState(false)
	const editorRef = React.useRef<HTMLDivElement>(null)
	const saveStatusRef = React.useRef<SaveStatusHandle>(null)
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
	const savedRangeRef = React.useRef<Range | null>(null)
	const { styles: emojiPopperStyles, attributes: emojiAttributes } = usePopper(
		emojiRefEl,
		emojiPopperEl,
		{ placement: 'top-end', strategy: 'fixed' }
	)

	function onChange(text: string, _pos: Position) {
		setContent(text)
	}

	const edit = useEditable(editorRef, onChange, { disabled: !open })

	// Pre-fill from draft when editing
	React.useEffect(() => {
		// Clear pending auto-save to prevent stale content overwriting the new draft
		if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
		saveStatusRef.current?.setStatus(undefined)

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

		// Quotes are not auto-saved as POST drafts — they publish a REPOST.
		if (!api || !auth?.idTag || !open || isQuote) return

		const hasContent = content.trim().length > 0 || imageUpload.attachmentIds.length > 0
		if (!hasContent) return

		saveTimeoutRef.current = setTimeout(async () => {
			if (submittingRef.current) return

			const subType = getSubType()
			const publishAtUnix = scheduleDate
				? Math.floor(scheduleDate.getTime() / 1000)
				: undefined

			saveStatusRef.current?.setStatus('saving')
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
						audienceTag:
							audienceTarget.idTag && audienceTarget.idTag !== auth?.idTag
								? audienceTarget.idTag
								: undefined,
						visibility,
						draft: true,
						publishAt: publishAtUnix
					}
					const res = await api.actions.create(action)
					if (!submittingRef.current) {
						draftIdRef.current = res.actionId
					}
				}
				saveStatusRef.current?.setStatus('saved')
				if (savedFadeRef.current) clearTimeout(savedFadeRef.current)
				savedFadeRef.current = setTimeout(
					() => saveStatusRef.current?.setStatus(undefined),
					2000
				)
			} catch (e) {
				console.error('Auto-save failed', e)
				saveStatusRef.current?.setStatus(undefined)
			}
		}, 1000)

		return () => {
			if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
			if (savedFadeRef.current) clearTimeout(savedFadeRef.current)
		}
	}, [
		api,
		auth?.idTag,
		idTag,
		audienceTarget.idTag,
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

		// Unified audience for both branches: own wall → omit the tag.
		const audienceTag =
			audienceTarget.idTag && audienceTarget.idTag !== auth.idTag
				? audienceTarget.idTag
				: undefined

		// Quote mode: publish a REPOST referencing the quoted action. No draft
		// flow, no attachments; commentary is optional.
		if (isQuote && quotedAction) {
			// Block a second identical REPOST to the same target. `ownRepostIds`
			// is keyed by audience tag for communities and by the user's own
			// idTag for the own wall (audienceTag is undefined there).
			const repostKey = audienceTag ?? auth.idTag
			// REPOST must carry an explicit audience; the backend rejects one without.
			// For the own wall fall back to the user's own idTag (same value as the
			// duplicate-guard key). Since audience idTag === issuer idTag there, the
			// feed card suppresses the audience header (feed.tsx ProfileAudienceCard).
			const repostAudienceTag = repostKey
			if (ownRepostIds?.[repostKey]) {
				await dialog.tell(
					t('Already reposted'),
					t('You have already reposted this to {{name}}.', {
						name: audienceTarget.name || audienceTarget.idTag
					})
				)
				return
			}
			submittingRef.current = true
			try {
				const repost: NewAction = {
					type: 'REPOST',
					subject: quotedAction.actionId,
					// Always set an explicit audience (own idTag for the own wall);
					// the audience-header card is suppressed when it equals the issuer.
					audienceTag: repostAudienceTag,
					content: content.trim() || undefined,
					visibility
				}
				const res = await api.actions.create(repost)
				// The create response is a single-action shape with no
				// subjectAction; attach the original (already in scope) so the
				// optimistically-prepended repost shows its embedded original card.
				// For non-own-wall targets, also attach the chosen audience so the
				// feed-level optimistic overlay keys `ownRepostIds` by the right tag.
				onSubmit?.({
					...res,
					subjectAction: quotedAction,
					audience: {
						idTag: repostAudienceTag,
						name: audienceTarget.name,
						profilePic: audienceTarget.profilePic
					}
				})
				resetForm()
				onClose()
			} catch (e) {
				console.error('Failed to post quote', e)
			} finally {
				submittingRef.current = false
			}
			return
		}

		const hasContent = content.trim().length > 0 || imageUpload.attachmentIds.length > 0
		if (!hasContent) return

		// Block submit while an attachment upload is in flight, otherwise the
		// post would be created with subType TEXT and no attachments.
		if (imageUpload.isUploading) return

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
					audienceTag,
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
		saveStatusRef.current?.setStatus(undefined)
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

	function captureEditorSelection() {
		const sel = window.getSelection()
		if (sel && sel.rangeCount > 0 && editorRef.current?.contains(sel.anchorNode)) {
			savedRangeRef.current = sel.getRangeAt(0).cloneRange()
		} else {
			savedRangeRef.current = null
		}
	}

	function handleEmojiSelect(emoji: { native: string }) {
		const editor = editorRef.current
		if (!editor) return

		editor.focus()

		const range = savedRangeRef.current
		if (range) {
			const sel = window.getSelection()
			if (sel) {
				sel.removeAllRanges()
				sel.addRange(range)
			}
		}

		edit.insert(emoji.native)
		savedRangeRef.current = null
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
					<div className="c-hbox g-2 align-items-center">
						{audiencePicker && (
							<AudienceSelector
								target={audienceTarget}
								ownRepostIds={ownRepostIds}
								onChange={setAudienceTarget}
							/>
						)}
						<VisibilitySelector value={visibility} onChange={setVisibility} />
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
						<div className="c-input-group flex-fill">
							<div
								ref={editorRef}
								className="c-input"
								tabIndex={0}
								onKeyDown={onKeyDown}
								onPasteCapture={(e) => handleEditablePaste(e, edit, content)}
								style={{ minHeight: '6rem' }}
							>
								{generateFragments(content).map((n, i) => (
									<React.Fragment key={i}>{n}</React.Fragment>
								))}
							</div>
							<div className="c-hbox g-1 align-self-end m-1">
								<SaveStatusIndicator
									ref={saveStatusRef}
									isEditingScheduled={isEditingScheduled}
								/>
								{isScheduled ? (
									<Button
										variant="primary"
										size="small"
										onClick={doSubmit}
										disabled={imageUpload.isUploading}
										title={
											imageUpload.isUploading
												? t('Wait for upload to finish')
												: isEditingScheduled
													? t('Update schedule')
													: t('Schedule post')
										}
									>
										<IcSchedule />
										{isEditingScheduled ? t('Update schedule') : t('Schedule')}
									</Button>
								) : isQuote ? (
									<Button variant="primary" size="small" onClick={doSubmit}>
										<IcRepost />
										{content.trim() ? t('Post quote') : t('Repost')}
									</Button>
								) : (
									<Button
										kind="link"
										variant="primary"
										onClick={doSubmit}
										disabled={imageUpload.isUploading}
										title={
											imageUpload.isUploading
												? t('Wait for upload to finish')
												: undefined
										}
										aria-label={
											imageUpload.isUploading
												? t('Wait for upload to finish')
												: undefined
										}
									>
										<IcSend />
									</Button>
								)}
							</div>
						</div>
					</div>
					{isQuote && quotedAction && (
						<EmbeddedPostCard
							subjectAction={quotedAction}
							width={480}
							className="m-1"
						/>
					)}
					<AttachmentPreview
						attachmentIds={imageUpload.attachmentIds}
						idTag={auth.idTag}
						onRemove={imageUpload.removeAttachment}
					/>
					{imageUpload.isUploading && !imageUpload.attachment && (
						<div className="c-hbox g-2 align-items-center p-1">
							{imageUpload.uploadProgress === undefined ? (
								<Progress indeterminate className="flex-fill" />
							) : (
								<Progress
									value={imageUpload.uploadProgress}
									className="flex-fill"
								/>
							)}
							<span className="text-sm">
								{imageUpload.uploadProgress !== undefined
									? `${imageUpload.uploadProgress}%`
									: t('Uploading...')}
							</span>
						</div>
					)}
					{showSchedule && (
						<>
							<hr className="w-100" />
							<SchedulePicker value={scheduleDate} onChange={setScheduleDate} />
						</>
					)}
					<hr className="w-100" />
					{isQuote && (
						<small style={{ opacity: 0.6 }}>
							{t("Attachments aren't supported on reposts")}
						</small>
					)}
					<div className="c-hbox g-3">
						<Button
							kind="link"
							disabled={process.env.NODE_ENV === 'production' || isQuote}
						>
							<IcPoll />
							{t('Poll')}
						</Button>
						<Button
							kind="link"
							disabled={process.env.NODE_ENV === 'production' || isQuote}
						>
							<IcEvent />
							{t('Event')}
						</Button>
						<Button
							kind="link"
							disabled={isQuote}
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
							<div ref={setEmojiRefEl} onPointerDown={captureEditorSelection}>
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
								disabled={isDisabled || isQuote}
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
								disabled={isDisabled || isQuote}
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
									imageUpload.isUploading ||
									isQuote
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
					onCancel={() => {
						imageUpload.cancelCrop()
						imageUpload.clearUploadError()
					}}
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
