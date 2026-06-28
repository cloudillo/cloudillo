// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { ApiClient } from '@cloudillo/core'
import {
	Badge,
	Button,
	EmptyState,
	Fcd,
	generateFragments,
	LoadMoreTrigger,
	mergeClasses,
	ProfileAudienceCard,
	ProfileCard,
	ProfilePicture,
	SkeletonCard,
	TimeFormat,
	useApi,
	useAuth
} from '@cloudillo/react'
import type { ActionView, NewAction } from '@cloudillo/types'
import * as T from '@symbion/runtype'
import type { TFunction } from 'i18next'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
	LuCloud as IcAll,
	LuCamera as IcCamera,
	LuUsersRound as IcCommunities,
	LuBookmark as IcFollowing,
	LuLock as IcDirect,
	LuSave as IcDraft,
	LuFilter as IcFilter,
	LuImage as IcImage,
	LuInbox as IcUnread,
	LuUser as IcMine,
	LuUsers as IcPeople,
	LuGlobe as IcPublic,
	LuRepeat2 as IcRepost,
	LuSearch as IcSearch,
	LuSendHorizontal as IcSend,
	LuTag as IcTag,
	LuVideo as IcVideo
} from 'react-icons/lu'
import { Link, useLocation } from 'react-router-dom'
import { type Position, useEditable } from 'use-editable'
import '@cloudillo/react/components.css'
import './feed.css'

import type { CommunityRef } from '../context/index.js'
import {
	HOME_CONTEXT,
	useApiContext,
	useCommunitiesList,
	useContextAwareApi,
	useCurrentContextIdTag,
	useProfileTrust,
	useUrlContextIdTag
} from '../context/index.js'
import { handleEditablePaste } from '../utils/editablePaste.js'
import { useWsBus } from '../ws-bus.js'
import {
	type AudienceTarget,
	CommentBadge,
	ComposePanel,
	DraftsPanel,
	EmbeddedPostCard,
	EngagementDialog,
	NewPostsBanner,
	PostMenu,
	parseReactionCounts,
	ReactionPicker,
	ReadDivider,
	totalReactions,
	updateReactionCounts,
	useFeedPosts,
	useUnreadPosts
} from './feed/index.js'
import {
	createdAtToSeconds,
	feedReadTs,
	feedSeedLoadedAtom,
	INITIAL_UNREAD_WINDOW_SEC,
	nowSeconds,
	unreadCountAtom,
	useReadMarker,
	useReadPositionTracker,
	useScrollEngaged
} from '../read-position.js'
import { Document, hasPlayableVariant, Images, renderPostContent, Video } from './feed/PostMedia.js'
import { pendingQuoteAtom } from './feed/quote-intent.js'
import { getVisibilityMeta } from './feed/VisibilitySelector.js'

//////////////////////
// Action datatypes //
//////////////////////
interface PostAction extends ActionView {
	type: 'POST'
	stat?: {
		ownReaction?: string
		reactions?: string
		lastCommentAt?: string | number
		commentsReadAt?: string | number
		commentCount?: number
	}
}

export type ActionEvt = PostAction | ActionView

////////////////////
// Comment Action //
////////////////////
interface CommentProps {
	className?: string
	action: ActionView
	srcTag: string
}
function Comment({ className, action, srcTag }: CommentProps) {
	const urlContext = useUrlContextIdTag()
	if (typeof action.content != 'string') return null

	return (
		<div className={'c-panel ' + (className || '')}>
			<div className="c-panel-header d-flex">
				<Link to={`/profile/${urlContext || HOME_CONTEXT}/${action.issuer.idTag}`}>
					<ProfileCard profile={action.issuer} srcTag={srcTag} />
				</Link>
			</div>
			<div>
				{action.content.split('\n\n').map((paragraph, i) => (
					<p key={i}>
						{paragraph.split('\n').map((line, i) => (
							<React.Fragment key={i}>
								{generateFragments(line).map((n, i) => (
									<React.Fragment key={i}>{n}</React.Fragment>
								))}
								<br />
							</React.Fragment>
						))}
					</p>
				))}
			</div>
		</div>
	)
}

// New Post
function NewComment({
	parentAction,
	className,
	style,
	onSubmit
}: {
	parentAction: ActionView
	className?: string
	style?: React.CSSProperties
	onSubmit?: (action: ActionView) => void
}) {
	const { api } = useApi()
	const [auth] = useAuth()
	const [content, setContent] = React.useState('')
	const editorRef = React.useRef<HTMLDivElement>(null)

	const edit = useEditable(editorRef, onChange)

	React.useEffect(() => {
		editorRef.current?.focus()
	}, [editorRef])

	function onChange(text: string, _pos: Position) {
		setContent(text)
	}

	async function doSubmit() {
		if (!api || !auth?.idTag) return
		editorRef.current?.blur()
		setContent('')
		const action: NewAction = {
			type: 'CMNT',
			content,
			audienceTag: parentAction.audience?.idTag || parentAction.issuer.idTag,
			parentId: parentAction.actionId
		}

		const actionRes = await api.actions.create(action)
		onSubmit?.(actionRes)
	}

	function onKeyDown(e: React.KeyboardEvent) {
		if (e.ctrlKey && e.key == 'Enter') {
			e.preventDefault()
			doSubmit()
		}
	}

	if (!auth?.name || !auth?.idTag) return false

	return (
		<div className={mergeClasses('d-flex', className)} style={style}>
			<ProfilePicture profile={{ profilePic: auth.profilePic }} small />
			<div className="c-panel p-1 flex-row flex-fill">
				<div className="c-input-group">
					<div
						ref={editorRef}
						className="c-input"
						tabIndex={0}
						onKeyDown={onKeyDown}
						onPasteCapture={(e) => handleEditablePaste(e, edit, content)}
					>
						{generateFragments(content).map((n, i) => (
							<React.Fragment key={i}>{n}</React.Fragment>
						))}
					</div>
					<Button
						kind="link"
						variant="primary"
						className="align-self-end m-1"
						onClick={doSubmit}
					>
						<IcSend />
					</Button>
				</div>
			</div>
		</div>
	)
}

function SubComments({
	comments,
	parentId,
	srcTag,
	className,
	register
}: {
	comments: ActionView[]
	parentId: string
	srcTag: string
	className?: string
	// Read-tracker registrar — each comment node reports its createdAt (via
	// `data-read-ts`) so the thread watermark (comments_read_at) advances as
	// comments scroll into view.
	register?: (node: Element | null) => (() => void) | undefined
}) {
	return (
		<div className={mergeClasses('ms-3', className)}>
			{comments
				.filter((action) => action.type == 'CMNT' && action.parentId == parentId)
				.map((action) => (
					<div
						key={action.actionId}
						ref={register}
						data-read-ts={createdAtToSeconds(action.createdAt)}
					>
						<Comment className="mb-1" action={action} srcTag={srcTag} />
					</div>
				))}
		</div>
	)
}

interface CommentsProps {
	parentAction: ActionView
	onCommentsRead?: (read: number) => void
	onCommentAdded?: () => void
	className?: string
	style?: React.CSSProperties
}
type CommentsTokenStatus = 'pending' | 'authenticated' | 'unauthenticated'

function CommentsTrustPrompt({
	audienceIdTag,
	onResolved
}: {
	audienceIdTag: string
	onResolved: () => void
}) {
	const { t } = useTranslation()
	const { setStoredTrust, setSessionTrust } = useProfileTrust()
	const [busy, setBusy] = React.useState(false)
	const [hidden, setHidden] = React.useState(false)

	if (hidden) return null

	async function handleAlways() {
		setBusy(true)
		try {
			await setStoredTrust(audienceIdTag, 'always')
			onResolved()
		} catch (err) {
			console.error('[CommentsTrustPrompt] failed to set always trust:', err)
		} finally {
			setBusy(false)
		}
	}

	function handleJustNow() {
		setSessionTrust(audienceIdTag, 'S')
		onResolved()
	}

	async function handleNever() {
		setBusy(true)
		try {
			await setStoredTrust(audienceIdTag, 'never')
			setHidden(true)
		} catch (err) {
			console.error('[CommentsTrustPrompt] failed to set never trust:', err)
		} finally {
			setBusy(false)
		}
	}

	return (
		<div className="c-panel p-2 mb-2 c-vbox g-1">
			<small>
				{t('Comments are on {{idTag}}. Authenticate to read them?', {
					idTag: audienceIdTag
				})}
			</small>
			<div className="c-hbox g-2">
				<Button variant="primary" size="small" onClick={handleJustNow}>
					{t('Just now')}
				</Button>
				<Button variant="secondary" size="small" onClick={handleAlways} disabled={busy}>
					{t('Always trust')}
				</Button>
				<Button variant="warning" size="small" onClick={handleNever} disabled={busy}>
					{t('Never')}
				</Button>
			</div>
		</div>
	)
}

function Comments({ parentAction, onCommentsRead, onCommentAdded, ...props }: CommentsProps) {
	const { api: contextApi } = useContextAwareApi()
	const { getTokenFor, getClientFor } = useApiContext()
	const contextIdTag = useCurrentContextIdTag()

	const audienceIdTag = parentAction.audience?.idTag || parentAction.issuer.idTag
	const isCrossNode = !!audienceIdTag && audienceIdTag !== contextIdTag
	const isGated = parentAction.visibility !== undefined && parentAction.visibility !== 'P'

	const [audienceApi, setAudienceApi] = React.useState<ApiClient | null>(null)
	const [tokenStatus, setTokenStatus] = React.useState<CommentsTokenStatus>('pending')
	const [tokenRefreshTick, setTokenRefreshTick] = React.useState(0)

	React.useEffect(
		function acquireAudienceApi() {
			if (!isCrossNode || !audienceIdTag) {
				setAudienceApi(null)
				setTokenStatus('authenticated')
				return
			}
			let cancelled = false
			setTokenStatus('pending')
			;(async function () {
				try {
					const tokenResult = await getTokenFor(audienceIdTag)
					if (cancelled) return
					if (tokenResult) {
						const client = getClientFor(audienceIdTag, {
							token: tokenResult.token
						})
						setAudienceApi(client)
						setTokenStatus('authenticated')
					} else {
						const client = getClientFor(audienceIdTag, { auth: 'preferred' })
						setAudienceApi(client)
						setTokenStatus('unauthenticated')
					}
				} catch {
					if (!cancelled) {
						setAudienceApi(null)
						setTokenStatus('unauthenticated')
					}
				}
			})()
			return () => {
				cancelled = true
			}
		},
		[isCrossNode, audienceIdTag, getTokenFor, getClientFor, tokenRefreshTick]
	)

	const readApi = isCrossNode ? audienceApi : contextApi
	const [comments, setComments] = React.useState<ActionView[]>([])

	const showTrustPrompt =
		isCrossNode && !!audienceIdTag && isGated && tokenStatus === 'unauthenticated'

	// Thread comment read-watermark (actions.comments_read_at), seeded from the
	// server value and advanced forward-only via PUT /read-marker { scope:'thread' }.
	const seedReadAt = createdAtToSeconds(parentAction.stat?.commentsReadAt)
	const { readPosition, advanceTo } = useReadMarker(`thread:${parentAction.actionId}`, seedReadAt)

	// Optimistically clear the dot upstream as the watermark advances (forward-only;
	// readPosition only moves forward). Patches stat.commentsReadAt without a refetch.
	const onCommentsReadRef = React.useRef(onCommentsRead)
	React.useEffect(() => {
		onCommentsReadRef.current = onCommentsRead
	}, [onCommentsRead])
	React.useEffect(() => {
		if (readPosition > 0) onCommentsReadRef.current?.(readPosition)
	}, [readPosition])

	React.useEffect(() => {
		if (!readApi) return
		if (showTrustPrompt) return
		let cancelled = false
		;(async function getComments() {
			try {
				const actions = await readApi.actions.list({
					parentId: parentAction.actionId,
					type: 'CMNT'
				})
				if (cancelled) return
				setComments(actions || [])
				// "Opened but didn't scroll" floor: mark the thread read up to the
				// newest loaded comment so the dot clears on open.
				const newest = (actions || []).reduce(
					(max, c) => Math.max(max, createdAtToSeconds(c.createdAt)),
					0
				)
				if (newest > 0) advanceTo(newest)
			} catch (err) {
				console.warn('[Comments] failed to load comments:', err)
			}
		})()
		return function cleanup() {
			cancelled = true
		}
	}, [readApi, parentAction.actionId, showTrustPrompt, advanceTo])

	function onSubmit(action: ActionView) {
		setComments([...comments, action])
		// The user has read their own comment — advance the watermark to it.
		advanceTo(createdAtToSeconds(action.createdAt))
		// Optimistically bump the total count; the authoritative WS STAT reconciles.
		onCommentAdded?.()
	}

	// Advance the thread watermark as comments scroll into view (Pillar B);
	// useReadMarker handles forward-only + throttle + flush-on-leave.
	const { register: registerComment } = useReadPositionTracker({
		enabled: !showTrustPrompt,
		onReach: advanceTo
	})

	return (
		<div {...props}>
			{showTrustPrompt && audienceIdTag && (
				<CommentsTrustPrompt
					audienceIdTag={audienceIdTag}
					onResolved={() => setTokenRefreshTick((n) => n + 1)}
				/>
			)}
			<SubComments
				comments={comments}
				parentId={parentAction.actionId}
				srcTag={audienceIdTag}
				register={registerComment}
			/>
			{!showTrustPrompt && <NewComment parentAction={parentAction} onSubmit={onSubmit} />}
		</div>
	)
}

/////////////////
// Post Action //
/////////////////
export type ActionStat = NonNullable<ActionView['stat']>

interface RepostControlProps {
	// The action to repost (the unwrapped original — never a REPOST itself).
	original: ActionView
	// Open the compose panel in repost mode for this original + target.
	onQuote: (original: ActionView, target: AudienceTarget) => void
}

// Repost affordance for a post's action row. Gated to public, non-own posts;
// opens the unified compose panel in repost mode (empty commentary = boost,
// with text = quote). Undo is handled via the repost's own delete menu.
function RepostControl({ original, onQuote }: RepostControlProps) {
	const { t } = useTranslation()
	const [auth] = useAuth()
	const contextIdTag = useCurrentContextIdTag()
	const { communities } = useCommunitiesList()

	const selfTag = contextIdTag || auth?.idTag
	const ownRepostIds = original.stat?.ownRepostIds
	const hasAnyOwnRepost = !!ownRepostIds && Object.keys(ownRepostIds).length > 0

	// Public-only gate + hide for own posts + require sign-in. The original is
	// always a non-REPOST (callers pass the unwrapped subject), so this single
	// visibility check is sufficient.
	if (!auth?.token || original.visibility !== 'P' || original.issuer.idTag === selfTag) {
		return null
	}

	// Default the compose target to the active context: the current community
	// when acting inside one, otherwise the user's own wall. The
	// AudienceSelector lets the user change it before posting.
	const inCommunity = !!contextIdTag && contextIdTag !== auth?.idTag
	const community = inCommunity ? communities.find((c) => c.idTag === contextIdTag) : undefined
	const defaultTarget: AudienceTarget = inCommunity
		? {
				idTag: contextIdTag as string,
				name: community?.name,
				profilePic: community?.profilePic,
				kind: 'community'
			}
		: {
				idTag: auth?.idTag ?? '',
				name: auth?.name,
				profilePic: auth?.profilePic,
				kind: 'me'
			}

	return (
		<Button
			kind="link"
			variant={hasAnyOwnRepost ? 'primary' : 'secondary'}
			size="small"
			aria-label={t('Repost')}
			aria-pressed={hasAnyOwnRepost}
			onClick={() => onQuote(original, defaultTarget)}
		>
			<IcRepost />
		</Button>
	)
}

interface PostProps {
	className?: string
	action: ActionView
	onPatchStat: (actionId: string, stat: Partial<ActionStat>) => void
	onDelete?: () => void
	hideAudience?: string
	srcTag?: string
	width: number
	onQuote?: (original: ActionView, target: AudienceTarget) => void
}
function Post({
	className,
	action,
	onPatchStat,
	onDelete,
	hideAudience,
	srcTag,
	width,
	onQuote
}: PostProps) {
	const { t } = useTranslation()
	const [auth] = useAuth()
	const { api } = useApi()
	const contextIdTag = useCurrentContextIdTag()
	const urlContext = useUrlContextIdTag()
	// While the post is pending, the file still lives on the issuer's
	// server — it hasn't been replicated to the audience or any other
	// tenant yet. Override every other idTag source for that case.
	const fileIdTag = action.status === 'P' ? action.issuer.idTag : (srcTag ?? contextIdTag)
	const [tab, setTab] = React.useState<undefined | 'CMNT' | 'LIKE' | 'SHRE'>(undefined)
	// Engagement info dialog (who reacted / reposted). `undefined` = closed.
	const [engagementTab, setEngagementTab] = React.useState<string | undefined>(undefined)
	if (typeof action.content != 'string' && action.content !== undefined) return null

	// Repost routing. A REPOST wraps an original (`subjectAction`). A pure boost
	// (no commentary) is a transparent attribution wrapper: engagement targets
	// the original. A quote (has commentary) is first-class content: engagement
	// targets the repost itself.
	const isRepost = action.type === 'REPOST'
	const subjectAction = isRepost ? action.subjectAction : undefined
	const isQuote = isRepost && !!action.content
	const engageIsSubject = isRepost && !isQuote && !!subjectAction
	const engageAction: ActionView = engageIsSubject && subjectAction ? subjectAction : action
	// The action to repost when clicking repost here — always the unwrapped
	// original, so reposts never nest.
	const repostIsSubject = isRepost && !!subjectAction
	const repostOriginal: ActionView = repostIsSubject && subjectAction ? subjectAction : action

	const isProcessingMedia =
		action.subType === 'VIDEO' &&
		!!action.attachments?.some((att) => !hasPlayableVariant(att.localVariants))
	const isInFlight = action.status === 'P' || action.status === 'S' || isProcessingMedia

	function onTabClick(clicked: 'CMNT' | 'LIKE' | 'SHRE') {
		if (clicked == tab) {
			setTab(undefined)
		} else {
			setTab(clicked)
		}
	}

	// Patch the engagement target's stat (the repost itself, or its subject) by
	// engaged action id. The overlay applies the patch to every occurrence of
	// that id in the tree, so standalone and embedded copies stay in sync.
	function patchEngageStat(stat: Partial<ActionStat>) {
		onPatchStat(engageAction.actionId, stat)
	}

	async function onReactClick(reaction: string) {
		if (!api) return
		const stat = engageAction.stat
		const isRemove = reaction === stat?.ownReaction
		const prevReaction = stat?.ownReaction
		const ra: NewAction = {
			type: 'REACT',
			subType: isRemove ? 'DEL' : reaction,
			audienceTag: engageAction.audience?.idTag || engageAction.issuer.idTag,
			subject: engageAction.actionId
		}
		try {
			await api.actions.create(ra)
			let updatedReactions = stat?.reactions || ''
			if (isRemove) {
				updatedReactions = updateReactionCounts(updatedReactions, reaction, -1)
			} else {
				if (prevReaction) {
					updatedReactions = updateReactionCounts(updatedReactions, prevReaction, -1)
				}
				updatedReactions = updateReactionCounts(updatedReactions, reaction, 1)
			}
			patchEngageStat({
				...stat,
				reactions: updatedReactions || undefined,
				ownReaction: isRemove ? undefined : reaction
			})
		} catch (e) {
			console.error('Failed to send reaction', e)
		}
	}

	// `readAt` is the thread read-watermark (epoch seconds); optimistically clear
	// the unread dot by advancing stat.commentsReadAt without a refetch.
	function onCommentsRead(readAt: number) {
		patchEngageStat({ commentsReadAt: readAt })
	}

	// Optimistically bump the total comment count when the reader posts their own
	// comment, so the badge ticks up immediately; the authoritative WS STAT (`c`)
	// reconciles shortly after.
	function onCommentAdded() {
		patchEngageStat({ commentCount: (engageAction.stat?.commentCount ?? 0) + 1 })
	}

	// Unread comment dot: newest comment is newer than the reader's watermark.
	// Pure timestamp comparison, identical on authoritative and mirror nodes.
	// 1s tolerance: lastCommentAt (federated STAT `ct`, whole seconds) and the
	// locally advanced commentsReadAt can differ by rounding; don't let that pin
	// the dot lit.
	const commentUnread =
		createdAtToSeconds(engageAction.stat?.lastCommentAt) >
		createdAtToSeconds(engageAction.stat?.commentsReadAt) + 1
	// Federated total comment count (STAT `c`); the unread state stays a boolean dot.
	const commentCount = engageAction.stat?.commentCount ?? 0
	const commentLabel =
		commentCount > 0
			? commentUnread
				? t('Comments ({{count}}, unread)', { count: commentCount })
				: t('Comments ({{count}})', { count: commentCount })
			: t('Comments')
	const repostCount = engageAction.stat?.reposts ?? 0

	return (
		<>
			{isRepost && (
				<div
					className="c-hbox g-1 align-items-center px-2"
					style={{ fontSize: '0.85rem', opacity: 0.7 }}
				>
					<IcRepost />
					<span>
						{t('Reposted by {{name}}', {
							name: action.issuer.name || action.issuer.idTag
						})}
					</span>
				</div>
			)}
			<div
				className={mergeClasses(
					'c-panel g-2',
					isInFlight && 'c-panel--in-flight',
					className
				)}
			>
				<div className="c-panel-header c-hbox align-items-center g-2">
					{action.audience &&
					action.audience.idTag !== action.issuer.idTag &&
					action.audience.idTag !== hideAudience ? (
						<ProfileAudienceCard
							profile={action.issuer}
							audience={action.audience}
							srcTag={fileIdTag}
							profileBasePath={`/profile/${urlContext || HOME_CONTEXT}`}
						/>
					) : (
						<Link to={`/profile/${urlContext || HOME_CONTEXT}/${action.issuer.idTag}`}>
							<ProfileCard profile={action.issuer} srcTag={fileIdTag} />
						</Link>
					)}
					{isInFlight && (
						<Badge variant="primary" rounded>
							{action.status === 'S'
								? t('Scheduled')
								: isProcessingMedia
									? t('Processing')
									: t('Pending')}
						</Badge>
					)}
					<div className="c-hbox ms-auto g-3">
						<PostMenu action={action} onDelete={onDelete} />
					</div>
				</div>
				<div className="c-hbox align-items-center g-1 c-post-meta">
					{(() => {
						const vis = getVisibilityMeta(t, action.visibility)
						if (!vis) return null
						const VisIcon = vis.icon
						return (
							<>
								<span className="c-post-visibility" title={vis.label}>
									<VisIcon style={{ color: vis.color }} />
									<span>{vis.label}</span>
								</span>
								<span aria-hidden="true">·</span>
							</>
						)
					})()}
					<TimeFormat time={action.createdAt} />
				</div>
				<div className="d-flex flex-column g-2">
					{!!action.content && renderPostContent(action.content)}
					{!isRepost &&
						!!action.attachments?.length &&
						(action.subType === 'VIDEO' ? (
							<Video attachments={action.attachments} idTag={fileIdTag} />
						) : action.subType === 'DOC' ? (
							<Document
								attachments={action.attachments}
								idTag={fileIdTag}
								token={auth?.token}
							/>
						) : (
							<Images
								width={width}
								attachments={action.attachments}
								idTag={fileIdTag}
							/>
						))}
					{isRepost && subjectAction && (
						<EmbeddedPostCard subjectAction={subjectAction} width={width} />
					)}
				</div>
				<div className="c-hbox align-items-center g-2">
					<ReactionPicker
						className="c-reaction-chip"
						ownReaction={engageAction.stat?.ownReaction}
						onReact={onReactClick}
					/>
					<RepostControl
						original={repostOriginal}
						onQuote={(original, target) => onQuote?.(original, target)}
					/>
					<div className="c-hbox ms-auto g-2 align-items-center">
						<Button
							kind="link"
							variant="secondary"
							className={mergeClasses(
								'c-comment-badge-btn',
								tab == 'CMNT' ? 'active' : ''
							)}
							onClick={() => onTabClick('CMNT')}
							aria-label={commentLabel}
							title={commentLabel}
						>
							<CommentBadge count={commentCount} unread={commentUnread} />
						</Button>
						{!!engageAction.stat?.reactions &&
							(() => {
								const parsed = parseReactionCounts(engageAction.stat.reactions)
								const shownSum = parsed.reduce((s, r) => s + r.count, 0)
								const total = totalReactions(engageAction.stat.reactions)
								const overflow = Math.max(0, total - shownSum)
								const label = t('View {{count}} reactions', { count: total })
								return (
									<button
										type="button"
										className="c-reaction-chip-group"
										onClick={() => setEngagementTab('all')}
										aria-label={label}
										title={label}
									>
										{parsed.map((r) => (
											<span key={r.key} className="c-reaction-chip">
												{r.emoji}
												<small>{r.count}</small>
											</span>
										))}
										{overflow > 0 && (
											<span className="c-reaction-chip c-reaction-chip-more">
												<small>+{overflow}</small>
											</span>
										)}
									</button>
								)
							})()}
						{repostCount > 0 && (
							<button
								type="button"
								className="c-reaction-chip c-reaction-chip-btn"
								onClick={() => setEngagementTab('reposts')}
								aria-label={t('View {{count}} reposts', { count: repostCount })}
								title={t('{{count}} reposts', { count: repostCount })}
							>
								<IcRepost />
								<small>{repostCount}</small>
							</button>
						)}
					</div>
				</div>
				{engagementTab !== undefined && (
					<EngagementDialog
						subjectActionId={engageAction.actionId}
						audienceTag={engageAction.audience?.idTag ?? engageAction.issuer.idTag}
						initialTab={engagementTab}
						open={engagementTab !== undefined}
						onClose={() => setEngagementTab(undefined)}
					/>
				)}
			</div>
			{tab == 'CMNT' && (
				<Comments
					parentAction={engageAction}
					onCommentsRead={onCommentsRead}
					onCommentAdded={onCommentAdded}
					className="mt-1"
				/>
			)}
		</>
	)
}

interface ActionCompProps {
	className?: string
	action: ActionEvt
	onPatchStat: (actionId: string, stat: Partial<ActionStat>) => void
	onDelete?: (actionId: string) => void
	hideAudience?: string
	srcTag?: string
	width: number
	onQuote?: (original: ActionView, target: AudienceTarget) => void
}
export const ActionComp = React.memo(function ActionComp({
	className,
	action,
	onPatchStat,
	onDelete,
	hideAudience,
	srcTag,
	width,
	onQuote
}: ActionCompProps) {
	switch (action.type) {
		case 'POST':
		case 'REPOST':
			return (
				<Post
					className={className}
					action={action}
					onPatchStat={onPatchStat}
					onDelete={onDelete ? () => onDelete(action.actionId) : undefined}
					hideAudience={hideAudience}
					srcTag={srcTag}
					width={width}
					onQuote={onQuote}
				/>
			)
	}
})

////////////////////////
// Compose Trigger Bar //
////////////////////////
interface ComposeTriggerProps {
	className?: string
	onOpen: (media?: 'image' | 'camera' | 'video') => void
}

export function ComposeTrigger({ className, onOpen }: ComposeTriggerProps) {
	const { t } = useTranslation()
	const [auth] = useAuth()

	if (!auth?.idTag) return null

	return (
		<div
			className={mergeClasses('c-panel c-hbox g-2 cursor-pointer', className)}
			onClick={() => onOpen()}
		>
			<ProfilePicture profile={{ profilePic: auth.profilePic }} small />
			<div className="flex-fill c-input" style={{ opacity: 0.6, cursor: 'pointer' }}>
				{t("What's on your mind?")}
			</div>
			<div className="c-hbox g-2">
				<Button
					kind="link"
					onClick={(e) => {
						e.stopPropagation()
						onOpen('image')
					}}
				>
					<IcImage />
				</Button>
				<Button
					kind="link"
					onClick={(e) => {
						e.stopPropagation()
						onOpen('camera')
					}}
				>
					<IcCamera />
				</Button>
				<Button
					kind="link"
					onClick={(e) => {
						e.stopPropagation()
						onOpen('video')
					}}
				>
					<IcVideo />
				</Button>
			</div>
		</div>
	)
}

export type SourceFilter =
	| 'all'
	| 'mine'
	| 'direct'
	| 'people'
	| 'communities'
	| 'public'
	| 'following'

interface SourceOption {
	value: SourceFilter
	label: string
	icon: React.ComponentType
}

function getSourceFilters(t: TFunction, isOwnContext: boolean): SourceOption[] {
	if (isOwnContext) {
		return [
			{ value: 'all', label: t('All'), icon: IcAll },
			{ value: 'mine', label: t('Mine'), icon: IcMine },
			{ value: 'direct', label: t('Direct'), icon: IcDirect },
			{ value: 'people', label: t('People'), icon: IcPeople },
			{ value: 'communities', label: t('Communities'), icon: IcCommunities },
			{ value: 'public', label: t('Public'), icon: IcPublic },
			{ value: 'following', label: t('Following'), icon: IcFollowing }
		]
	}
	return [
		{ value: 'all', label: t('All'), icon: IcAll },
		{ value: 'mine', label: t('Mine'), icon: IcMine },
		{ value: 'following', label: t('Following'), icon: IcFollowing }
	]
}

interface FilterBarProps {
	viewMode: 'unread' | 'feed' | 'drafts'
	onViewSelect: (v: 'unread' | 'drafts') => void
	ctxUnread: number
	isOwnContext: boolean
	sourceFilter: SourceFilter
	onSourceChange: (source: SourceFilter) => void
	narrowToCommunity: string | undefined
	onNarrowToCommunityChange: (idTag: string | undefined) => void
	communities: CommunityRef[]
	searchQuery: string | undefined
	onSearchChange: (query: string | undefined) => void
	tagFilter: string | undefined
	onTagChange: (tag: string | undefined) => void
	tags: string[]
}

const FilterBar = React.memo(function FilterBar({
	viewMode,
	onViewSelect,
	ctxUnread,
	isOwnContext,
	sourceFilter,
	onSourceChange,
	narrowToCommunity,
	onNarrowToCommunityChange,
	communities,
	searchQuery,
	onSearchChange,
	tagFilter,
	onTagChange,
	tags
}: FilterBarProps) {
	const { t } = useTranslation()
	const [searchInput, setSearchInput] = React.useState(searchQuery || '')
	const debounceRef = React.useRef<ReturnType<typeof setTimeout>>(undefined)

	function handleSearchInput(e: React.ChangeEvent<HTMLInputElement>) {
		const value = e.target.value
		setSearchInput(value)
		if (debounceRef.current) clearTimeout(debounceRef.current)
		debounceRef.current = setTimeout(() => {
			onSearchChange(value || undefined)
		}, 300)
	}

	React.useEffect(function cleanup() {
		return () => {
			if (debounceRef.current) clearTimeout(debounceRef.current)
		}
	}, [])

	const sourceOptions = getSourceFilters(t, isOwnContext)

	return (
		<div className="c-vbox pt-2">
			{/* Search */}
			<div className="c-input-group px-2 py-1">
				<span className="c-input-suffix">
					<IcSearch />
				</span>
				<input
					type="text"
					className="c-input"
					placeholder={t('Search posts...')}
					value={searchInput}
					onChange={handleSearchInput}
				/>
			</div>

			<hr className="w-100" />

			{/* Source filter — read-state view (Unread) + content sources */}
			<ul className="c-nav vertical low">
				<li className="c-nav-item">
					<span className="c-nav-link text-muted">{t('Source')}</span>
				</li>
				{/* Unread is an all-source, read-state view. */}
				<li>
					<a
						className={mergeClasses(
							'c-nav-item ps-4',
							viewMode === 'unread' && 'active'
						)}
						onClick={(e) => {
							e.preventDefault()
							onViewSelect('unread')
						}}
					>
						<IcUnread />
						{t('Unread')}
						{ctxUnread > 0 && (
							<span
								className="c-badge dot accent ms-1"
								role="status"
								aria-label={t('New content')}
							/>
						)}
					</a>
				</li>
				{sourceOptions.map((opt) => (
					<React.Fragment key={opt.value}>
						<li>
							<a
								className={mergeClasses(
									'c-nav-item ps-4',
									viewMode === 'feed' &&
										sourceFilter === opt.value &&
										!(opt.value === 'communities' && narrowToCommunity) &&
										'active'
								)}
								onClick={(e) => {
									e.preventDefault()
									onSourceChange(opt.value)
								}}
							>
								<opt.icon />
								{opt.value === 'all' ? t('Feed') : opt.label}
							</a>
						</li>
						{opt.value === 'communities' &&
							viewMode === 'feed' &&
							sourceFilter === 'communities' &&
							communities.map((c) => (
								<li key={c.idTag}>
									<a
										className={mergeClasses(
											'c-nav-item ps-5',
											narrowToCommunity === c.idTag && 'active'
										)}
										onClick={(e) => {
											e.preventDefault()
											onNarrowToCommunityChange(c.idTag)
										}}
									>
										<ProfilePicture
											profile={{ profilePic: c.profilePic }}
											srcTag={c.idTag}
											small
										/>
										{c.name}
									</a>
								</li>
							))}
					</React.Fragment>
				))}
				<li>
					<hr className="w-100" />
				</li>
				{/* Drafts — separate composing view below the source list. */}
				<li>
					<a
						className={mergeClasses(
							'c-nav-item ps-4',
							viewMode === 'drafts' && 'active'
						)}
						onClick={(e) => {
							e.preventDefault()
							onViewSelect('drafts')
						}}
					>
						<IcDraft />
						{t('Drafts')}
					</a>
				</li>
			</ul>

			{/* Tag cloud */}
			{tags.length > 0 && (
				<>
					<hr className="w-100" />
					<div className="c-nav vertical low">
						<span className="c-nav-link text-muted">
							<IcTag /> {t('Tags')}
							{tagFilter && (
								<Button
									className="ms-auto"
									size="small"
									onClick={() => onTagChange(undefined)}
								>
									{t('Clear')}
								</Button>
							)}
						</span>
					</div>
					<div className="d-flex flex-wrap g-1 px-2">
						{tags.map((tag) => (
							<button
								key={tag}
								type="button"
								className={mergeClasses('c-tag', tagFilter === tag && 'accent')}
								onClick={() => onTagChange(tagFilter === tag ? undefined : tag)}
							>
								#{tag}
							</button>
						))}
					</div>
				</>
			)}
		</div>
	)
})

interface SourceQueryParams {
	audienceType?: 'personal' | 'community'
	visibility?: string | string[]
	audience?: string
	issuer?: string
	subscribed?: boolean
}

function sourceToQuery(
	source: SourceFilter,
	myIdTag: string | undefined,
	narrowToCommunity: string | undefined
): SourceQueryParams {
	switch (source) {
		case 'all':
			return {}
		case 'mine':
			// No audienceType filter — show issuer's posts across all audiences (personal + community).
			return myIdTag ? { issuer: myIdTag } : {}
		case 'direct':
			return { audienceType: 'personal', visibility: 'D' }
		case 'people':
			// Broadcasts from individuals — Followers + Connected.
			// Backend must accept multi-value visibility (see api-types.ts).
			return { audienceType: 'personal', visibility: ['F', 'C'] }
		case 'communities':
			return { audienceType: 'community', audience: narrowToCommunity }
		case 'public':
			return { visibility: 'P' }
		case 'following':
			return { subscribed: true }
	}
}

export function FeedApp() {
	const location = useLocation()
	const { t } = useTranslation()
	const { api } = useApi()
	const [auth] = useAuth()
	const contextIdTag = useCurrentContextIdTag()
	const [showFilter, setShowFilter] = React.useState<boolean>(false)
	const [viewMode, setViewMode] = React.useState<'unread' | 'feed' | 'drafts'>('feed')
	const [sourceFilter, setSourceFilter] = React.useState<SourceFilter>('all')
	const [narrowToCommunity, setNarrowToCommunity] = React.useState<string | undefined>()
	const [searchQuery, setSearchQuery] = React.useState<string | undefined>()
	const [tagFilter, setTagFilter] = React.useState<string | undefined>()
	const { communities } = useCommunitiesList()
	const [composeOpen, setComposeOpen] = React.useState(false)
	const [editingDraft, setEditingDraft] = React.useState<ActionView | undefined>()
	const [quoteAction, setQuoteAction] = React.useState<ActionView | undefined>()
	const [quoteTarget, setQuoteTarget] = React.useState<AudienceTarget | undefined>()
	const [composeMedia, setComposeMedia] = React.useState<
		'image' | 'camera' | 'video' | undefined
	>()
	const [pendingQuote, setPendingQuote] = useAtom(pendingQuoteAtom)
	const widthRef = React.useRef<HTMLDivElement>(null)
	const [width, setWidth] = React.useState(0)
	// The real scroll container (Fcd.Content's inner .c-fcd-content-scroll div),
	// captured via callback ref so the read-marker primitives watch it instead of
	// window (the Fcd tree is h-100, so window never scrolls).
	const [scrollEl, setScrollEl] = React.useState<HTMLDivElement | null>(null)

	// Determine audience for feed (undefined for own context, contextIdTag for community)
	const isOwnContext = !contextIdTag || contextIdTag === auth?.idTag
	const audience = isOwnContext ? undefined : contextIdTag
	// All feeds — home, community, profile — order and track reads by ingestion
	// time (received_at) so a late-federated post (old author time, recent
	// arrival) surfaces at the top and is correctly unread everywhere, not just
	// on the home feed. The backend wires `sort=received` end-to-end (list,
	// keyset cursor, created_after range, unread-count).

	// Home feed only: idTags of communities the reader opted out of home ("Show
	// in Home" off). Used to drop their live WS arrivals (paginated fetches are
	// already filtered server-side by `exclude_audiences`). Undefined elsewhere.
	const hiddenHomeAudiences = React.useMemo(
		() =>
			isOwnContext
				? new Set(communities.filter((c) => c.showInHome === false).map((c) => c.idTag))
				: undefined,
		[isOwnContext, communities]
	)

	// Reset source filter when switching context (e.g. don't carry 'communities'
	// into a community context where it's invalid).
	React.useEffect(() => {
		setSourceFilter('all')
		setNarrowToCommunity(undefined)
	}, [contextIdTag])

	// Feed read-position watermark for this context (Pillar A). The watermark is
	// seeded from the context profile's feedReadAt by the global probe (which
	// already fetches every context's profile at the layout level), so FeedApp no
	// longer re-fetches it here — it just reads readPositionAtom via useReadMarker.
	// Each surface has ONE fully-independent watermark: home/personal feeds key off
	// the own idTag; community/profile contexts key off their contextIdTag. Reading
	// in home never advances a community marker and vice versa. `contextIdTag`
	// already resolves to the own idTag for home, but fall back explicitly.
	const ownIdTag = auth?.idTag ?? ''
	const feedScopeKey = `feed:${contextIdTag || ownIdTag || ''}`
	const { readPosition, advanceTo, markReadNow } = useReadMarker(feedScopeKey)
	const unreadCounts = useAtomValue(unreadCountAtom)
	const setUnreadCounts = useSetAtom(unreadCountAtom)
	const ctxKey = contextIdTag ?? ''
	const ctxUnread = unreadCounts[ctxKey] ?? 0
	// The probe marks an entity ready once its profile has been fetched and the
	// watermark seeded; bootstrap waits on this so it can distinguish "server
	// confirmed no watermark" from "still loading".
	const seedReady = useAtomValue(feedSeedLoadedAtom)[ctxKey] ?? false

	// First-run bootstrap: nothing ever seeds the very first watermark, so a fresh
	// context would have feedReadAt = null → since = 0 → no unread is ever counted
	// and the Unread tab can never be scrolled to advance it (chicken-and-egg).
	// Once the probe confirms no watermark (seedReady && readPosition === 0), seed
	// it to a week ago so recent posts surface as unread and a real marker gets
	// persisted.
	const bootstrapRef = React.useRef<string | null>(null)
	React.useEffect(() => {
		const ctx = contextIdTag ?? ''
		if (!ctx) return
		if (!seedReady) return // probe result still loading
		if (bootstrapRef.current === ctx) return // already handled this context
		bootstrapRef.current = ctx
		if (readPosition > 0) return // already has a watermark
		advanceTo(nowSeconds() - INITIAL_UNREAD_WINDOW_SEC)
	}, [contextIdTag, seedReady, readPosition, advanceTo])

	// One-shot auto-select of the Unread tab per context. It waits until the
	// watermark and a probe result are both in hand (both load asynchronously),
	// then switches feed→unread exactly once; never yanks the user afterwards.
	const viewModeSetRef = React.useRef<string | null>(null)
	// Set once the user manually changes the view (tab/source); suppresses the
	// one-shot auto-switch so a manual click during the async load isn't yanked.
	const userTouchedViewRef = React.useRef(false)
	React.useEffect(() => {
		viewModeSetRef.current = null
		userTouchedViewRef.current = false
	}, [contextIdTag])
	React.useEffect(() => {
		if (userTouchedViewRef.current) return
		if (viewModeSetRef.current === ctxKey) return
		if (readPosition > 0 && ctxUnread > 0) {
			viewModeSetRef.current = ctxKey
			setViewMode((m) => (m === 'feed' ? 'unread' : m))
		}
	}, [ctxKey, readPosition, ctxUnread])

	// Snapshot the watermark when the Unread tab opens. The list is fetched from
	// this fixed boundary, while reading advances the live `readPosition` (which
	// drives the dot) — so the list doesn't refetch and reshuffle under the user
	// as they read. Re-snapshots on re-entry (showing only newly-unread) and on
	// context switch.
	const [unreadSince, setUnreadSince] = React.useState(0)
	React.useEffect(() => {
		setUnreadSince(0)
	}, [contextIdTag])
	React.useEffect(() => {
		if (viewMode !== 'unread') {
			if (unreadSince !== 0) setUnreadSince(0)
			return
		}
		if (unreadSince === 0 && readPosition > 0) {
			// Freeze the boundary at entry so reads done WHILE scrolling this tab
			// don't reshuffle the pinned list (the list is fetched from `since`).
			setUnreadSince(readPosition)
		}
	}, [viewMode, readPosition, unreadSince])

	// Map the source filter into backend query parameters.
	const sourceQuery = React.useMemo(
		() => sourceToQuery(sourceFilter, auth?.idTag, narrowToCommunity),
		[sourceFilter, auth?.idTag, narrowToCommunity]
	)

	// Merge: `audience` from context wins for community context, but a
	// per-community narrow from sourceQuery (only set when source=communities
	// in personal context) is still applied.
	const effectiveAudience = audience ?? sourceQuery.audience

	// Use infinite scroll hook for feed
	const {
		posts: feed,
		isLoading,
		isLoadingMore,
		error,
		hasMore,
		loadMore,
		sentinelRef,
		newPostsCount,
		showNewPosts,
		addPost
	} = useFeedPosts({
		audience: effectiveAudience,
		audienceType: sourceQuery.audienceType,
		tag: tagFilter,
		search: searchQuery,
		visibility: sourceQuery.visibility,
		issuer: sourceQuery.issuer,
		subscribed: sourceQuery.subscribed,
		sort: 'received',
		hiddenAudiences: hiddenHomeAudiences,
		enabled: !!api?.idTag
	})

	// Unread (chronological, oldest-first) feed for the Unread tab.
	const {
		posts: unreadPosts,
		isLoading: isUnreadLoading,
		isLoadingMore: isUnreadLoadingMore,
		error: unreadError,
		hasMore: unreadHasMore,
		loadMore: loadMoreUnread,
		sentinelRef: unreadSentinelRef
	} = useUnreadPosts({
		since: unreadSince,
		audience: effectiveAudience,
		audienceType: sourceQuery.audienceType,
		tag: tagFilter,
		search: searchQuery,
		visibility: sourceQuery.visibility,
		issuer: sourceQuery.issuer,
		sort: 'received',
		hiddenAudiences: hiddenHomeAudiences,
		enabled: !!api?.idTag && viewMode === 'unread' && unreadSince > 0
	})

	// Scroll-engagement gates: the watermark only advances after the user has
	// actively scrolled down once (never from passively landing on the view).
	const { engagedRef: unreadEngagedRef, reset: resetUnreadEngaged } = useScrollEngaged(
		viewMode === 'unread',
		scrollEl
	)
	// Re-arm the gate on context switch (the view may stay mounted across it).
	React.useEffect(() => {
		resetUnreadEngaged()
	}, [contextIdTag, resetUnreadEngaged])

	// A post is read iff its received-time is at/below this context's single
	// watermark. Each surface (home + each community) has one fully-independent
	// marker — `readPosition` IS the home watermark on home, the community marker in
	// a community context — so no cross-scope reconciliation is needed.
	const isRead = React.useCallback(
		(post: ActionView) => {
			// The reader's own posts are always "read" — never surface your own
			// content as unread (dot / divider / "Caught up").
			if (ownIdTag && post.issuer?.idTag === ownIdTag) return true
			return feedReadTs(post) <= readPosition
		},
		[ownIdTag, readPosition]
	)

	// Unread list (oldest→newest): advance the watermark as posts scroll off the
	// TOP of the viewport, gated by the engagement flag so merely landing on a
	// view never advances it.
	const { register: registerReadTracker } = useReadPositionTracker({
		enabled: viewMode === 'unread',
		onReach: advanceTo,
		mode: 'above',
		engagedRef: unreadEngagedRef,
		root: scrollEl
	})
	// Feed list (newest→oldest): advance the watermark one post at a time as the
	// user scrolls UP and each new post scrolls fully out the BOTTOM edge. Scrolling
	// down to the divider pushes posts off the top (not counted), so the marker
	// never jumps to newest on a small nudge. No engagement gate needed — only an
	// upward scroll can move a previously-seen post out the bottom.
	const { register: registerFeedTracker } = useReadPositionTracker({
		enabled: viewMode === 'feed',
		onReach: advanceTo,
		mode: 'below',
		root: scrollEl
	})

	// Extract hashtags from loaded feed posts for tag cloud
	const feedTags = React.useMemo(() => {
		const tagCounts = new Map<string, number>()
		for (const post of feed) {
			if (typeof post.content !== 'string') continue
			const matches = post.content.match(/#[\p{L}\p{N}_]+/gu)
			if (!matches) continue
			for (const match of matches) {
				const tag = match.slice(1)
				tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1)
			}
		}
		return [...tagCounts.entries()]
			.sort((a, b) => b[1] - a[1])
			.map(([tag]) => tag)
			.slice(0, 20)
	}, [feed])

	// Local state for post updates (reactions, comments, etc.)
	const [feedUpdates, setFeedUpdates] = React.useState<Record<string, Partial<ActionEvt>>>({})

	// Stat overlay keyed by ENGAGED action id (= WS STAT parentId / optimistic
	// target). Applied to every occurrence of that id in the tree — top-level
	// post OR a repost's subjectAction — so one update refreshes all copies.
	// WS STAT writes only count fields; optimistic writers add per-user fields.
	const [statOverlay, setStatOverlay] = React.useState<Record<string, Partial<ActionStat>>>({})

	const patchStat = React.useCallback((actionId: string, stat: Partial<ActionStat>) => {
		setStatOverlay((prev) => ({
			...prev,
			[actionId]: { ...(prev[actionId] ?? {}), ...stat }
		}))
	}, [])

	// Ref mirror of the feed so the WS callback can read current ids without
	// being trapped by a stale closure.
	const feedRef = React.useRef<ActionView[]>(feed)
	feedRef.current = feed

	// Track deleted post IDs for optimistic removal (cleared on feed reset)
	const [deletedIds, setDeletedIds] = React.useState<Set<string>>(new Set())

	// Clear deleted IDs when feed filters change (feed resets).
	// `narrowToCommunity` is covered by `effectiveAudience` (which derives
	// from sourceQuery, which keys on narrowToCommunity), so listing both
	// would double-count.
	React.useEffect(() => {
		setDeletedIds(new Set())
	}, [effectiveAudience, tagFilter, searchQuery, sourceFilter])

	React.useEffect(
		function onLocationEffect() {
			setShowFilter(false)
		},
		[location]
	)

	// Handle STAT and POST updates from WebSocket
	useWsBus({ cmds: ['ACTION'] }, function handleAction(msg) {
		const action = msg.data as ActionView

		if (action.type === 'STAT') {
			const tStatContent = T.struct({
				r: T.optional(T.string),
				c: T.optional(T.number),
				ct: T.optional(T.number),
				rp: T.optional(T.number)
			})
			const contentRes = T.decode(tStatContent, action.content)
			if (!T.isOk(contentRes)) return
			const content = contentRes.ok
			// Write only federated fields to the engaged-id overlay, keyed directly
			// by parentId (no feed lookup — the engaged action may only exist
			// nested as a repost's subjectAction, never as a top-level entry).
			// `c` is the comment count; `ct` is the last-comment timestamp (overlaid
			// as lastCommentAt so the dot updates live). Never touch
			// ownReaction/commentsReadAt/ownRepostIds, so optimistic per-user fields
			// under the same key survive an incoming STAT.
			setStatOverlay((prev) => {
				const parentId = action.parentId!
				return {
					...prev,
					[parentId]: {
						...(prev[parentId] ?? {}),
						reactions: content.r,
						commentCount: content.c,
						lastCommentAt: content.ct,
						reposts: content.rp
					}
				}
			})
			return
		}

		if (action.type === 'POST') {
			const inFeed = feedRef.current.some((p) => p.actionId === action.actionId)
			if (!inFeed) return
			setFeedUpdates((prev) => ({
				...prev,
				[action.actionId]: {
					...(prev[action.actionId] ?? {}),
					attachments: action.attachments,
					subType: action.subType
					// intentionally NOT merging status — the issuer flips
					// to 'A' before federation completes; flipping locally
					// would prematurely route URLs to the audience tenant
					// that hasn't replicated the file yet. Stays 'P' until
					// the feed refetches from the audience.
				}
			}))
		}
	})

	React.useLayoutEffect(
		function () {
			if (!widthRef.current) return

			function measureWidth() {
				if (!widthRef.current) return
				// Find the first c-panel inside to measure its padding
				const panel = widthRef.current.querySelector('.c-panel')
				if (panel) {
					const styles = getComputedStyle(panel)
					const w =
						panel.clientWidth -
						parseInt(styles.paddingLeft || '0', 10) -
						parseInt(styles.paddingRight || '0', 10)
					setWidth((prev) => (w > 0 ? w : prev))
				} else {
					// Fallback: use container width
					const w = widthRef.current.clientWidth
					setWidth((prev) => (w > 0 ? w : prev))
				}
			}

			// Use ResizeObserver for reliable width tracking
			const resizeObserver = new ResizeObserver(measureWidth)
			resizeObserver.observe(widthRef.current)

			// Initial measurement
			measureWidth()

			return function () {
				resizeObserver.disconnect()
			}
		},
		[composeOpen, viewMode]
	)

	// Merge feed posts with local updates, filtering out deleted posts.
	// The engaged-id stat overlay is layered onto every occurrence of an id in
	// the tree (top-level post AND a repost's subjectAction), merging federated
	// fields while preserving per-user fields (ownReaction/commentsReadAt/
	// ownRepostIds) that a pure STAT update doesn't carry. The POST
	// branch of `feedUpdates` carries only attachment/subType overlays.
	const mergedFeed = React.useMemo(() => {
		// Layer the engaged-id stat overlay onto one action.
		function applyStatOverlay(a: ActionView): ActionView {
			const o = statOverlay[a.actionId]
			if (!o) return a
			return { ...a, stat: { ...a.stat, ...o } }
		}

		return feed
			.filter((post) => !deletedIds.has(post.actionId))
			.map((post) => {
				// POST overlay (attachments/subType), top-level only.
				const update = feedUpdates[post.actionId]
				const base = update ? ({ ...post, ...update } as ActionView) : post
				// Stat overlay applied to the top-level action AND its subjectAction.
				const withSelf = applyStatOverlay(base)
				if (withSelf.subjectAction) {
					const subj = applyStatOverlay(withSelf.subjectAction)
					if (subj !== withSelf.subjectAction) {
						return { ...withSelf, subjectAction: subj } as ActionEvt
					}
				}
				return withSelf as ActionEvt
			})
	}, [feed, feedUpdates, statOverlay, deletedIds])

	// Divider position: the top of the contiguous fully-read TAIL. The reader's own
	// posts are force-read (issuer === ownIdTag short-circuit) and can sit read
	// interleaved among unread posts, so a naive "first read post from the top"
	// boundary mis-positions. Walk newest→oldest and find where the all-read suffix
	// begins: everything below the divider is guaranteed read; everything above
	// contains all the unread (plus possibly a few force-read own posts interleaved).
	const dividerIndex = React.useMemo(() => {
		let divider = mergedFeed.length
		for (let i = mergedFeed.length - 1; i >= 0; i--) {
			if (isRead(mergedFeed[i])) divider = i
			else break
		}
		// 0 = everything read (nothing unread above) or length = no read tail:
		// neither is a real mid-list boundary.
		return divider === 0 || divider === mergedFeed.length ? -1 : divider
	}, [mergedFeed, isRead])

	// True when any currently-loaded feed post is still unread by this context's
	// watermark — keeps the "Caught up" pill in sync with the divider.
	const hasUnreadLoaded = React.useMemo(
		() => mergedFeed.some((p) => !isRead(p)),
		[mergedFeed, isRead]
	)

	// Newest post timestamp currently loaded in the active feed view.
	const newestLoadedTs = React.useMemo(() => {
		const list = viewMode === 'unread' ? unreadPosts : mergedFeed
		let newest = 0
		for (const p of list) {
			const ts = feedReadTs(p)
			if (ts > newest) newest = ts
		}
		return newest
	}, [viewMode, unreadPosts, mergedFeed])

	// Explicit "mark everything loaded as read" — wired to the bottom-of-Unread
	// button and the top-of-Feed "Caught up" pill. Advances only THIS context's
	// watermark (home advances home; a community advances that community — fully
	// independent) and optimistically clears its unread dot (the global probe's
	// `since` lags until the marker persists).
	const markAllRead = React.useCallback(() => {
		if (newestLoadedTs <= 0) return
		// Explicit user action: persist the watermark immediately (forced write,
		// not subject to the throttle or the forward-only write-skip) and clear
		// the dot. Re-snapshot the Unread boundary so the now-read posts clear to
		// the "all caught up" empty state instead of lingering on the pinned list.
		markReadNow(newestLoadedTs)
		setUnreadCounts((prev) => (prev[ctxKey] ? { ...prev, [ctxKey]: 0 } : prev))
		if (viewMode === 'unread') setUnreadSince(newestLoadedTs)
	}, [newestLoadedTs, markReadNow, setUnreadCounts, ctxKey, viewMode])

	// Optimistic dot clear: as scroll-driven reading advances the watermark to (or
	// past) the newest loaded post, drop the context's unread count to 0 so the
	// nav/sidebar dot disappears immediately instead of waiting for the next probe.
	React.useEffect(() => {
		if (newestLoadedTs > 0 && readPosition >= newestLoadedTs) {
			setUnreadCounts((prev) => (prev[ctxKey] ? { ...prev, [ctxKey]: 0 } : prev))
		}
	}, [readPosition, newestLoadedTs, ctxKey, setUnreadCounts])

	const onSubmit = React.useCallback(
		function onSubmit(action: ActionEvt) {
			addPost(action)
			// A boost no longer patches the original's stat inline, so overlay the
			// subject's reposts count + ownRepostIds here. `subjectAction` (the
			// pre-repost original) carries the prior stat; `patchStat` propagates
			// the overlay to both the top-level original and any embedding.
			if (action.type === 'REPOST' && action.subject) {
				const prevReposts = action.subjectAction?.stat?.reposts ?? 0
				patchStat(action.subject, {
					reposts: prevReposts + 1,
					ownRepostIds: {
						...action.subjectAction?.stat?.ownRepostIds,
						[action.audience?.idTag ?? auth?.idTag ?? '']: action.actionId
					}
				})
			}
		},
		[addPost, patchStat, auth?.idTag]
	)

	const onDelete = React.useCallback(function onDelete(actionId: string) {
		setDeletedIds((prev) => new Set(prev).add(actionId))
	}, [])

	function handleComposeOpen(media?: 'image' | 'camera' | 'video') {
		setComposeMedia(media)
		setEditingDraft(undefined)
		setQuoteAction(undefined)
		setQuoteTarget(undefined)
		setComposeOpen(true)
	}

	const handleQuote = React.useCallback(function handleQuote(
		original: ActionView,
		target: AudienceTarget
	) {
		setComposeMedia(undefined)
		setEditingDraft(undefined)
		setQuoteAction(original)
		setQuoteTarget(target)
		setViewMode('feed')
		setComposeOpen(true)
	}, [])

	// Consume a cross-page quote intent (e.g. set by a profile page repost) so
	// the feed composer opens in quote mode. One-shot: cleared after handling so
	// navigating back doesn't re-trigger it.
	React.useEffect(() => {
		if (!pendingQuote) return
		handleQuote(pendingQuote.original, pendingQuote.target)
		setPendingQuote(undefined)
	}, [pendingQuote, handleQuote, setPendingQuote])

	function handleComposeClose() {
		setComposeOpen(false)
		setComposeMedia(undefined)
		setEditingDraft(undefined)
		setQuoteAction(undefined)
		setQuoteTarget(undefined)
	}

	function handleViewSelect(v: 'unread' | 'drafts') {
		userTouchedViewRef.current = true
		if (v === 'unread') {
			// Unread is an all-source, read-state view.
			setViewMode('unread')
			setSourceFilter('all')
			setNarrowToCommunity(undefined)
		} else {
			setViewMode('drafts')
			setComposeOpen(false)
			setEditingDraft(undefined)
		}
	}

	function handleEditDraft(draft: ActionView) {
		setEditingDraft(draft)
		setComposeOpen(true)
		setViewMode('feed')
	}

	function handleDraftPublished(action: ActionView) {
		addPost(action)
		setViewMode('feed')
	}

	return (
		<Fcd.Container className="g-1">
			<Fcd.Filter isVisible={showFilter} hide={() => setShowFilter(false)}>
				{!!auth && (
					<FilterBar
						viewMode={viewMode}
						onViewSelect={handleViewSelect}
						ctxUnread={ctxUnread}
						isOwnContext={isOwnContext}
						sourceFilter={sourceFilter}
						onSourceChange={(s) => {
							userTouchedViewRef.current = true
							setViewMode('feed')
							setSourceFilter(s)
							setNarrowToCommunity(undefined)
						}}
						narrowToCommunity={narrowToCommunity}
						onNarrowToCommunityChange={setNarrowToCommunity}
						communities={communities}
						searchQuery={searchQuery}
						onSearchChange={setSearchQuery}
						tagFilter={tagFilter}
						onTagChange={setTagFilter}
						tags={feedTags}
					/>
				)}
			</Fcd.Filter>
			<Fcd.Content
				ref={setScrollEl}
				header={
					<div className="c-hbox align-items-center g-2 p-2">
						<Button
							kind="link"
							className="md-hide lg-hide"
							onClick={() => setShowFilter(true)}
						>
							<IcFilter />
						</Button>
					</div>
				}
			>
				{!!auth && !composeOpen && (
					<ComposeTrigger className="col" onOpen={handleComposeOpen} />
				)}
				{!!auth && (
					<ComposePanel
						open={composeOpen}
						onClose={handleComposeClose}
						onSubmit={onSubmit}
						idTag={contextIdTag !== auth?.idTag ? contextIdTag : undefined}
						initialMedia={composeMedia}
						draft={editingDraft}
						quotedAction={quoteAction}
						target={quoteTarget}
						ownRepostIds={quoteAction?.stat?.ownRepostIds}
						audiencePicker
						className="col"
					/>
				)}
				{!composeOpen && viewMode === 'unread' && (
					<div ref={widthRef} className="c-vbox g-1">
						{isUnreadLoading && unreadPosts.length === 0 ? (
							<div className="c-vbox g-2 p-2">
								<SkeletonCard showAvatar lines={3} />
								<SkeletonCard showAvatar showImage lines={2} />
							</div>
						) : unreadPosts.length === 0 && !unreadHasMore ? (
							<EmptyState
								icon={<IcAll style={{ fontSize: '2.5rem' }} />}
								title={t("You're all caught up.")}
								description={t('No new posts since your last visit.')}
							/>
						) : (
							<>
								{unreadPosts.map((post) => (
									<div
										key={post.actionId}
										ref={registerReadTracker}
										data-read-ts={feedReadTs(post)}
									>
										<ActionComp
											action={post}
											onPatchStat={patchStat}
											onDelete={onDelete}
											hideAudience={
												!isOwnContext ? contextIdTag : narrowToCommunity
											}
											width={width}
											onQuote={handleQuote}
										/>
									</div>
								))}
								<LoadMoreTrigger
									ref={unreadSentinelRef}
									isLoading={isUnreadLoadingMore}
									hasMore={unreadHasMore}
									error={unreadError}
									onRetry={loadMoreUnread}
									loadingLabel={t('Loading more posts...')}
									retryLabel={t('Retry')}
									errorPrefix={t('Failed to load:')}
								/>
								{!unreadHasMore && (
									<div className="c-hbox justify-content-center p-2">
										<Button variant="primary" onClick={markAllRead}>
											{t('Mark all as read')}
										</Button>
									</div>
								)}
							</>
						)}
					</div>
				)}
				{!composeOpen && viewMode === 'drafts' && (
					<DraftsPanel onEdit={handleEditDraft} onPublished={handleDraftPublished} />
				)}
				{!composeOpen && viewMode === 'feed' && newPostsCount > 0 && (
					<NewPostsBanner count={newPostsCount} onClick={showNewPosts} className="my-2" />
				)}
				{!composeOpen && viewMode === 'feed' && (
					<div ref={widthRef} className="c-vbox g-1">
						{isLoading && feed.length === 0 ? (
							<div className="c-vbox g-2 p-2">
								<SkeletonCard showAvatar showImage lines={2} />
								<SkeletonCard showAvatar lines={3} />
								<SkeletonCard showAvatar showImage lines={2} />
							</div>
						) : mergedFeed.length === 0 ? (
							<EmptyState
								icon={<IcAll style={{ fontSize: '2.5rem' }} />}
								title={t('No posts yet')}
								description={
									sourceFilter === 'mine'
										? t("You haven't posted anything yet.")
										: sourceFilter === 'direct'
											? t('No direct messages yet.')
											: sourceFilter === 'people'
												? t(
														'No posts from people you follow yet — try following someone or switch to All.'
													)
												: sourceFilter === 'communities'
													? t('No posts in your communities yet.')
													: sourceFilter === 'public'
														? t('No public posts to show.')
														: t(
																'Be the first to share something with your community!'
															)
								}
							/>
						) : (
							<>
								{(dividerIndex > 0 || hasUnreadLoaded) && (
									<div className="c-hbox justify-content-center pb-1">
										<Button kind="link" variant="primary" onClick={markAllRead}>
											{t('Caught up')} ✓
										</Button>
									</div>
								)}
								{mergedFeed.map((action, i) => (
									<React.Fragment key={action.actionId}>
										{/* Suppress the divider at index 0 (nothing unread above
										    it) and at -1 (no in-list boundary: all read or all
										    unread); only render it as a real mid-list boundary. */}
										{i === dividerIndex && i > 0 && <ReadDivider />}
										<div
											ref={registerFeedTracker}
											data-read-ts={feedReadTs(action)}
										>
											<ActionComp
												action={action}
												onPatchStat={patchStat}
												onDelete={onDelete}
												hideAudience={
													!isOwnContext ? contextIdTag : narrowToCommunity
												}
												width={width}
												onQuote={handleQuote}
											/>
										</div>
									</React.Fragment>
								))}
								<LoadMoreTrigger
									ref={sentinelRef}
									isLoading={isLoadingMore}
									hasMore={hasMore}
									error={error}
									onRetry={loadMore}
									loadingLabel={t('Loading more posts...')}
									retryLabel={t('Retry')}
									errorPrefix={t('Failed to load:')}
								/>
							</>
						)}
					</div>
				)}
			</Fcd.Content>
			<Fcd.Details></Fcd.Details>
		</Fcd.Container>
	)
}

// vim: ts=4
