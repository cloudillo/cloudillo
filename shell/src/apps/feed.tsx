// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { TFunction } from 'i18next'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { type Position, useEditable } from 'use-editable'

import Lightbox from 'yet-another-react-lightbox'
import 'yet-another-react-lightbox/styles.css'
import Fullscreen from 'yet-another-react-lightbox/plugins/fullscreen'
import Slideshow from 'yet-another-react-lightbox/plugins/slideshow'
import Thumbnails from 'yet-another-react-lightbox/plugins/thumbnails'
import Zoom from 'yet-another-react-lightbox/plugins/zoom'
import 'yet-another-react-lightbox/plugins/thumbnails.css'
import 'react-photo-album/rows.css'

import { getFileUrl, getOptimalImageVariant, getOptimalVideoVariant } from '@cloudillo/core'
import {
	Badge,
	Button,
	EmptyState,
	Fcd,
	generateFragments,
	LoadingSpinner,
	LoadMoreTrigger,
	mergeClasses,
	ProfileAudienceCard,
	ProfileCard,
	ProfilePicture,
	SkeletonCard,
	Tab,
	Tabs,
	TimeFormat,
	useApi,
	useAuth
} from '@cloudillo/react'
import type { ActionView, NewAction } from '@cloudillo/types'
import * as T from '@symbion/runtype'
import {
	LuCloud as IcAll,
	LuCamera as IcCamera,
	LuMessageCircle as IcComment,
	LuUsersRound as IcCommunities,
	LuLock as IcDirect,
	LuFileText as IcDocument,
	LuSave as IcDraft,
	LuFilter as IcFilter,
	LuImage as IcImage,
	LuUser as IcMine,
	LuUsers as IcPeople,
	LuPlay as IcPlay,
	LuGlobe as IcPublic,
	LuRepeat as IcRepost,
	LuSearch as IcSearch,
	LuSendHorizontal as IcSend,
	LuTag as IcTag,
	LuVideo as IcVideo
} from 'react-icons/lu'
import '@cloudillo/react/components.css'
import './feed.css'

import type { CommunityRef } from '../context/index.js'
import {
	useCommunitiesList,
	useCurrentContextIdTag,
	useUrlContextIdTag,
	HOME_CONTEXT
} from '../context/index.js'
import { useWsBus } from '../ws-bus.js'
import {
	ComposePanel,
	DraftsPanel,
	NewPostsBanner,
	PostMenu,
	parseReactionCounts,
	ReactionPicker,
	updateReactionCounts,
	useFeedPosts
} from './feed/index.js'

//////////////////////
// Action datatypes //
//////////////////////
interface PostAction extends ActionView {
	type: 'POST'
	stat?: {
		ownReaction?: string
		reactions?: string
		comments?: number
		commentsRead?: number
	}
}

export type ActionEvt = PostAction | ActionView

//////////////////////
// Image formatting //
//////////////////////

interface ImagesProps {
	width: number
	attachments: ActionView['attachments']
	idTag: string | undefined
}
export function Images({ width, attachments, idTag }: ImagesProps) {
	const [lbIndex, setLbIndex] = React.useState<number | undefined>()
	const gap = 8
	const [img1, img2, img3] = attachments || []

	// Lightbox: best available local variant for fullscreen
	const photos = React.useMemo(
		() =>
			idTag
				? attachments?.map((im) => ({
						src: getFileUrl(
							idTag,
							im.fileId,
							getOptimalImageVariant('fullscreen', im.localVariants)
						),
						width: im.dim?.[0] || 100,
						height: im.dim?.[1] || 100
					}))
				: undefined,
		[attachments, idTag]
	)

	if (!idTag || !attachments?.length) return null

	// Inline images: always local, preferred variant for preview
	const getInlineUrl = (att: NonNullable<typeof attachments>[0]) =>
		getFileUrl(idTag, att.fileId, getOptimalImageVariant('preview', att.localVariants))

	let imgNode: React.ReactNode

	switch (attachments?.length) {
		case 0:
			return null
		case 1:
			imgNode = (
				<img
					alt=""
					className="cursor-pointer"
					onClick={() => setLbIndex(0)}
					src={getInlineUrl(img1)}
					style={{ maxWidth: '100%', maxHeight: '30rem', margin: '0 auto' }}
				/>
			)
			break
		case 2: {
			const aspect12 =
				(img1.dim?.[0] ?? 100) / (img1.dim?.[1] ?? 100) +
				(img2.dim?.[0] ?? 100) / (img2.dim?.[1] ?? 100)
			const height = (width - gap) / aspect12

			imgNode = (
				<div className="c-hbox g-2">
					<img
						alt=""
						className="cursor-pointer"
						onClick={() => setLbIndex(0)}
						src={getInlineUrl(img1)}
						style={{ height, margin: '0 auto' }}
					/>
					<img
						alt=""
						className="cursor-pointer"
						onClick={() => setLbIndex(1)}
						src={getInlineUrl(img2)}
						style={{ height, margin: '0 auto' }}
					/>
				</div>
			)
			break
		}
		default: {
			// Adding the reciprocals of the aspect ratios of img2 and img3
			const aspect23 =
				1 /
				((img2.dim?.[1] ?? 100) / (img2.dim?.[0] ?? 100) +
					(img3.dim?.[1] ?? 100) / (img3.dim?.[0] ?? 100))
			// Adding the aspect ratios of img1 and the right column (img2 and img3)
			const aspect123 = (img1.dim?.[0] ?? 100) / (img1.dim?.[1] ?? 100) + aspect23
			const height = (width - gap) / aspect123
			const width23 = (height - gap) * aspect23

			imgNode = (
				<div className="c-hbox g-2">
					<img
						alt=""
						className="cursor-pointer"
						onClick={() => setLbIndex(0)}
						src={getInlineUrl(img1)}
						style={{ height, margin: '0 auto' }}
					/>
					<div className="c-vbox">
						<img
							alt=""
							className="cursor-pointer"
							onClick={() => setLbIndex(1)}
							src={getInlineUrl(img2)}
							style={{ width: width23, margin: '0 auto' }}
						/>
						{attachments.length == 3 ? (
							<img
								alt=""
								className="cursor-pointer"
								onClick={() => setLbIndex(2)}
								src={getInlineUrl(img3)}
								style={{ width: width23, margin: '0 auto' }}
							/>
						) : (
							<div
								className="pos-relative"
								style={{ width: width23, margin: '0 auto' }}
							>
								<img alt="" className="w-100" src={getInlineUrl(img3)} />
								<div
									onClick={() => setLbIndex(2)}
									className="c-image-overlay-counter cursor-pointer"
								>
									+{attachments.length - 3}
								</div>
							</div>
						)}
					</div>
				</div>
			)
		}
	}

	return (
		<>
			{imgNode}
			<Lightbox
				slides={photos}
				open={lbIndex !== undefined}
				index={lbIndex}
				close={() => setLbIndex(undefined)}
				plugins={[Fullscreen, Slideshow, Thumbnails, Zoom]}
			/>
		</>
	)
}

/////////////////////
// Video component //
/////////////////////
const PLAYABLE_VARIANTS = ['vid.xd', 'vid.hd', 'vid.md', 'vid.sd']
const POSTER_VARIANTS = ['vis.md', 'vis.sd', 'vis.tn']

function hasPlayableVariant(variants: readonly string[] | undefined): boolean {
	if (!variants) return false
	return PLAYABLE_VARIANTS.some((v) => variants.includes(v))
}

function hasPosterVariant(variants: readonly string[] | undefined): boolean {
	if (!variants) return false
	return POSTER_VARIANTS.some((v) => variants.includes(v))
}

interface VideoProps {
	attachments: ActionView['attachments']
	idTag: string | undefined
}

function Video({ attachments, idTag }: VideoProps) {
	const { t } = useTranslation()
	const videoAtt = attachments?.[0]
	const variants = videoAtt?.localVariants
	const playable = hasPlayableVariant(variants)
	const hasPoster = hasPosterVariant(variants)

	const posterUrl =
		idTag && videoAtt && hasPoster
			? getFileUrl(idTag, videoAtt.fileId, getOptimalVideoVariant('preview', variants))
			: undefined

	const [activePoster, setActivePoster] = React.useState<string | undefined>(undefined)
	const [activated, setActivated] = React.useState(false)

	React.useEffect(() => {
		if (!posterUrl) {
			setActivePoster(undefined)
			return
		}
		const url = posterUrl
		let cancelled = false
		let attempt = 0
		let timer: ReturnType<typeof setTimeout> | undefined
		function tryLoad() {
			const img = new Image()
			img.onload = () => {
				if (!cancelled) setActivePoster(url)
			}
			img.onerror = () => {
				if (cancelled || attempt >= 5) return
				attempt++
				timer = setTimeout(tryLoad, 1000 * 1.5 ** attempt)
			}
			// Cachebuster on retry: a 404 with normal cache headers would
			// otherwise be served from cache and defeat the backoff.
			img.src = attempt === 0 ? url : `${url}${url.includes('?') ? '&' : '?'}_=${Date.now()}`
		}
		tryLoad()
		return () => {
			cancelled = true
			if (timer) clearTimeout(timer)
		}
	}, [posterUrl])

	if (!idTag || !videoAtt) return null

	if (!playable) {
		return (
			<div
				className="c-skeleton c-skeleton--rect c-skeleton--rounded c-skeleton--animate pos-relative"
				style={{
					aspectRatio: '16 / 9',
					maxHeight: '30rem',
					backgroundImage: activePoster ? `url(${activePoster})` : undefined,
					backgroundSize: 'cover',
					backgroundPosition: 'center'
				}}
				role="status"
				aria-live="polite"
				aria-label={t('Processing video')}
			>
				<div
					className="c-vbox g-2 align-items-center justify-content-center pos-absolute"
					style={{
						inset: 0,
						background: 'rgba(0, 0, 0, 0.25)',
						color: 'var(--col-on-container)'
					}}
				>
					<LoadingSpinner size="sm" />
					<span>{t('Processing video…')}</span>
				</div>
			</div>
		)
	}

	const videoUrl = getFileUrl(
		idTag,
		videoAtt.fileId,
		getOptimalVideoVariant('fullscreen', variants)
	)

	const aspectRatio = videoAtt.dim ? `${videoAtt.dim[0]} / ${videoAtt.dim[1]}` : '16 / 9'

	if (activated) {
		return (
			<video
				controls
				autoPlay
				preload="auto"
				poster={activePoster}
				className="c-feed-video"
				style={{ aspectRatio }}
			>
				<source src={videoUrl} />
			</video>
		)
	}

	return (
		<button
			type="button"
			className="c-feed-video-facade"
			style={{
				aspectRatio,
				backgroundImage: activePoster ? `url(${activePoster})` : undefined
			}}
			onClick={() => setActivated(true)}
			aria-label={t('Play video')}
		>
			<span className="c-feed-video-facade__play" aria-hidden="true">
				<IcPlay />
			</span>
		</button>
	)
}

///////////////////////
// Document component //
///////////////////////
interface DocumentProps {
	attachments: ActionView['attachments']
	idTag: string | undefined
	token?: string
}

function Document({ attachments, idTag, token }: DocumentProps) {
	const navigate = useNavigate()

	if (!idTag || !attachments?.length) return null

	const docAtt = attachments[0]
	const thumbnailUrl = getFileUrl(idTag, docAtt.fileId, 'vis.tn', { token })

	function handleClick() {
		navigate(`/app/${idTag}/view/${idTag}:${docAtt.fileId}`)
	}

	return (
		<div
			onClick={handleClick}
			className="pos-relative d-inline-block"
			style={{ maxWidth: '100%', cursor: 'pointer' }}
		>
			<img
				alt=""
				src={thumbnailUrl}
				style={{ maxWidth: '100%', maxHeight: '30rem', display: 'block' }}
			/>
			<div
				className="pos-absolute d-flex align-items-center justify-content-center"
				style={{
					bottom: '0.5rem',
					right: '0.5rem',
					width: '2.5rem',
					height: '2.5rem',
					borderRadius: '50%',
					background: 'var(--col-feed-overlay, rgba(0, 0, 0, 0.6))',
					color: 'var(--col-on-primary, white)',
					fontSize: '1.25rem'
				}}
			>
				<IcDocument />
			</div>
		</div>
	)
}

////////////////////
// Comment Action //
////////////////////
interface CommentProps {
	className?: string
	action: ActionView
}
function Comment({ className, action }: CommentProps) {
	const urlContext = useUrlContextIdTag()
	if (typeof action.content != 'string') return null

	return (
		<div className={'c-panel ' + (className || '')}>
			<div className="c-panel-header d-flex">
				<Link to={`/profile/${urlContext || HOME_CONTEXT}/${action.issuer.idTag}`}>
					<ProfileCard profile={action.issuer} />
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

	useEditable(editorRef, onChange)

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
					<div ref={editorRef} className="c-input" tabIndex={0} onKeyDown={onKeyDown}>
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
	className
}: {
	comments: ActionView[]
	parentId: string
	className?: string
}) {
	return (
		<div className={mergeClasses('ms-3', className)}>
			{comments
				.filter((action) => action.type == 'CMNT' && action.parentId == parentId)
				.map((action) => (
					<Comment key={action.actionId} className="mb-1" action={action} />
				))}
		</div>
	)
}

interface CommentsProps {
	parentAction: ActionView
	onCommentsRead?: (read: number) => void
	className?: string
	style?: React.CSSProperties
}
function Comments({ parentAction, onCommentsRead, ...props }: CommentsProps) {
	const { api } = useApi()
	const [comments, setComments] = React.useState<ActionView[]>([])

	React.useEffect(() => {
		let timeout: ReturnType<typeof setTimeout> | undefined
		if (!api) return
		;(async function getComments() {
			const actions = await api.actions.list({
				parentId: parentAction.actionId,
				type: 'CMNT'
			})
			if (actions.length != parentAction.stat?.commentsRead) {
				timeout = setTimeout(async function () {
					await api.actions.updateStat(parentAction.actionId, {
						commentsRead: actions.length
					})
					onCommentsRead?.(actions.length)
					timeout = undefined
				}, 3000)
			}
			setComments(actions || [])
		})()
		return function cleanup() {
			if (timeout) clearTimeout(timeout)
		}
	}, [api, parentAction.actionId])

	function onSubmit(action: ActionView) {
		setComments([...comments, action])
		onCommentsRead?.(comments.length + 1)
	}

	return (
		<div {...props}>
			<SubComments comments={comments} parentId={parentAction.actionId} />
			<NewComment parentAction={parentAction} onSubmit={onSubmit} />
		</div>
	)
}

/////////////////
// Post Action //
/////////////////
interface PostProps {
	className?: string
	action: PostAction
	setAction: (action: PostAction) => void
	onDelete?: () => void
	hideAudience?: string
	srcTag?: string
	width: number
}
function Post({ className, action, setAction, onDelete, hideAudience, srcTag, width }: PostProps) {
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
	if (typeof action.content != 'string' && action.content !== undefined) return null

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

	async function onReactClick(reaction: string) {
		if (!api) return
		const isRemove = reaction === action.stat?.ownReaction
		const prevReaction = action.stat?.ownReaction
		const ra: NewAction = {
			type: 'REACT',
			subType: isRemove ? 'DEL' : reaction,
			audienceTag: action.audience?.idTag || action.issuer.idTag,
			subject: action.actionId
		}
		try {
			await api.actions.create(ra)
			let updatedReactions = action.stat?.reactions || ''
			if (isRemove) {
				updatedReactions = updateReactionCounts(updatedReactions, reaction, -1)
			} else {
				if (prevReaction) {
					updatedReactions = updateReactionCounts(updatedReactions, prevReaction, -1)
				}
				updatedReactions = updateReactionCounts(updatedReactions, reaction, 1)
			}
			setAction({
				...action,
				stat: {
					reactions: updatedReactions || undefined,
					comments: action.stat?.comments,
					ownReaction: isRemove ? undefined : reaction
				}
			})
		} catch (e) {
			console.error('Failed to send reaction', e)
		}
	}

	function onCommentsRead(read: number) {
		setAction({ ...action, stat: { ...action.stat, commentsRead: read } })
	}

	return (
		<>
			<div
				className={mergeClasses(
					'c-panel g-2',
					isInFlight && 'c-panel--in-flight',
					className
				)}
			>
				<div className="c-panel-header c-hbox align-items-center g-2">
					<Link to={`/profile/${urlContext || HOME_CONTEXT}/${action.issuer.idTag}`}>
						{action.audience && action.audience.idTag != hideAudience ? (
							<ProfileAudienceCard
								profile={action.issuer}
								audience={action.audience}
							/>
						) : (
							<ProfileCard profile={action.issuer} />
						)}
					</Link>
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
						<Button kind="link" disabled={process.env.NODE_ENV == 'production'}>
							<IcRepost />
						</Button>
						<PostMenu action={action} onDelete={onDelete} />
					</div>
				</div>
				<div className="d-flex flex-column">
					<TimeFormat time={action.createdAt} />
				</div>
				<div className="d-flex flex-column">
					{!!action.content &&
						action.content.split('\n\n').map((paragraph, i) => (
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
					{!!action.attachments?.length &&
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
					{/* generateFragments(action.content) */}
				</div>
				<div className="c-hbox">
					<div className="c-hbox">
						<ReactionPicker
							ownReaction={action.stat?.ownReaction}
							onReact={onReactClick}
						/>
					</div>
					<div className="c-hbox ms-auto g-3">
						{
							<Button
								kind="link"
								variant="secondary"
								className={mergeClasses(
									'pos-relative',
									tab == 'CMNT' ? 'active' : ''
								)}
								onClick={() => onTabClick('CMNT')}
							>
								<IcComment />
								<span className="c-badge pos-absolute top-100 left-100">
									{action.stat?.comments}
								</span>
								{(action.stat?.comments || 0) - (action.stat?.commentsRead || 0) >
									0 && (
									<span className="c-badge pos-absolute top-0 left-100 bg bg-error">
										{(action.stat?.comments || 0) -
											(action.stat?.commentsRead || 0)}
									</span>
								)}
							</Button>
						}
						{!!action.stat?.reactions &&
							parseReactionCounts(action.stat.reactions).map((r) => (
								<span
									key={r.key}
									className="c-hbox g-0"
									style={{ fontSize: '0.9em' }}
								>
									{r.emoji}
									<small>{r.count}</small>
								</span>
							))}
					</div>
				</div>
			</div>
			{tab == 'CMNT' && (
				<Comments parentAction={action} onCommentsRead={onCommentsRead} className="mt-1" />
			)}
		</>
	)
}

interface ActionCompProps {
	className?: string
	action: ActionEvt
	setAction: (actionId: string, action: ActionEvt) => void
	onDelete?: (actionId: string) => void
	hideAudience?: string
	srcTag?: string
	width: number
}
export const ActionComp = React.memo(function ActionComp({
	className,
	action,
	setAction,
	onDelete,
	hideAudience,
	srcTag,
	width
}: ActionCompProps) {
	switch (action.type) {
		case 'POST':
			return (
				<Post
					className={className}
					action={action as PostAction}
					setAction={(act) => setAction(act.actionId, act)}
					onDelete={onDelete ? () => onDelete(action.actionId) : undefined}
					hideAudience={hideAudience}
					srcTag={srcTag}
					width={width}
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

export type SourceFilter = 'all' | 'mine' | 'direct' | 'people' | 'communities' | 'public'

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
			{ value: 'public', label: t('Public'), icon: IcPublic }
		]
	}
	return [
		{ value: 'all', label: t('All'), icon: IcAll },
		{ value: 'mine', label: t('Mine'), icon: IcMine }
	]
}

interface FilterBarProps {
	viewMode: 'feed' | 'drafts'
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

	if (viewMode === 'drafts') return null

	const sourceOptions = getSourceFilters(t, isOwnContext)

	return (
		<div className="c-vbox pt-2">
			{/* Search */}
			<div className="c-input-group px-2 py-1">
				<span className="c-input-group-text">
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

			{/* Source filter */}
			<ul className="c-nav vertical low">
				<li className="c-nav-item">
					<span className="c-nav-link text-muted">{t('Source')}</span>
				</li>
				{sourceOptions.map((opt) => (
					<React.Fragment key={opt.value}>
						<li>
							<a
								className={mergeClasses(
									'c-nav-item ps-4',
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
								{opt.label}
							</a>
						</li>
						{opt.value === 'communities' &&
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
	}
}

export function FeedApp() {
	const location = useLocation()
	const { t } = useTranslation()
	const { api } = useApi()
	const [auth] = useAuth()
	const contextIdTag = useCurrentContextIdTag()
	const [showFilter, setShowFilter] = React.useState<boolean>(false)
	const [viewMode, setViewMode] = React.useState<'feed' | 'drafts'>('feed')
	const [sourceFilter, setSourceFilter] = React.useState<SourceFilter>('all')
	const [narrowToCommunity, setNarrowToCommunity] = React.useState<string | undefined>()
	const [searchQuery, setSearchQuery] = React.useState<string | undefined>()
	const [tagFilter, setTagFilter] = React.useState<string | undefined>()
	const { communities } = useCommunitiesList()
	const [composeOpen, setComposeOpen] = React.useState(false)
	const [editingDraft, setEditingDraft] = React.useState<ActionView | undefined>()
	const [composeMedia, setComposeMedia] = React.useState<
		'image' | 'camera' | 'video' | undefined
	>()
	const widthRef = React.useRef<HTMLDivElement>(null)
	const [width, setWidth] = React.useState(0)

	// Determine audience for feed (undefined for own context, contextIdTag for community)
	const isOwnContext = !contextIdTag || contextIdTag === auth?.idTag
	const audience = isOwnContext ? undefined : contextIdTag

	// Reset source filter when switching context (e.g. don't carry 'communities'
	// into a community context where it's invalid).
	React.useEffect(() => {
		setSourceFilter('all')
		setNarrowToCommunity(undefined)
	}, [contextIdTag])

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
		enabled: !!api?.idTag
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
			const tStatContent = T.struct({ r: T.optional(T.string), c: T.optional(T.number) })
			const contentRes = T.decode(tStatContent, action.content)
			if (!T.isOk(contentRes)) return
			const content = contentRes.ok
			setFeedUpdates((prev) => ({
				...prev,
				[action.parentId!]: {
					stat: {
						reactions: content.r,
						comments: content.c
					}
				}
			}))
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

	// Merge feed posts with local updates, filtering out deleted posts
	const mergedFeed = React.useMemo(() => {
		return feed
			.filter((post) => !deletedIds.has(post.actionId))
			.map((post) => {
				const update = feedUpdates[post.actionId]
				if (update) {
					return { ...post, ...update } as ActionEvt
				}
				return post as ActionEvt
			})
	}, [feed, feedUpdates, deletedIds])

	const setFeedAction = React.useCallback(function setFeedAction(
		actionId: string,
		action: ActionEvt
	) {
		setFeedUpdates((prev) => ({
			...prev,
			[actionId]: action
		}))
	}, [])

	const onSubmit = React.useCallback(
		function onSubmit(action: ActionEvt) {
			addPost(action)
		},
		[addPost]
	)

	const onDelete = React.useCallback(function onDelete(actionId: string) {
		setDeletedIds((prev) => new Set(prev).add(actionId))
	}, [])

	function handleComposeOpen(media?: 'image' | 'camera' | 'video') {
		setComposeMedia(media)
		setEditingDraft(undefined)
		setComposeOpen(true)
	}

	function handleComposeClose() {
		setComposeOpen(false)
		setComposeMedia(undefined)
		setEditingDraft(undefined)
	}

	function handleViewModeChange(mode: string) {
		setViewMode(mode as 'feed' | 'drafts')
		if (mode === 'drafts') {
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
						isOwnContext={isOwnContext}
						sourceFilter={sourceFilter}
						onSourceChange={(s) => {
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
				header={
					<div className="c-hbox align-items-center g-2 p-2">
						<Button
							kind="link"
							className="md-hide lg-hide"
							onClick={() => setShowFilter(true)}
						>
							<IcFilter />
						</Button>
						{!!auth && (
							<Tabs value={viewMode} onTabChange={handleViewModeChange}>
								<Tab value="feed">
									<IcAll className="me-1" />
									{t('Feed')}
								</Tab>
								<Tab value="drafts">
									<IcDraft className="me-1" />
									{t('Drafts')}
								</Tab>
							</Tabs>
						)}
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
						className="col"
					/>
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
								{mergedFeed.map((action) => (
									<ActionComp
										key={action.actionId}
										action={action}
										setAction={setFeedAction}
										onDelete={onDelete}
										hideAudience={
											!isOwnContext ? contextIdTag : narrowToCommunity
										}
										width={width}
									/>
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
