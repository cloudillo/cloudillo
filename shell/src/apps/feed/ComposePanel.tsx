// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { FileView } from '@cloudillo/core'
import {
	Badge,
	Button,
	Divider,
	HBox,
	IconText,
	Panel,
	Popover,
	Progress,
	RichTextInput,
	type RichTextInputHandle,
	Spacer,
	Text,
	Tooltip,
	useApi,
	useAuth,
	useDialog,
	useFilePicker,
	useToast,
	VBox
} from '@cloudillo/react'
import type { ActionView, NewAction } from '@cloudillo/types'
import data from '@emoji-mart/data'
import Picker from '@emoji-mart/react'
import { useAtomValue } from 'jotai'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
	LuCamera as IcCamera,
	LuX as IcClose,
	LuFileText as IcDocument,
	LuCalendarDays as IcEvent,
	LuHand as IcHand,
	LuImage as IcImage,
	LuListChecks as IcPoll,
	LuRepeat2 as IcRepost,
	LuSave as IcSave,
	LuCalendarClock as IcSchedule,
	LuSendHorizontal as IcSend,
	LuSmile as IcSmile,
	LuVideo as IcVideo
} from 'react-icons/lu'

import { AttachmentPreview } from '../../components/AttachmentPreview.js'
import { useDocumentPicker } from '../../components/DocumentPicker/index.js'
import { contextRolesAtom, useApiContext } from '../../context/index.js'
import { type AttachmentType, useImageUpload } from '../../hooks/useImageUpload.js'
import { ImageUpload } from '../../image.js'
import { handAtom } from '../../state/hand.js'
import { fetchRow } from '../doc-info.js'
import { canManageFile, visibilityRank } from '../files/utils.js'
import { AudienceSelector, type AudienceTarget } from './AudienceSelector.js'
import type { DocPostIntent } from './doc-post-intent.js'
import { EmbeddedPostCard } from './EmbeddedPostCard.js'
import { LiveDocCard } from './LiveDocCard.js'
import {
	buildLiveDocContent,
	isPostableHandDoc,
	isSameDoc,
	type LiveDocRef,
	parseLiveDocContent
} from './live-doc.js'
import { SchedulePicker } from './SchedulePicker.js'
import { type Visibility, VisibilitySelector } from './VisibilitySelector.js'

export interface ComposePanelProps {
	open: boolean
	onClose: () => void
	onSubmit?: (action: ActionView) => void
	idTag?: string
	initialMedia?: 'image' | 'camera' | 'video'
	/** Open with this document already attached (the editor's "Share to feed"). */
	initialDoc?: DocPostIntent
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
			<Text size="sm" emphasis="muted" className="align-self-center">
				{status === 'saving'
					? t('Saving...')
					: isEditingScheduled
						? t('Scheduled post updated')
						: t('Draft saved')}
			</Text>
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
		// Everything else — including LDOC, which is a reference in `content` rather than an
		// attachment — has nothing materialized to restore.
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
	initialDoc,
	draft,
	quotedAction,
	target,
	ownRepostIds,
	audiencePicker,
	className
}: ComposePanelProps) {
	const { t, i18n } = useTranslation()
	const { api } = useApi()
	const { getClientFor } = useApiContext()
	const [auth] = useAuth()
	const dialog = useDialog()
	const toast = useToast()
	const { pickDocument } = useDocumentPicker()
	const hand = useAtomValue(handAtom)
	const isQuote = !!quotedAction
	const [content, setContent] = React.useState('')
	const [visibility, setVisibility] = React.useState<Visibility>('F')
	const [attachedDoc, setAttachedDoc] = React.useState<LiveDocRef | undefined>()
	const [docRow, setDocRow] = React.useState<FileView | undefined>()

	// The node that SERVES the attached document, never the one the composer is browsing:
	// the picker browses the user's own node while a community feed's context is the
	// community, and a hand item names its upstream node. Asked of the browsing client the
	// `isSameDoc` check below could never match in a community, leaving the whole access
	// notice dead exactly where it is needed. `explicit: true` because the user picked this
	// document themselves (the `mayUseContextToken` contract in `context/trust-gate.ts`).
	//
	// Not read directly — it is the re-render signal. `getClientFor` hands back the
	// registry's cached client or null and never fetches, so without this the memo
	// stays null forever when the token for `srcIdTag` arrives after the attach.
	const contextRoles = useAtomValue(contextRolesAtom)
	const docApi = React.useMemo(
		() =>
			!attachedDoc
				? null
				: attachedDoc.srcIdTag === auth?.idTag
					? api
					: getClientFor(attachedDoc.srcIdTag, { explicit: true }),
		[attachedDoc, auth?.idTag, api, getClientFor, contextRoles]
	)
	const [noticeDismissed, setNoticeDismissed] = React.useState(false)

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
	const editHandle = React.useRef<RichTextInputHandle>(null)
	const filePicker = useFilePicker({
		accept: 'image/*,video/*,.pdf',
		multiple: false,
		onFiles: onFile
	})
	const cameraPicker = useFilePicker({
		accept: 'image/*,.svg',
		multiple: false,
		capture: 'environment',
		onFiles: onFile
	})
	const videoPicker = useFilePicker({
		accept: 'video/*',
		multiple: false,
		capture: 'environment',
		onFiles: onFile
	})
	const initialMediaTriggered = React.useRef(false)
	const draftIdRef = React.useRef<string | undefined>(draft?.actionId)
	const saveTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
	const savedFadeRef = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
	const submittingRef = React.useRef(false)

	const imageUpload = useImageUpload()
	const attachmentIdsKey = imageUpload.attachmentIds.join(',')

	const isEditingScheduled = draft?.status === 'S'

	const [emojiPickerOpen, setEmojiPickerOpen] = React.useState(false)
	const savedRangeRef = React.useRef<Range | null>(null)

	// Pre-fill from draft when editing
	React.useEffect(() => {
		// Clear pending auto-save to prevent stale content overwriting the new draft
		if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
		saveStatusRef.current?.setStatus(undefined)

		if (draft) {
			draftIdRef.current = draft.actionId
			// An LDOC draft carries the doc reference in `content`; the editable
			// text is its `.text` field, not the object.
			const draftDoc = parseLiveDocContent(draft.content)
			// This effect OWNS `attachedDoc`: undefined for a non-LDOC draft, so swapping
			// drafts while the panel stays open can never inherit the previous document.
			setAttachedDoc(draftDoc)
			if (draftDoc) {
				const text = draftDoc.text ?? ''
				setContent(text)
			} else if (typeof draft.content === 'string') {
				setContent(draft.content)
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
			setAttachedDoc(undefined)
			imageUpload.reset()
		}
	}, [draft, imageUpload.initAttachments])

	// A document handed in from the editor. Runs after the draft effect above so
	// an explicit intent wins over an empty draft restore.
	React.useEffect(() => {
		const ref = parseLiveDocContent(initialDoc)
		if (ref) setAttachedDoc(ref)
	}, [initialDoc])

	// State survives a close: the panel is permanently mounted and only returns null
	// (see the `!open` guard below). Without this an attached document rides into the
	// next, unrelated post — silently turning it into an LDOC and dropping its images.
	React.useEffect(() => {
		if (!open) setAttachedDoc(undefined)
	}, [open])

	// Re-arm on a wider post: dismissing the notice for 'F' says nothing about 'P'.
	React.useEffect(() => {
		setNoticeDismissed(false)
	}, [attachedDoc, visibility])

	// The attached document's own row, for the access notice below. One request,
	// and only when something is attached.
	React.useEffect(() => {
		if (!attachedDoc) {
			setDocRow(undefined)
			return
		}
		let live = true
		fetchRow(docApi, attachedDoc.fileId).then((res) => {
			// Same-document check (ids are node-local), plus: only a row that originates HERE may
			// be widened — `api.files.update` on a mirror would change our copy, not the
			// canonical one.
			const own = isSameDoc(res.row, attachedDoc, docApi?.idTag) && !res.row?.upstream?.idTag
			if (live) setDocRow(own ? res.row : undefined)
		})
		return () => {
			live = false
		}
	}, [docApi, attachedDoc])

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

		// An attached document alone is not authorship: "Share to feed" opens the composer with one
		// already in place, and auto-saving that would hand the user a draft they never wrote.
		const hasContent = content.trim().length > 0 || imageUpload.attachmentIds.length > 0
		if (!hasContent) return

		saveTimeoutRef.current = setTimeout(async () => {
			if (submittingRef.current) return

			const subType = getSubType()
			const postContent = buildPostContent()
			const publishAtUnix = scheduleDate
				? Math.floor(scheduleDate.getTime() / 1000)
				: undefined

			saveStatusRef.current?.setStatus('saving')
			try {
				if (draftIdRef.current) {
					await api.actions.update(draftIdRef.current, {
						content: postContent,
						subType,
						attachments: buildPostAttachments(),
						visibility,
						publishAt: publishAtUnix
					})
				} else {
					const action: NewAction = {
						type: 'POST',
						subType,
						content: postContent,
						attachments: buildPostAttachments(),
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
		attachedDoc,
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
					filePicker.open()
					break
				case 'camera':
					cameraPicker.open()
					break
				case 'video':
					videoPicker.open()
					break
			}
		}, 100)
		return () => clearTimeout(timeout)
	}, [open, initialMedia])

	function onFile(files: File[]) {
		const file = files[0]
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
	}

	async function attachDocument() {
		// The picker already defaults to these; spelled out so the composer's
		// intent is readable. It returns `null` — not `undefined` — on cancel.
		const res = await pickDocument({ fileTp: 'CRDT,RTDB', title: t('Share a document') })
		if (!res) return // cancelled
		// `srcIdTag` is the node that actually serves the document — the resId's own grammar.
		// `auth.idTag` would be wrong for a mirrored row, whose CRDT content lives upstream.
		if (!res.srcIdTag) {
			// A post must name the node that SERVES the document; without one there is
			// nothing to address and silently doing nothing reads as a broken button.
			toast.error(t('Could not tell which server holds this document.'))
			return
		}
		// The `canPost` rule (shell/src/apps/doc-info.ts): a read-only document is a dead
		// link for the audience — the author cannot widen what they cannot write. `=== false`
		// so a picker surface that cannot decide stays permissive.
		if (res.canWrite === false) {
			toast.error(t('You can only read this document, so you cannot share it to your feed.'))
			return
		}
		setAttachedDoc({
			doc: `${res.srcIdTag}:${res.fileId}`,
			srcIdTag: res.srcIdTag,
			fileId: res.fileId,
			contentType: res.contentType,
			title: res.fileName
		})
	}

	// A document picked up in Files and carried here. Attaching does not empty
	// the hand — the user may still be taking it somewhere else.
	// The media conditions are the rule the document picker button applies too: a post is
	// one thing or the other, and attaching a document would drop the uploads
	// (`buildPostAttachments`) with nothing left on screen to remove them from.
	const handDoc =
		!attachedDoc &&
		!isQuote &&
		imageUpload.attachmentType === undefined &&
		!imageUpload.isUploading &&
		hand?.status === 'active'
			? hand.items.find(isPostableHandDoc)
			: undefined

	function attachHandDoc() {
		if (!handDoc?.contentType) return
		setAttachedDoc({
			doc: `${handDoc.idTag}:${handDoc.id}`,
			srcIdTag: handDoc.idTag,
			fileId: handDoc.id,
			contentType: handDoc.contentType,
			title: handDoc.label
		})
	}

	// The document is narrower than the post it is about to be linked from, so
	// the post would be a dead link for most of its audience.
	// The shared predicate rather than a hand-rolled `admin || owner` test, which missed a plain
	// `write` grantee. No roles: `docRow` came from the document's own node via `files.list`,
	// which always fills `accessLevel`, so the role ladder is never consulted.
	const docOwned = !!docRow && canManageFile(docRow, auth?.idTag, [])
	const docRank = docRow ? visibilityRank(docRow.visibility) : -1
	const showAccessNotice =
		!!attachedDoc &&
		docOwned &&
		!noticeDismissed &&
		docRank >= 0 &&
		docRank < visibilityRank(visibility)

	async function widenDocument() {
		if (!docApi || !attachedDoc) return
		try {
			await docApi.files.update(attachedDoc.fileId, { visibility })
			setDocRow((row) => (row ? { ...row, visibility } : row))
		} catch (e) {
			console.error('Failed to widen document visibility', e)
			toast.error(t('Failed to change visibility'))
		}
	}

	function getSubType() {
		return attachedDoc
			? 'LDOC'
			: imageUpload.attachmentType === 'video'
				? 'VIDEO'
				: imageUpload.attachmentType === 'image'
					? 'IMG'
					: imageUpload.attachmentType === 'document'
						? 'DOC'
						: 'TEXT'
	}

	/** For an LDOC the whole `content` is the reference object and the typed text
	 * is one field of it; for everything else `content` is the text itself. */
	function buildPostContent() {
		return attachedDoc
			? buildLiveDocContent({ ...attachedDoc, text: content || undefined })
			: content
	}

	/** A post is one thing or the other: an attached document replaces the media strip, so a
	 *  stale upload must not ride along in `attachments`. */
	function buildPostAttachments() {
		if (attachedDoc) return undefined
		return imageUpload.attachmentIds.length ? imageUpload.attachmentIds : undefined
	}

	async function handleCancel() {
		if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
		submittingRef.current = true

		// An attached document alone is not authorship: "Share to feed" opens the composer with one
		// already in place, and prompting to keep that would hand the user a draft they never wrote.
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

		const hasContent =
			content.trim().length > 0 || imageUpload.attachmentIds.length > 0 || !!attachedDoc
		if (!hasContent) return

		// Block submit while an attachment upload is in flight, otherwise the
		// post would be created with subType TEXT and no attachments.
		if (imageUpload.isUploading) return

		// Cancel any pending auto-save
		if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
		submittingRef.current = true

		const subType = getSubType()
		const postContent = buildPostContent()
		const publishAtUnix = scheduleDate ? Math.floor(scheduleDate.getTime() / 1000) : undefined

		try {
			if (draftIdRef.current) {
				// Draft exists (either from editing or auto-saved) — update then publish
				await api.actions.update(draftIdRef.current, {
					content: postContent,
					subType,
					attachments: buildPostAttachments(),
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
					content: postContent,
					attachments: buildPostAttachments(),
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
		setAttachedDoc(undefined)
		saveStatusRef.current?.setStatus(undefined)
		draftIdRef.current = undefined
		imageUpload.reset()
	}

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

		editHandle.current?.insert(emoji.native)
		savedRangeRef.current = null
		setEmojiPickerOpen(false)
		// The popover hands focus back to its trigger on close; the caret belongs in the editor
		requestAnimationFrame(() => editor.focus())
	}

	if (!open || !auth?.idTag) return null

	const isDisabled =
		imageUpload.attachmentType === 'video' ||
		imageUpload.attachmentType === 'document' ||
		imageUpload.isUploading ||
		!!attachedDoc

	const isScheduled = !!scheduleDate

	return (
		<>
			<Panel className={className}>
				<VBox gap={2}>
					<HBox gap={2} align="center">
						{audiencePicker && (
							<AudienceSelector
								target={audienceTarget}
								ownRepostIds={ownRepostIds}
								onChange={setAudienceTarget}
							/>
						)}
						<VisibilitySelector value={visibility} onChange={setVisibility} />
						<Spacer />
						<Button variant="link" onClick={handleCancel} aria-label={t('Cancel')}>
							<IcClose />
						</Button>
					</HBox>
					{draft && (
						<Text size="sm" color={isEditingScheduled ? 'primary' : 'warning'}>
							<IconText icon={isEditingScheduled ? <IcSchedule /> : <IcSave />}>
								{isEditingScheduled
									? t('Editing scheduled post')
									: t('Editing draft')}
							</IconText>
						</Text>
					)}
					<RichTextInput
						ref={editorRef}
						editRef={editHandle}
						value={content}
						onChange={setContent}
						onSubmit={doSubmit}
						minRows={4}
						aria-label={t('Post')}
						actions={
							<>
								<SaveStatusIndicator
									ref={saveStatusRef}
									isEditingScheduled={isEditingScheduled}
								/>
								{isScheduled ? (
									<Tooltip
										content={
											imageUpload.isUploading
												? t('Wait for upload to finish')
												: isEditingScheduled
													? t('Update schedule')
													: t('Schedule post')
										}
									>
										<Button
											color="primary"
											size="sm"
											onClick={doSubmit}
											disabled={imageUpload.isUploading}
										>
											<IcSchedule />
											{isEditingScheduled
												? t('Update schedule')
												: t('Schedule')}
										</Button>
									</Tooltip>
								) : isQuote ? (
									<Button color="primary" size="sm" onClick={doSubmit}>
										<IcRepost />
										{content.trim() ? t('Post quote') : t('Repost')}
									</Button>
								) : (
									<Button
										variant="link"
										color="primary"
										onClick={doSubmit}
										disabled={imageUpload.isUploading}
										aria-label={
											imageUpload.isUploading
												? t('Wait for upload to finish')
												: t('Post')
										}
									>
										<IcSend />
									</Button>
								)}
							</>
						}
					/>
					{isQuote && quotedAction && (
						<EmbeddedPostCard
							subjectAction={quotedAction}
							width={480}
							className="m-1"
						/>
					)}
					{attachedDoc ? (
						// A post is one thing or the other: the attached document
						// takes the place of the media strip.
						<HBox gap={1} align="start">
							<LiveDocCard docRef={attachedDoc} collapsedOnly className="flex-fill" />
							<Button
								variant="link"
								onClick={() => setAttachedDoc(undefined)}
								aria-label={t('Remove document')}
							>
								<IcClose />
							</Button>
						</HBox>
					) : (
						<AttachmentPreview
							attachmentIds={imageUpload.attachmentIds}
							idTag={auth.idTag}
							onRemove={imageUpload.removeAttachment}
						/>
					)}
					{showAccessNotice && (
						<HBox gap={2} align="center">
							<Text size="sm" color="warning">
								{t('This document is visible to fewer people than the post.')}
							</Text>
							<Button variant="link" size="sm" onClick={widenDocument}>
								{t('Let people who see this post read it')}
							</Button>
							<Button
								variant="link"
								onClick={() => setNoticeDismissed(true)}
								aria-label={t('Dismiss')}
							>
								<IcClose />
							</Button>
						</HBox>
					)}
					{imageUpload.isUploading && !imageUpload.attachment && (
						<HBox gap={2} align="center" className="p-1">
							{imageUpload.uploadProgress === undefined ? (
								<Progress indeterminate className="flex-fill" />
							) : (
								<Progress
									value={imageUpload.uploadProgress}
									className="flex-fill"
								/>
							)}
							<Text size="sm">
								{imageUpload.uploadProgress !== undefined
									? `${imageUpload.uploadProgress}%`
									: t('Uploading...')}
							</Text>
						</HBox>
					)}
					{showSchedule && (
						<>
							<Divider />
							<SchedulePicker value={scheduleDate} onChange={setScheduleDate} />
						</>
					)}
					<Divider />
					{isQuote && (
						<Text size="sm" emphasis="muted">
							{t("Attachments aren't supported on reposts")}
						</Text>
					)}
					{handDoc && (
						<HBox gap={2} align="center">
							<Text size="sm" className="flex-fill">
								<IconText icon={<IcHand />}>
									{t('{{name}} in hand', { name: handDoc.label })}
								</IconText>
							</Text>
							<Button variant="link" size="sm" onClick={attachHandDoc}>
								{t('Attach')}
							</Button>
						</HBox>
					)}
					<HBox gap={3} wrap>
						<Button
							variant="link"
							disabled={process.env.NODE_ENV === 'production' || isQuote}
						>
							<IcPoll />
							{t('Poll')}
						</Button>
						<Button
							variant="link"
							disabled={process.env.NODE_ENV === 'production' || isQuote}
						>
							<IcEvent />
							{t('Event')}
						</Button>
						<Button
							variant="link"
							disabled={isQuote}
							pressed={showSchedule}
							onClick={() => setShowSchedule(!showSchedule)}
						>
							<IcSchedule />
							{t('Schedule')}
							{!showSchedule && scheduleDate && (
								<Badge dot color="primary" aria-label={t('Scheduled')} />
							)}
						</Button>
						<Spacer />
						<HBox gap={2}>
							<Popover
								placement="top-end"
								open={emojiPickerOpen}
								onOpenChange={setEmojiPickerOpen}
								trigger={
									<Button
										variant="link"
										aria-label={t('Emoji')}
										onPointerDown={captureEditorSelection}
									>
										<IcSmile />
									</Button>
								}
							>
								<Picker
									data={data}
									onEmojiSelect={handleEmojiSelect}
									locale={i18n.language}
								/>
							</Popover>
							<Button
								variant="link"
								disabled={isDisabled || isQuote}
								aria-label={t('Add image')}
								onClick={filePicker.open}
							>
								<IcImage />
							</Button>
							<Button
								variant="link"
								disabled={isDisabled || isQuote}
								aria-label={t('Take photo')}
								onClick={cameraPicker.open}
							>
								<IcCamera />
							</Button>
							<Button
								variant="link"
								disabled={
									imageUpload.attachmentType !== undefined ||
									imageUpload.isUploading ||
									isQuote ||
									!!attachedDoc
								}
								aria-label={t('Add video')}
								onClick={videoPicker.open}
							>
								<IcVideo />
							</Button>
							<Button
								variant="link"
								disabled={
									imageUpload.attachmentType !== undefined ||
									imageUpload.isUploading ||
									isQuote ||
									!!attachedDoc
								}
								aria-label={t('Share a document')}
								onClick={attachDocument}
							>
								<IcDocument />
							</Button>
						</HBox>
					</HBox>
					{filePicker.input}
					{cameraPicker.input}
					{videoPicker.input}
				</VBox>
			</Panel>
			{imageUpload.isPreparing && !imageUpload.attachment && (
				<HBox gap={2} align="center" className="p-2">
					<Progress indeterminate className="flex-fill" />
					<Text size="sm">{t('Preparing image...')}</Text>
				</HBox>
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
