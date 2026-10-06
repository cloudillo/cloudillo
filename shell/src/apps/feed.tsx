// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { ApiClient, PorchEntry } from '@cloudillo/core'
import {
	absChannel,
	actionContextTag,
	Alert,
	Badge,
	Button,
	Card,
	Divider,
	EmptyState,
	Fcd,
	HatVia,
	hatRingClass,
	HBox,
	IconText,
	LoadMoreTrigger,
	Menu,
	MenuItem,
	Meta,
	Nav,
	PageHeader,
	Panel,
	ProfilePicture,
	parseChannel,
	RichText,
	RichTextInput,
	RoomChip,
	SearchInput,
	SkeletonCard,
	Spacer,
	Tag,
	Text,
	TimeFormat,
	Tooltip,
	useApi,
	useAuth,
	VBox
} from '@cloudillo/react'
import type { ActionView, NewAction } from '@cloudillo/types'
import * as T from '@symbion/runtype'
import type { TFunction } from 'i18next'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import * as React from 'react'
import { Trans, useTranslation } from 'react-i18next'
import {
	LuCloud as IcAll,
	LuCamera as IcCamera,
	LuUsersRound as IcCommunities,
	LuLock as IcDirect,
	LuSave as IcDraft,
	LuBookmark as IcFollowing,
	LuImage as IcImage,
	LuUser as IcMine,
	LuUsers as IcPeople,
	LuGlobe as IcPublic,
	LuRepeat2 as IcRepost,
	LuSendHorizontal as IcSend,
	LuTag as IcTag,
	LuDoorOpen as IcRoom,
	LuInbox as IcUnread,
	LuVideo as IcVideo,
	LuCloudOff as IcOffline
} from 'react-icons/lu'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import '@cloudillo/react/components.css'

import type { CommunityRef } from '../context/index.js'
import {
	useApiContext,
	useCommunitiesList,
	useContextAwareApi,
	useCtx,
	useCurrentContextIdTag,
	useProfileTrust
} from '../context/index.js'
import {
	createdAtToSeconds,
	feedReadTs,
	feedSeedLoadedAtom,
	INITIAL_UNREAD_WINDOW_SEC,
	nowSeconds,
	unreadCountAtom,
	useBottomDwell,
	useReadMarker,
	useReadPositionTracker,
	useScrollEngaged
} from '../read-position.js'
import { useMutedRooms } from '../lib/room-mute.js'
import { DrawerToggle } from '../ui/DrawerToggle.js'
import { ctxBase, feedPath, filesPath, profilePath } from '../routes.js'
import { useWsBus } from '../ws-bus.js'
import { type DocPostIntent, pendingDocPostAtom } from './feed/doc-post-intent.js'
import { useEnterableRooms } from './shared/RoomPicker.js'
import {
	type AudienceTarget,
	CommentBadge,
	ComposePanel,
	collapsePartnerships,
	DraftsPanel,
	EmbeddedPostCard,
	EngagementDialog,
	NewPostsBanner,
	PartnershipCard,
	PostMenu,
	parseReactionCounts,
	ReactionPicker,
	ReadDivider,
	totalReactions,
	updateReactionCounts,
	useFeedPosts,
	useUnreadPosts
} from './feed/index.js'
import { HatComposeStrip, useHatFor } from './feed/ComposePanel.js'
import { LiveDocCard } from './feed/LiveDocCard.js'
import { parseLiveDocContent } from './feed/live-doc.js'
import { Document, hasPlayableVariant, Images, Video } from './feed/PostMedia.js'
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
	const urlContext = useCtx().base
	if (typeof action.content != 'string') return null
	const to = profilePath(urlContext, action.issuer.idTag)

	return (
		<HBox gap={2} className={className}>
			<Tooltip content={`@${action.issuer.idTag}`}>
				<Link to={to}>
					<ProfilePicture
						className={hatRingClass(action.hat)}
						profile={action.issuer}
						srcTag={srcTag}
						size="sm"
					/>
				</Link>
			</Tooltip>
			<VBox className="flex-fill w-min-0">
				<Text as="div" size="sm">
					<HatVia
						hat={action.hat}
						srcTag={srcTag}
						name={
							<Link to={to} className="font-semibold">
								{action.issuer.name || action.issuer.idTag}
							</Link>
						}
					/>
					<Text emphasis="muted">
						{' · '}
						<TimeFormat time={action.createdAt} />
					</Text>
				</Text>
				<RichText text={action.content} />
			</VBox>
		</HBox>
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
	const { t } = useTranslation()
	const { api } = useApi()
	const [auth] = useAuth()
	const [content, setContent] = React.useState('')
	const editorRef = React.useRef<HTMLDivElement>(null)
	const hatFor = useHatFor()
	const audienceTag = actionContextTag(parentAction)

	async function doSubmit() {
		if (!api || !auth?.idTag) return
		editorRef.current?.blur()
		setContent('')
		const action: NewAction = {
			type: 'CMNT',
			content,
			audienceTag,
			parentId: parentAction.actionId,
			hat: hatFor(audienceTag)
		}

		const actionRes = await api.actions.create(action)
		onSubmit?.(actionRes)
	}

	if (!auth?.name || !auth?.idTag) return false

	return (
		<HBox gap={1} className={className} style={style}>
			<ProfilePicture profile={{ profilePic: auth.profilePic }} small />
			<Panel padding={1} className="flex-fill">
				<HatComposeStrip audienceTag={audienceTag} />
				<RichTextInput
					ref={editorRef}
					value={content}
					onChange={setContent}
					onSubmit={doSubmit}
					autoFocus
					actions={
						<Button
							variant="link"
							color="primary"
							icon={<IcSend />}
							aria-label={t('Send')}
							onClick={doSubmit}
						/>
					}
				/>
			</Panel>
		</HBox>
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
		<VBox gap={2} className={className}>
			{comments
				.filter((action) => action.type == 'CMNT' && action.parentId == parentId)
				.map((action) => (
					<VBox
						key={action.actionId}
						ref={register}
						data-read-ts={createdAtToSeconds(action.createdAt)}
					>
						<Comment action={action} srcTag={srcTag} />
					</VBox>
				))}
		</VBox>
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
		<Alert
			color="info"
			compact
			className="mb-2"
			actions={
				<>
					<Button color="primary" size="sm" onClick={handleJustNow}>
						{t('Just now')}
					</Button>
					<Button color="secondary" size="sm" onClick={handleAlways} disabled={busy}>
						{t('Always trust')}
					</Button>
					<Button color="warning" size="sm" onClick={handleNever} disabled={busy}>
						{t('Never')}
					</Button>
				</>
			}
		>
			{t('Comments are on {{idTag}}. Authenticate to read them?', {
				idTag: audienceIdTag
			})}
		</Alert>
	)
}

function Comments({ parentAction, onCommentsRead, onCommentAdded, ...props }: CommentsProps) {
	// `contextAuthenticated` is a dep of the comment-load effect below: on the
	// same-node path `readApi` is `contextApi`, whose identity is stable per
	// idTag, so this flag is what changes when a context token lands.
	const { api: contextApi, authenticated: contextAuthenticated } = useContextAwareApi()
	const { getTokenFor, getClientFor } = useApiContext()
	const contextIdTag = useCurrentContextIdTag()

	const audienceIdTag = actionContextTag(parentAction)
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
	}, [readApi, contextAuthenticated, parentAction.actionId, showTrustPrompt, advanceTo])

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
		<VBox {...props}>
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
		</VBox>
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
			variant={hasAnyOwnRepost ? 'soft' : 'ghost'}
			color={hasAnyOwnRepost ? 'primary' : undefined}
			size="sm"
			aria-label={t('Repost')}
			pressed={hasAnyOwnRepost}
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
	/** Click on the post's room chip. */
	onRoomClick?: (channel: string) => void
}
function Post({
	className,
	action,
	onPatchStat,
	onDelete,
	hideAudience,
	srcTag,
	width,
	onQuote,
	onRoomClick
}: PostProps) {
	const { t } = useTranslation()
	const [auth] = useAuth()
	const { api } = useApi()
	const contextIdTag = useCurrentContextIdTag()
	const urlContext = useCtx().base
	// While the post is pending, the file still lives on the issuer's
	// server — it hasn't been replicated to the audience or any other
	// tenant yet. Override every other idTag source for that case.
	const fileIdTag = action.status === 'P' ? action.issuer.idTag : (srcTag ?? contextIdTag)
	const [tab, setTab] = React.useState<undefined | 'CMNT' | 'LIKE' | 'SHRE'>(undefined)
	// Engagement info dialog (who reacted / reposted). `undefined` = closed.
	const [engagementTab, setEngagementTab] = React.useState<string | undefined>(undefined)
	// `POST:LDOC` carries an object in `content`: a live-document reference plus the
	// author's commentary. Anything else non-string is still unrenderable.
	// A fresh object every render would re-fire LiveDocCard's row fetch each time.
	const liveDoc = React.useMemo(
		() => (action.subType === 'LDOC' ? parseLiveDocContent(action.content) : undefined),
		[action.subType, action.content]
	)
	const bodyText = liveDoc
		? liveDoc.text
		: typeof action.content === 'string'
			? action.content
			: undefined
	// A malformed LDOC payload degrades to a post with no body, never to a hole in the feed.
	if (
		action.subType !== 'LDOC' &&
		typeof action.content != 'string' &&
		action.content !== undefined
	)
		return null

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
			audienceTag: actionContextTag(engageAction),
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
	// the dot lit. Needs a viewer whose commentsReadAt this node actually stores:
	// a guest has no row here, so there is no watermark to be newer than.
	const commentUnread =
		!!auth?.idTag &&
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
	const issuerTo = profilePath(urlContext, action.issuer.idTag)
	const ctxTag = actionContextTag(action)
	const roomChip = action.channel ? (
		<RoomChip channel={action.channel} contextTag={ctxTag} />
	) : undefined
	const issuerName = action.issuer.name || action.issuer.idTag
	// A post shown outside its community's own feed names the community in the header.
	const communityAudience =
		action.audience &&
		action.audience.idTag !== action.issuer.idTag &&
		action.audience.idTag !== hideAudience
			? action.audience
			: undefined
	const vis = getVisibilityMeta(t, action.visibility)
	const VisIcon = vis?.icon
	const reactionSummary = (() => {
		const reactions = engageAction.stat?.reactions
		if (!reactions) return undefined
		const parsed = parseReactionCounts(reactions)
		const total = totalReactions(reactions)
		const overflow = Math.max(0, total - parsed.reduce((s, r) => s + r.count, 0))
		return { parsed, overflow, label: t('View {{count}} reactions', { count: total }) }
	})()

	return (
		<>
			{isRepost && (
				<Text as="div" size="sm" emphasis="muted" className="px-2">
					<IconText icon={<IcRepost />}>
						{t('Reposted by {{name}}', {
							name: action.issuer.name || action.issuer.idTag
						})}
						{action.hat && (
							<>
								{' '}
								<HatVia hat={action.hat} srcTag={fileIdTag} />
							</>
						)}
					</IconText>
				</Text>
			)}
			<Card
				color={isInFlight ? 'primary' : undefined}
				variant={isInFlight ? 'outline' : undefined}
				className={className}
			>
				<VBox gap={2}>
					<HBox align="start" gap={2}>
						<Tooltip content={`@${(communityAudience ?? action.issuer).idTag}`}>
							<Link
								to={
									communityAudience
										? profilePath(urlContext, communityAudience.idTag)
										: issuerTo
								}
								className="c-audience-badge-host"
							>
								<ProfilePicture
									className={
										communityAudience ? undefined : hatRingClass(action.hat)
									}
									profile={communityAudience ?? action.issuer}
									srcTag={fileIdTag}
									size="md"
								/>
								{communityAudience && (
									<ProfilePicture
										className={
											action.hat ? 'c-audience-badge hat' : 'c-audience-badge'
										}
										profile={action.issuer}
										srcTag={fileIdTag}
										size="xs"
									/>
								)}
							</Link>
						</Tooltip>
						<VBox className="flex-fill w-min-0">
							<Text as="div">
								{communityAudience ? (
									<Trans
										i18nKey="<0>{{name}}</0> in <1>{{community}}</1>"
										values={{
											name: issuerName,
											community:
												communityAudience.name || communityAudience.idTag
										}}
										components={[
											<Link
												key="issuer"
												to={issuerTo}
												className="font-semibold"
											/>,
											<Link
												key="community"
												to={profilePath(
													urlContext,
													communityAudience.idTag
												)}
												className="font-semibold"
											/>
										]}
									/>
								) : (
									<Link to={issuerTo} className="font-semibold">
										{issuerName}
									</Link>
								)}
								<Text size="sm" emphasis="muted" className="text-nowrap">
									{' · '}
									<TimeFormat time={action.createdAt} />
								</Text>
							</Text>
							{/* Flex: the icon chips would otherwise each sit on their own baseline */}
							<Meta className="d-flex flex-wrap align-items-center">
								{!communityAudience && <Text>@{action.issuer.idTag}</Text>}
								{action.hat && <HatVia hat={action.hat} srcTag={fileIdTag} />}
								{vis && VisIcon && (
									<IconText icon={<VisIcon style={{ color: vis.color }} />}>
										{vis.label}
									</IconText>
								)}
								{action.channel &&
									roomChip &&
									(onRoomClick ? (
										<Menu trigger={roomChip}>
											<RoomMenuItems
												channel={absChannel(action.channel, ctxTag)}
												onShowOnly={onRoomClick}
											/>
										</Menu>
									) : (
										roomChip
									))}
							</Meta>
						</VBox>
						{isInFlight && (
							<Badge color="primary">
								{action.status === 'S'
									? t('Scheduled')
									: isProcessingMedia
										? t('Processing')
										: t('Pending')}
							</Badge>
						)}
						<PostMenu action={action} onDelete={onDelete} />
					</HBox>
					<VBox gap={2}>
						{!!bodyText && <RichText text={bodyText} />}
						{!isRepost && liveDoc && <LiveDocCard docRef={liveDoc} width={width} />}
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
								<Images attachments={action.attachments} idTag={fileIdTag} />
							))}
						{isRepost && subjectAction && (
							<EmbeddedPostCard subjectAction={subjectAction} width={width} />
						)}
					</VBox>
					<HBox align="center" gap={2}>
						<ReactionPicker
							ownReaction={engageAction.stat?.ownReaction}
							onReact={onReactClick}
						/>
						<RepostControl
							original={repostOriginal}
							onQuote={(original, target) => onQuote?.(original, target)}
						/>
						<Spacer />
						<Button
							variant={tab == 'CMNT' ? 'soft' : 'ghost'}
							color={tab == 'CMNT' ? 'primary' : undefined}
							size="sm"
							pressed={tab == 'CMNT'}
							onClick={() => onTabClick('CMNT')}
							aria-label={commentLabel}
						>
							<CommentBadge count={commentCount} unread={commentUnread} />
						</Button>
						{reactionSummary && (
							<Button
								variant="ghost"
								size="sm"
								onClick={() => setEngagementTab('all')}
								aria-label={reactionSummary.label}
							>
								{reactionSummary.parsed.map((r) => (
									<Tag key={r.key} icon={r.emoji} count={r.count} />
								))}
								{reactionSummary.overflow > 0 && (
									<Tag>+{reactionSummary.overflow}</Tag>
								)}
							</Button>
						)}
						{repostCount > 0 && (
							<Tag
								icon={<IcRepost />}
								count={repostCount}
								onClick={() => setEngagementTab('reposts')}
								aria-label={t('View {{count}} reposts', { count: repostCount })}
							/>
						)}
					</HBox>
					{tab == 'CMNT' && (
						<>
							<Divider />
							<Comments
								parentAction={engageAction}
								onCommentsRead={onCommentsRead}
								onCommentAdded={onCommentAdded}
							/>
						</>
					)}
					{engagementTab !== undefined && (
						<EngagementDialog
							subjectActionId={engageAction.actionId}
							audienceTag={actionContextTag(engageAction)}
							initialTab={engagementTab}
							open={engagementTab !== undefined}
							onClose={() => setEngagementTab(undefined)}
						/>
					)}
				</VBox>
			</Card>
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
	onRoomClick?: (channel: string) => void
}
export const ActionComp = React.memo(function ActionComp({
	className,
	action,
	onPatchStat,
	onDelete,
	hideAudience,
	srcTag,
	width,
	onQuote,
	onRoomClick
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
					onRoomClick={onRoomClick}
				/>
			)
		case 'PTNR':
			return <PartnershipCard className={className} action={action} />
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
		<Panel className={className} data-tour="feed-compose">
			<HBox gap={2} align="center">
				<ProfilePicture profile={{ profilePic: auth.profilePic }} small />
				<Button variant="soft" className="flex-fill w-min-0" onClick={() => onOpen()}>
					<Text truncate>{t("What's on your mind?")}</Text>
				</Button>
				<Button variant="ghost" aria-label={t('Add image')} onClick={() => onOpen('image')}>
					<IcImage />
				</Button>
				<Button
					variant="ghost"
					className="sm-hide"
					aria-label={t('Take photo')}
					onClick={() => onOpen('camera')}
				>
					<IcCamera />
				</Button>
				<Button
					variant="ghost"
					className="sm-hide"
					aria-label={t('Add video')}
					onClick={() => onOpen('video')}
				>
					<IcVideo />
				</Button>
			</HBox>
		</Panel>
	)
}

/** A post's room chip menu. Mounted only while open, so the muted set is already loaded. */
function RoomMenuItems({
	channel,
	onShowOnly
}: {
	channel: string
	onShowOnly: (channel: string) => void
}) {
	const { t } = useTranslation()
	const navigate = useNavigate()
	const [auth] = useAuth()
	const contextIdTag = useCurrentContextIdTag()
	const { muted, mute, unmute } = useMutedRooms()
	const { tenant, name: room } = parseChannel(channel)
	const isMuted = muted.has(channel)
	// A bare channel is a room of the context being viewed
	const base = ctxBase(tenant ?? contextIdTag, auth?.idTag)

	return (
		<>
			<MenuItem
				label={t('Show only ~{{room}}', { room })}
				onClick={() => onShowOnly(channel)}
			/>
			<MenuItem
				label={t('Files')}
				onClick={() => navigate(filesPath(base, { drive: room }))}
			/>
			<MenuItem
				label={isMuted ? t('Unmute ~{{room}}', { room }) : t('Mute ~{{room}}', { room })}
				onClick={() => {
					;(isMuted ? unmute : mute)(channel).catch((err) =>
						console.error('Failed to update room mute:', err)
					)
				}}
			/>
		</>
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
	/** Context feed only: the rooms the reader is in. */
	rooms: PorchEntry[]
	/** The `?room=` value (a bare name in a context feed). */
	room: string | undefined
	onRoomChange: (room: string | undefined) => void
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
	tags,
	rooms,
	room,
	onRoomChange
}: FilterBarProps) {
	const { t } = useTranslation()
	const sourceOptions = getSourceFilters(t, isOwnContext)

	return (
		<VBox gap={2} className="pt-2">
			<SearchInput
				defaultValue={searchQuery}
				debounce={300}
				onSearch={(q) => onSearchChange(q || undefined)}
				placeholder={t('Search posts...')}
				className="px-2"
			/>

			<Divider />

			<Nav aria-label={t('Feed')}>
				{/* Source filter — read-state view (Unread) + content sources */}
				<Nav.Section label={t('Source')}>
					{/* Unread is an all-source, read-state view. */}
					<Nav.Item
						icon={<IcUnread />}
						label={t('Unread')}
						active={viewMode === 'unread'}
						onClick={() => onViewSelect('unread')}
						badge={
							ctxUnread > 0 ? (
								<Badge dot color="accent" aria-label={t('New content')} />
							) : undefined
						}
					/>
					{sourceOptions.map((opt) => (
						<React.Fragment key={opt.value}>
							<Nav.Item
								icon={<opt.icon />}
								label={opt.value === 'all' ? t('Feed') : opt.label}
								active={
									viewMode === 'feed' &&
									sourceFilter === opt.value &&
									!(opt.value === 'communities' && narrowToCommunity)
								}
								onClick={() => onSourceChange(opt.value)}
							/>
							{opt.value === 'communities' &&
								viewMode === 'feed' &&
								sourceFilter === 'communities' &&
								communities.map((c) => (
									<Nav.Item
										key={c.idTag}
										depth={1}
										icon={
											<ProfilePicture
												profile={{ profilePic: c.profilePic }}
												srcTag={c.idTag}
												small
											/>
										}
										label={c.name}
										active={narrowToCommunity === c.idTag}
										onClick={() => onNarrowToCommunityChange(c.idTag)}
									/>
								))}
						</React.Fragment>
					))}
				</Nav.Section>
				{rooms.length > 0 && (
					<Nav.Section label={t('Rooms')}>
						<Nav.Item
							icon={<IcAll />}
							label={t('All')}
							active={viewMode === 'feed' && !room}
							onClick={() => onRoomChange(undefined)}
						/>
						{rooms.map((r) => (
							<Nav.Item
								key={r.name}
								icon={<IcRoom />}
								label={r.title || `~${r.name}`}
								active={viewMode === 'feed' && room === r.name}
								onClick={() => onRoomChange(r.name)}
							/>
						))}
					</Nav.Section>
				)}
				<Nav.Divider />
				{/* Drafts — separate composing view below the source list. */}
				<Nav.Item
					icon={<IcDraft />}
					label={t('Drafts')}
					active={viewMode === 'drafts'}
					onClick={() => onViewSelect('drafts')}
				/>
			</Nav>

			{/* Tag cloud */}
			{tags.length > 0 && (
				<>
					<Divider />
					<HBox gap={1} align="center" className="px-2">
						<Text size="sm" emphasis="muted" className="flex-fill">
							<IcTag /> {t('Tags')}
						</Text>
						{tagFilter && (
							<Button
								variant="ghost"
								size="sm"
								onClick={() => onTagChange(undefined)}
							>
								{t('Clear')}
							</Button>
						)}
					</HBox>
					<HBox gap={1} wrap className="px-2">
						{tags.map((tag) => (
							<Tag
								key={tag}
								pressed={tagFilter === tag}
								onClick={() => onTagChange(tagFilter === tag ? undefined : tag)}
							>
								#{tag}
							</Tag>
						))}
					</HBox>
				</>
			)}
		</VBox>
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
	const navigate = useNavigate()
	const { t } = useTranslation()
	const { api } = useApi()
	// Post permalink (`/app/:ctx/feed/:actionId`) — where search hits and shared links
	// land.
	const { actionId: focusedId } = useParams()
	const { api: ctxApi } = useContextAwareApi()
	const urlContext = useCtx().base
	const [auth] = useAuth()
	const contextIdTag = useCurrentContextIdTag()
	const [showFilter, setShowFilter] = React.useState<boolean>(false)
	const [viewMode, setViewMode] = React.useState<'unread' | 'feed' | 'drafts'>('feed')
	const [sourceFilter, setSourceFilter] = React.useState<SourceFilter>('all')
	const [narrowToCommunity, setNarrowToCommunity] = React.useState<string | undefined>()
	const [searchQuery, setSearchQuery] = React.useState<string | undefined>()
	const [tagFilter, setTagFilter] = React.useState<string | undefined>()
	// `?room=name` is relative to the context feed; `?room=@tenant~name` is absolute (a chip's
	// "Show only" on another tenant's room, e.g. from the home feed). Switching context navigates
	// to a new path, which drops it.
	const [searchParams, setSearchParams] = useSearchParams()
	const room = searchParams.get('room') || undefined
	const { communities } = useCommunitiesList()
	const [composeOpen, setComposeOpen] = React.useState(false)
	const [editingDraft, setEditingDraft] = React.useState<ActionView | undefined>()
	const [quoteAction, setQuoteAction] = React.useState<ActionView | undefined>()
	const [quoteTarget, setQuoteTarget] = React.useState<AudienceTarget | undefined>()
	const [composeMedia, setComposeMedia] = React.useState<
		'image' | 'camera' | 'video' | undefined
	>()
	const [composeDoc, setComposeDoc] = React.useState<DocPostIntent | undefined>()
	const [pendingQuote, setPendingQuote] = useAtom(pendingQuoteAtom)
	const [pendingDocPost, setPendingDocPost] = useAtom(pendingDocPostAtom)
	const widthRef = React.useRef<HTMLDivElement>(null)
	const [width, setWidth] = React.useState(0)
	// The real scroll container (Fcd.Content's inner .c-fcd-content-scroll div),
	// captured via callback ref so the read-marker primitives watch it instead of
	// window (the Fcd tree is h-100, so window never scrolls).
	const [scrollEl, setScrollEl] = React.useState<HTMLDivElement | null>(null)

	// Determine audience for feed (undefined for own context, contextIdTag for community)
	const isOwnContext = !contextIdTag || contextIdTag === auth?.idTag
	const audience = isOwnContext ? undefined : contextIdTag
	const contextCommunity = audience ? communities.find((c) => c.idTag === audience) : undefined
	const channel =
		room && contextIdTag
			? absChannel(room, contextIdTag)
			: room?.startsWith('@')
				? room
				: undefined
	const { muted: mutedRooms, unmute: unmuteRoom } = useMutedRooms()
	const inRooms = useEnterableRooms(audience)
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
	// Read-state affordances (the "Caught up" pill, the read divider, scroll-driven
	// mark-as-read) only mean something when the node can store this viewer's watermark. A
	// guest has no profile row here, so show none of it rather than a watermark of 0.
	const readStateTracked = !!ownIdTag
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
		// ponytail: the Unread list has no room filter, so a room view stays on the feed.
		if (channel) return
		if (readPosition > 0 && ctxUnread > 0) {
			viewModeSetRef.current = ctxKey
			setViewMode((m) => (m === 'feed' ? 'unread' : m))
		}
	}, [ctxKey, readPosition, ctxUnread, channel])

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
		isOffline,
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
		channel,
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
		enabled: viewMode === 'feed' && readStateTracked,
		onReach: advanceTo,
		mode: 'below',
		root: scrollEl
	})

	// Extract hashtags from loaded feed posts for tag cloud
	const feedTags = React.useMemo(() => {
		const tagCounts = new Map<string, number>()
		for (const post of feed) {
			// An LDOC post keeps its commentary in `content.text`, not in `content`.
			const text =
				post.subType === 'LDOC'
					? parseLiveDocContent(post.content)?.text
					: typeof post.content === 'string'
						? post.content
						: undefined
			if (!text) continue
			const matches = text.match(/#[\p{L}\p{N}_]+/gu)
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
	}, [effectiveAudience, tagFilter, searchQuery, sourceFilter, channel])

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

		// The audience approving our post means it now holds it (files included), so
		// it is no longer pending. A just-posted entry still carries its local '@N' id,
		// which only a read resolves to the signed id the APRV names.
		if (action.type === 'APRV' && action.subject) {
			const subject = action.subject
			const activate = (actionId: string) =>
				setFeedUpdates((prev) => ({
					...prev,
					[actionId]: { ...(prev[actionId] ?? {}), status: 'A' }
				}))
			for (const p of feedRef.current) {
				if (p.status !== 'P' || p.audience?.idTag !== action.issuer.idTag) continue
				if (p.actionId === subject) activate(p.actionId)
				else if (p.actionId.startsWith('@')) {
					api?.actions
						.get(p.actionId)
						.then((a) => {
							if (a.actionId === subject) activate(p.actionId)
						})
						.catch(() => {
							/* stays pending until the next refetch */
						})
				}
			}
		}
	})

	React.useLayoutEffect(
		function () {
			if (!widthRef.current) return

			function measureWidth() {
				if (!widthRef.current) return
				// Find the first post card inside to measure its padding
				const panel = widthRef.current.querySelector('.c-card')
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
	// branch of `feedUpdates` carries attachment/subType overlays, the APRV branch a status.
	const mergedFeed = React.useMemo(() => {
		// Layer the engaged-id stat overlay onto one action.
		function applyStatOverlay(a: ActionView): ActionView {
			const o = statOverlay[a.actionId]
			if (!o) return a
			return { ...a, stat: { ...a.stat, ...o } }
		}

		return (
			collapsePartnerships(feed)
				// The focused post is pinned above the list; drop it here so it is not
				// shown twice.
				.filter((post) => !deletedIds.has(post.actionId) && post.actionId !== focusedId)
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
		)
	}, [feed, feedUpdates, statOverlay, deletedIds, focusedId])

	// The feed is keyset-cursor paged, so there is no way to seek to an arbitrary post
	// — paging until it appears could walk the whole feed. Fetch the permalinked post
	// directly and pin it above the list instead, leaving the normal paging, the read
	// watermark and the live-arrival path untouched.
	const [focusedPost, setFocusedPost] = React.useState<ActionView | undefined>()
	const [focusedMissing, setFocusedMissing] = React.useState(false)
	const focusedRef = React.useRef<HTMLDivElement>(null)

	React.useEffect(() => {
		setFocusedPost(undefined)
		setFocusedMissing(false)
		if (!focusedId || !ctxApi) return
		let cancelled = false
		;(async () => {
			try {
				const action = await ctxApi.actions.get(focusedId)
				if (cancelled) return
				// `ActionComp` renders POST/REPOST only; anything else would pin an
				// empty card, so treat it as unavailable.
				if (action.type !== 'POST' && action.type !== 'REPOST') {
					setFocusedMissing(true)
					return
				}
				setFocusedPost(action)
			} catch (err) {
				if (cancelled) return
				// Deleted, or not visible to this viewer.
				console.warn('[Feed] Failed to load the linked post:', err)
				setFocusedMissing(true)
			}
		})()
		return function () {
			cancelled = true
		}
	}, [focusedId, ctxApi])

	// A permalink is a deliberate destination: suppress the one-shot Unread auto-switch
	// so it cannot yank the reader off the linked post.
	React.useEffect(() => {
		if (!focusedId) return
		userTouchedViewRef.current = true
		setViewMode('feed')
	}, [focusedId])

	React.useEffect(() => {
		if (focusedPost) focusedRef.current?.scrollIntoView({ block: 'start' })
	}, [focusedPost])

	// Divider position: the top of the contiguous fully-read TAIL. The reader's own
	// posts are force-read (issuer === ownIdTag short-circuit) and can sit read
	// interleaved among unread posts, so a naive "first read post from the top"
	// boundary mis-positions. Walk newest→oldest and find where the all-read suffix
	// begins: everything below the divider is guaranteed read; everything above
	// contains all the unread (plus possibly a few force-read own posts interleaved).
	const dividerIndex = React.useMemo(() => {
		if (!readStateTracked) return -1
		let divider = mergedFeed.length
		for (let i = mergedFeed.length - 1; i >= 0; i--) {
			if (isRead(mergedFeed[i])) divider = i
			else break
		}
		// 0 = everything read (nothing unread above) or length = no read tail:
		// neither is a real mid-list boundary.
		return divider === 0 || divider === mergedFeed.length ? -1 : divider
	}, [mergedFeed, isRead, readStateTracked])

	// True when any currently-loaded feed post is still unread by this context's
	// watermark — keeps the "Caught up" pill in sync with the divider.
	const hasUnreadLoaded = React.useMemo(
		() => readStateTracked && mergedFeed.some((p) => !isRead(p)),
		[mergedFeed, isRead, readStateTracked]
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

	// Auto "caught up": dwelling 3s at the bottom of the Unread list marks everything
	// loaded as read — same effect as the bottom button, consistent with messages.
	useBottomDwell({
		scrollEl,
		enabled: viewMode === 'unread',
		delayMs: 3000,
		recheckKey: newestLoadedTs,
		onDwell: markAllRead
	})

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
		setComposeDoc(undefined)
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
		setComposeDoc(undefined)
		setViewMode('feed')
		setComposeOpen(true)
	}, [])

	const handleDocPost = React.useCallback(function handleDocPost(doc: DocPostIntent) {
		setComposeMedia(undefined)
		setEditingDraft(undefined)
		setQuoteAction(undefined)
		setQuoteTarget(undefined)
		setComposeDoc(doc)
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

	// Same one-shot handshake for a document handed over by an editor's
	// "Share to feed" button (the `feed:post` bus command sets the atom).
	React.useEffect(() => {
		if (!pendingDocPost) return
		handleDocPost(pendingDocPost)
		setPendingDocPost(undefined)
	}, [pendingDocPost, handleDocPost, setPendingDocPost])

	function handleComposeClose() {
		setComposeOpen(false)
		setComposeMedia(undefined)
		setEditingDraft(undefined)
		setQuoteAction(undefined)
		setQuoteTarget(undefined)
		setComposeDoc(undefined)
	}

	const setRoom = React.useCallback(
		(next: string | undefined) => {
			userTouchedViewRef.current = true
			setViewMode('feed')
			setSearchParams((p) => {
				if (next) p.set('room', next)
				else p.delete('room')
				return p
			})
		},
		[setSearchParams]
	)

	// A room chip's "Show only": the bare name when it is this context's room, else absolute.
	const handleRoomClick = React.useCallback(
		(ch: string) => {
			const { tenant, name } = parseChannel(ch)
			setRoom(!isOwnContext && tenant === contextIdTag ? name : ch)
		},
		[setRoom, isOwnContext, contextIdTag]
	)

	function handleViewSelect(v: 'unread' | 'drafts') {
		userTouchedViewRef.current = true
		if (v === 'unread') {
			// Unread is an all-source, read-state view.
			if (room) setRoom(undefined)
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
		setComposeMedia(undefined)
		setQuoteAction(undefined)
		setQuoteTarget(undefined)
		setComposeDoc(undefined)
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
							if (room) setRoom(undefined)
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
						rooms={isOwnContext ? [] : inRooms}
						room={room}
						onRoomChange={setRoom}
					/>
				)}
			</Fcd.Filter>
			<Fcd.Content
				ref={setScrollEl}
				width="reading"
				header={
					<PageHeader
						title={t('Feed')}
						subtitle={contextCommunity?.name}
						leading={
							contextCommunity && (
								<ProfilePicture
									profile={contextCommunity}
									srcTag={contextCommunity.idTag}
									size="sm"
								/>
							)
						}
						actions={<DrawerToggle nav onClick={() => setShowFilter(true)} />}
					/>
				}
			>
				{channel && viewMode === 'feed' && !focusedId && (
					<VBox gap={1} className="px-2">
						<HBox gap={1} wrap align="center">
							<Text size="sm" emphasis="muted">
								{t('Room')}
							</Text>
							<RoomChip
								channel={channel}
								contextTag={contextIdTag}
								onRemove={() => setRoom(undefined)}
							/>
						</HBox>
						{mutedRooms.has(channel) && (
							<Alert color="info" compact>
								<HBox gap={1} wrap align="center">
									<Text className="flex-fill">
										{t(
											"You muted this room. Its posts don't show in your unfiltered feed."
										)}
									</Text>
									<Button
										size="sm"
										variant="ghost"
										onClick={() => {
											unmuteRoom(channel).catch((err) =>
												console.error('Failed to unmute room:', err)
											)
										}}
									>
										{t('Unmute')}
									</Button>
								</HBox>
							</Alert>
						)}
					</VBox>
				)}
				{!!auth && !composeOpen && <ComposeTrigger onOpen={handleComposeOpen} />}
				{!!auth && (
					<ComposePanel
						open={composeOpen}
						onClose={handleComposeClose}
						onSubmit={onSubmit}
						idTag={contextIdTag !== auth?.idTag ? contextIdTag : undefined}
						initialMedia={composeMedia}
						initialDoc={composeDoc}
						draft={editingDraft}
						quotedAction={quoteAction}
						target={quoteTarget}
						ownRepostIds={quoteAction?.stat?.ownRepostIds}
						audiencePicker
					/>
				)}
				{!composeOpen && viewMode === 'unread' && (
					<VBox ref={widthRef} gap={2}>
						{isUnreadLoading && unreadPosts.length === 0 ? (
							<VBox gap={2} padding={2}>
								<SkeletonCard showAvatar lines={3} />
								<SkeletonCard showAvatar showImage lines={2} />
							</VBox>
						) : unreadPosts.length === 0 && !unreadHasMore ? (
							<EmptyState
								className="auto-bg"
								size="lg"
								icon={<IcAll />}
								title={t("You're all caught up.")}
								description={t('No new posts since your last visit.')}
							/>
						) : (
							<>
								{collapsePartnerships(unreadPosts).map((post) => (
									<VBox
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
											onRoomClick={handleRoomClick}
										/>
									</VBox>
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
									<HBox justify="center" padding={2}>
										<Button color="primary" onClick={markAllRead}>
											{t('Mark all as read')}
										</Button>
									</HBox>
								)}
							</>
						)}
					</VBox>
				)}
				{!composeOpen && viewMode === 'drafts' && (
					<DraftsPanel onEdit={handleEditDraft} onPublished={handleDraftPublished} />
				)}
				{!composeOpen && !!focusedId && (focusedPost || focusedMissing) && (
					<Panel
						ref={focusedRef}
						color="primary"
						variant="soft"
						padding={2}
						className="mb-2"
					>
						<VBox gap={1}>
							<HBox align="center" justify="between" gap={2}>
								<Text size="sm" emphasis="muted">
									{t('Linked post')}
								</Text>
								<Button
									variant="link"
									onClick={() =>
										navigate(feedPath(urlContext), {
											replace: true
										})
									}
								>
									{t('Back to feed')}
								</Button>
							</HBox>
							{focusedPost ? (
								<ActionComp
									action={focusedPost}
									onPatchStat={patchStat}
									onDelete={onDelete}
									hideAudience={!isOwnContext ? contextIdTag : narrowToCommunity}
									width={width}
									onQuote={handleQuote}
									onRoomClick={handleRoomClick}
								/>
							) : (
								<EmptyState title={t('That post is no longer available')} />
							)}
						</VBox>
					</Panel>
				)}
				{!composeOpen && viewMode === 'feed' && isOffline && (
					<Alert color="neutral" compact icon={<IcOffline />} className="my-2">
						{t('Showing cached data — you appear to be offline')}
					</Alert>
				)}
				{!composeOpen && viewMode === 'feed' && newPostsCount > 0 && (
					<NewPostsBanner count={newPostsCount} onClick={showNewPosts} className="my-2" />
				)}
				{!composeOpen && viewMode === 'feed' && (
					<VBox ref={widthRef} gap={2}>
						{isLoading && feed.length === 0 ? (
							<VBox gap={2} padding={2}>
								<SkeletonCard showAvatar showImage lines={2} />
								<SkeletonCard showAvatar lines={3} />
								<SkeletonCard showAvatar showImage lines={2} />
							</VBox>
						) : mergedFeed.length === 0 ? (
							<EmptyState
								className="auto-bg"
								size="lg"
								icon={<IcAll />}
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
								{/* Guest-hidden by construction: with no tracked viewer both
								    dividerIndex and hasUnreadLoaded collapse to falsy, so the
								    pill needs no separate gate. */}
								{(dividerIndex > 0 || hasUnreadLoaded) && (
									<HBox justify="center" className="pb-1">
										<Button
											variant="link"
											color="primary"
											onClick={markAllRead}
										>
											{t('Caught up')} ✓
										</Button>
									</HBox>
								)}
								{mergedFeed.map((action, i) => (
									<React.Fragment key={action.actionId}>
										{/* Suppress the divider at index 0 (nothing unread above
										    it) and at -1 (no in-list boundary: all read or all
										    unread); only render it as a real mid-list boundary. */}
										{i === dividerIndex && i > 0 && <ReadDivider />}
										<VBox
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
												onRoomClick={handleRoomClick}
											/>
										</VBox>
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
					</VBox>
				)}
			</Fcd.Content>
		</Fcd.Container>
	)
}

// vim: ts=4
