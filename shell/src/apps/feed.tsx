// This file is part of the Cloudillo Platform.
// Copyright (C) 2024  Szilárd Hajba
//
// Cloudillo is free software: you can redistribute it and/or modify
// it under the terms of the GNU Lesser General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Lesser General Public License for more details.
//
// You should have received a copy of the GNU Lesser General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

import * as React from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useEditable, Position } from 'use-editable'
import dayjs from 'dayjs'
import { useTranslation } from 'react-i18next'
import debounce from 'debounce'

import Lightbox from 'yet-another-react-lightbox'
import 'yet-another-react-lightbox/styles.css'
import Fullscreen from "yet-another-react-lightbox/plugins/fullscreen"
import Slideshow from "yet-another-react-lightbox/plugins/slideshow"
import Thumbnails from "yet-another-react-lightbox/plugins/thumbnails"
import Zoom from "yet-another-react-lightbox/plugins/zoom"
import "yet-another-react-lightbox/plugins/thumbnails.css"
import 'react-photo-album/rows.css'

import {
	FiPlus as IcNew
} from 'react-icons/fi'

import {
	LuCloud as IcAll,
	LuLockKeyhole as IcPrivate,
	LuLockKeyholeOpen as IcPublic,
	LuUser as IcUser,

	LuMessageCircle as IcComment,
	LuHeart as IcLike,
	LuSendHorizontal as IcSend,
	LuRepeat as IcRepost,
	LuEllipsis as IcMore,

	LuListChecks as IcPoll,
	LuCalendarDays as IcEvent,

	LuImage as IcImage,
	LuCamera as IcCamera,
	LuVideo as IcVideo,

	LuGlobe as IcGlobe,
	LuUsers as IcUsers,
	LuUserCheck as IcUserCheck,
} from 'react-icons/lu'

import { NewAction, ActionView } from '@cloudillo/types'
import { useAuth, useApi, Button, Popper, ProfilePicture, ProfileCard, ProfileAudienceCard, Fcd, mergeClasses, generateFragments, LoadingSpinner, EmptyState, SkeletonCard, TimeFormat } from '@cloudillo/react'
import '@cloudillo/react/src/components.css'

import { useAppConfig, parseQS, qs } from '../utils.js'
import { getBestImageId, ImageUpload } from '../image.js'
import { useWsBus } from '../ws-bus.js'
import { useCurrentContextIdTag } from '../context/index.js'
import { useImageUpload } from '../hooks/useImageUpload.js'
import { AttachmentPreview } from '../components/AttachmentPreview.js'

//////////////////////
// Action datatypes //
//////////////////////
/*
export type ActionEvt = PostAction | PostImageAction | PostVideoAction | CommentAction | ReactionAction
*/
interface PostAction extends ActionView {
	type: 'POST'
	stat?: {
		ownReaction?: string
		reactions?: number
		comments?: number
		commentsRead?: number
	}
}

type CommentAction = ActionView
export type ActionEvt = PostAction | ActionView

//////////////////////
// Image formatting //
//////////////////////
interface ImagesProps {
	idTag: string
	width: number
	srcTag?: string
	attachments: ActionView['attachments']
}
export function Images({ idTag, width, srcTag, attachments }: ImagesProps) {
	const [auth] = useAuth()
	const [lbIndex, setLbIndex] = React.useState<number | undefined>()
	const gap = 8
	const baseUrl = `https://cl-o.${srcTag || auth?.idTag || idTag}/api/file/`
	const [img1, img2, img3] = attachments || []
	//console.log('ATTACHMENTS', attachments, width)

	const photos = React.useMemo(() => attachments?.map(im => ({
		//src: `https://cl-o.${auth?.idTag}/api/file/${im.hd || im.sd || im.tn}`,
		src: `${baseUrl}${im.fileId}?variant=hd`,
		width: im.dim?.[0] || 100,
		height: im.dim?.[1] || 100
	})), [attachments])

	if (!attachments?.length) return null

	let imgNode: React.ReactNode

	switch (attachments?.length) {
		case 0:
			return null
		case 1:
			imgNode = <img className="cursor-pointer" onClick={() => setLbIndex(0)} src={baseUrl + img1.fileId + '?variant=sd'} style={{ maxWidth: '100%', maxHeight: '30rem', margin: '0 auto'}}/>
			break
		case 2: {
			const aspect12 = (img1.dim?.[0] ?? 100) / (img1.dim?.[1] ?? 100) + (img2.dim?.[0] ?? 100) / (img2.dim?.[1] ?? 100)
			//console.log('ASPECT', aspect12)
			const height = (width - gap) / aspect12

			imgNode = <div className="c-hbox g-2">
				<img className="cursor-pointer" onClick={() => setLbIndex(0)} src={baseUrl + img1.fileId + '?variant=sd'} style={{ height, margin: '0 auto'}}/>
				<img className="cursor-pointer" onClick={() => setLbIndex(1)} src={baseUrl + img2.fileId + '?variant=sd'} style={{ height, margin: '0 auto'}}/>
			</div>
			break
		}
		default:
		case 3: {
			// Adding the reciprocals of the aspect ratios of img2 and img3
			const aspect23 = 1 / (
				(img2.dim?.[1] ?? 100) / (img2.dim?.[0] ?? 100) + (img3.dim?.[1] ?? 100) / (img3.dim?.[0] ?? 100)
			)
			// Adding the aspect ratios of img1 and the right column (img2 and img3)
			const aspect123 = (img1.dim?.[0] ?? 100) / (img1.dim?.[1] ?? 100) + aspect23
			//console.log('ASPECT', aspect23, aspect123)
			const height = (width - gap) / aspect123
			const width23 = (height - gap) * aspect23
			//console.log('DIMS', { width, height, width23, attachmentsLength: attachments.length })

			imgNode = <div className="c-hbox g-2">
				<img className="cursor-pointer" onClick={() => setLbIndex(0)} src={baseUrl + img1.fileId + '?variant=sd'} style={{ height, margin: '0 auto'}}/>
				<div className="c-vbox">
					<img className="cursor-pointer" onClick={() => setLbIndex(1)} src={baseUrl + img2.fileId + '?variant=sd'} style={{ width: width23, margin: '0 auto'}}/>
					{ attachments.length == 3
						? <img className="cursor-pointer" onClick={() => setLbIndex(2)} src={baseUrl + img3.fileId + '?variant=sd'} style={{ width: width23, margin: '0 auto'}}/>
						: <div className="pos-relative" style={{ width: width23, margin: '0 auto'}}>
							<img className="w-100" src={baseUrl + img3.fileId + '?variant=sd'}/>
							<div onClick={() => setLbIndex(2)} className="c-image-overlay-counter cursor-pointer">+{attachments.length - 3}</div>
						</div>
					}
				</div>
			</div>
		}
	}

	return <>
		{ imgNode }
		<Lightbox
			slides={photos}
			open={lbIndex !== undefined}
			index={lbIndex}
			close={() => setLbIndex(undefined)}
			plugins={[Fullscreen, Slideshow, Thumbnails, Zoom]}
		/>
	</>
}

////////////////////
// Comment Action //
////////////////////
interface CommentProps {
	className?: string
	action: CommentAction
}
function Comment({ className, action }: CommentProps) {
	const { t } = useTranslation()
	if (typeof action.content != 'string') return null

	return <div className={'c-panel ' + (className || '')}>
		<div className="c-panel-header d-flex">
			<Link to={`/profile/${action.issuer.idTag}`}>
				<ProfileCard profile={action.issuer}/>
			</Link>
		</div><div>
			{ action.content.split('\n\n').map((paragraph, i) => <p key={i}>
				{ paragraph.split('\n').map((line, i) => <React.Fragment key={i}>
					{ generateFragments(line).map((n, i) => <React.Fragment key={i}>{n}</React.Fragment>) }
				<br/></React.Fragment>) }
			</p>) }
		</div>
	</div>
}

// New Post
function NewComment({ parentAction, className, style, onSubmit }: { parentAction: ActionView, className?: string, style?: React.CSSProperties, onSubmit?: (action: CommentAction) => void }) {
	const { api, setIdTag } = useApi()
	const { t } = useTranslation()
	const [auth] = useAuth()
	const [content, setContent] = React.useState('')
	const editorRef = React.useRef<HTMLDivElement>(null)

	useEditable(editorRef, onChange)

	React.useEffect(() => {
		editorRef.current?.focus()
	}, [editorRef])

	function onChange(text: string, pos: Position) {
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
		console.log('Feed res', actionRes)
		onSubmit?.(actionRes)
	}

	function onKeyDown(e: React.KeyboardEvent) {
		if (e.ctrlKey && e.key == 'Enter') {
			e.preventDefault()
			doSubmit()
		}
	}

	if (!auth?.name || !auth?.idTag) return false

	return <div className={mergeClasses('d-flex', className)} style={style}>
		<ProfilePicture profile={{ profilePic: auth.profilePic }} small/>
		<div className="c-panel p-1 flex-row flex-fill">
			<div className="c-input-group">
				<div ref={editorRef} className="c-input" tabIndex={0} onKeyDown={onKeyDown}>
					{ generateFragments(content).map((n, i) => <React.Fragment key={i}>{n}</React.Fragment>) }
				</div>
				<Button link primary className="align-self-end m-1" onClick={doSubmit}><IcSend/></Button>
			</div>
		</div>
	</div>
}

function SubComments({ comments, parentId, className, ...props }: { comments: CommentAction[], parentId: string, className?: string, style?: React.CSSProperties }) {
	return <div className={mergeClasses('ms-3', className)} {...props}>
		{ comments.filter<CommentAction>(
			(action): action is CommentAction => action.type == 'CMNT' && action.parentId == parentId
		).map(action => <Comment key={action.actionId} className="mb-1" action={action}/>) }
	</div>
}

interface CommentsProps {
	parentAction: ActionView
	onCommentsRead?: (read: number) => void
	className?: string
	style?: React.CSSProperties
}
function Comments({ parentAction, onCommentsRead, ...props }: CommentsProps) {
	const { api, setIdTag } = useApi()
	const [comments, setComments] = React.useState<ActionView[]>([])

	React.useEffect(() => {
		let timeout: ReturnType<typeof setTimeout> | undefined
		if (!api) return

		(async function getComments() {
			const actions = await api.actions.list({ parentId: parentAction.actionId, type: 'CMNT' })
			console.log('Comments res', actions)
			if (actions.length != parentAction.stat?.commentsRead) {
				timeout = setTimeout(async function () {
					await api.actions.updateStat(parentAction.actionId, { commentsRead: actions.length })
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

	function onSubmit(action: CommentAction) {
		setComments([...comments, action])
		onCommentsRead?.(comments.length + 1)
	}

	return <div {...props}>
		<SubComments comments={comments} parentId={parentAction.actionId}/>
		<NewComment parentAction={parentAction} onSubmit={onSubmit}/>
	</div>
}

/////////////////
// Post Action //
/////////////////
interface PostProps {
	className?: string
	action: PostAction
	setAction: (action: PostAction) => void
	hideAudience?: string
	srcTag?: string
	width: number
}
function Post({ className, action, setAction, hideAudience, srcTag, width }: PostProps) {
	const { t } = useTranslation()
	const [auth] = useAuth()
	const { api, setIdTag } = useApi()
	const [tab, setTab] = React.useState<undefined | 'CMNT' | 'LIKE' | 'SHRE'>(undefined)
	if (typeof action.content != 'string' && action.content !== undefined) return null

	function onTabClick(clicked: 'CMNT' | 'LIKE' | 'SHRE') {
		if (clicked == tab) {
			setTab(undefined)
		} else {
			setTab(clicked)
		}
	}

	async function onReactClick(reaction: 'LIKE') {
		if (!api) return
		const ra: NewAction & { content?: string } = {
			type: 'REACT',
			audienceTag: action.audience?.idTag || action.issuer.idTag,
			content: reaction !== action.stat?.ownReaction ? reaction : undefined,
			parentId: action.actionId
		}
		const actionRes = await api.actions.create(ra)
		console.log('react res', actionRes)
		setAction({ ...action, stat: {
			reactions: (action.stat?.reactions || 0) + (ra.content ? 1 : -1),
			comments: action.stat?.comments,
			ownReaction: ra.content
		}})
	}

	function onCommentsRead(read: number) {
		console.log('onCommentsRead', read, action)
		setAction({ ...action, stat: { ...action.stat, commentsRead: read }})
	}

	return <>
		<div className={mergeClasses('c-panel g-2', className)}>
			<div className="c-panel-header c-hbox">
				<Link to={`/profile/${action.issuer.idTag}`}>
					{ action.audience && action.audience.idTag != hideAudience
						? <ProfileAudienceCard profile={action.issuer} audience={action.audience}/>
						: <ProfileCard profile={action.issuer}/>
					}
				</Link>
				<div className="c-hbox ms-auto g-3">
					<button className="c-link" disabled={process.env.NODE_ENV == 'production'} onClick={() => console.log('share')}><IcRepost/></button>
					<button className="c-link" onClick={() => console.log('more')}><IcMore/></button>
				</div>
			</div><div className="d-flex flex-column">
				<TimeFormat time={action.createdAt}/>
			</div><div className="d-flex flex-column">
				{ !!action.content && action.content.split('\n\n').map((paragraph, i) => <p key={i}>
					{ paragraph.split('\n').map((line, i) => <React.Fragment key={i}>
						{ generateFragments(line).map((n, i) => <React.Fragment key={i}>{n}</React.Fragment>) }
					<br/></React.Fragment>) }
				</p>) }
				{ !!action.attachments?.length && <Images idTag={action.issuer.idTag} width={width} srcTag={srcTag} attachments={action.attachments || []}/> }
				{/* generateFragments(action.content) */}
			</div><div className="c-hbox">
				<div className="c-hbox">
					<Button link accent className={tab == 'LIKE' ? 'active' : ''} onClick={() => onReactClick('LIKE')}>
						<IcLike style={action.stat?.ownReaction ? { fill: 'currentColor' } : {}}/>
					</Button>
				</div>
				<div className="c-hbox ms-auto g-3">
					{ <Button link secondary className={mergeClasses('pos-relative', tab == 'CMNT' ? 'active' : '')} onClick={() => onTabClick('CMNT')}>
						<IcComment/>
						<span className="c-badge pos-absolute top-100 left-100">{action.stat?.comments}</span>
						{ (action.stat?.comments || 0) - (action.stat?.commentsRead || 0) > 0
							&& <span className="c-badge pos-absolute top-0 left-100 bg error">{(action.stat?.comments || 0) - (action.stat?.commentsRead || 0)}</span> }
					</Button> }
					{ !!action.stat?.reactions && <Button link secondary className={mergeClasses('pos-relative', tab == 'LIKE' ? 'active' : '')} onClick={() => onTabClick('LIKE')}>
						<IcLike/>
						<span className="c-badge pos-absolute top-100 left-100">{action.stat?.reactions}</span>
					</Button> }
				</div>
			</div>
		</div>
		{ tab == 'CMNT' && <Comments parentAction={action} onCommentsRead={onCommentsRead} className="mt-1"/> }
	</>
}

interface ActionCompProps {
	className?: string
	action: ActionEvt
	setAction: (actionId: string, action: ActionEvt) => void
	hideAudience?: string
	srcTag?: string
	width: number
}
export const ActionComp = React.memo(
function ActionComp({ className, action, setAction, hideAudience, srcTag, width }: ActionCompProps) {
	switch (action.type) {
		case 'POST': return <Post className={className} action={action as PostAction} setAction={act => setAction(act.actionId, act)} hideAudience={hideAudience} srcTag={srcTag} width={width}/>
	}
})

////////////////////////
// Visibility Selector //
////////////////////////
type Visibility = 'P' | 'C' | 'F'

const visibilityOptions: { value: Visibility; labelKey: string; icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; color: string }[] = [
	{ value: 'F', labelKey: 'Followers', icon: IcUserCheck, color: 'var(--c-primary, #6366f1)' },
	{ value: 'C', labelKey: 'Connected', icon: IcUsers, color: 'var(--c-warning, #f59e0b)' },
	{ value: 'P', labelKey: 'Public', icon: IcGlobe, color: 'var(--c-success, #22c55e)' },
]

interface VisibilitySelectorProps {
	value: Visibility
	onChange: (value: Visibility) => void
}

const VisibilitySelector = React.memo(function VisibilitySelector({ value, onChange }: VisibilitySelectorProps) {
	const { t } = useTranslation()
	const selected = visibilityOptions.find(o => o.value === value) || visibilityOptions[0]
	const Icon = selected.icon

	return (
		<Popper
			menuClassName="c-btn link secondary sm"
			icon={<Icon style={{ color: selected.color }} />}
		>
			<ul className="c-nav vertical emph">
				{visibilityOptions.map(opt => {
					const OptIcon = opt.icon
					const isActive = value === opt.value
					return (
						<li key={opt.value}>
							<button
								className={mergeClasses('c-nav-item', isActive && 'active')}
								onClick={() => onChange(opt.value)}
							>
								<OptIcon style={{ color: opt.color }} />
								{t(opt.labelKey)}
							</button>
						</li>
					)
				})}
			</ul>
		</Popper>
	)
})

// New Post
interface NewPostProps {
	className?: string
	style?: React.CSSProperties
	idTag?: string
	onSubmit?: (action: ActionEvt) => void
}

export const NewPost = React.memo(React.forwardRef(function NewPostInside({ className, style, idTag, onSubmit }: NewPostProps, ref: React.Ref<any>) {
	const { t } = useTranslation()
	const { api, setIdTag } = useApi()
	const [auth] = useAuth()
	const [type, setType] = React.useState<'TEXT' | 'IMG' | 'VIDEO' | 'POLL' | 'EVENT' | undefined>()
	const [content, setContent] = React.useState('')
	const [visibility, setVisibility] = React.useState<Visibility>('F')
	const editorRef = React.useRef(null)
	const fileInputRef = React.useRef<HTMLInputElement>(null)
	const imgInputRef = React.useRef<HTMLInputElement>(null)
	const videoInputRef = React.useRef<HTMLInputElement>(null)
	const fileInputId = React.useId()
	const imgInputId = React.useId()
	const videoInputId = React.useId()

	const imageUpload = useImageUpload()

	// Load default visibility from settings
	React.useEffect(() => {
		if (!api) return
		;(async function loadDefaultVisibility() {
			try {
				const setting = await api.settings.get('privacy.default_visibility')
				const value = setting?.value
				if (typeof value === 'string' && ['P', 'C', 'F'].includes(value)) {
					setVisibility(value as Visibility)
				}
			} catch (e) {
				// Use default 'F' if setting not found
				console.log('Using default visibility: F (Followers)')
			}
		})()
	}, [api])

	useEditable(editorRef, onChange)

	function onChange(text: string, pos: Position) {
		setContent(text)
	}

	function onFileChange(which: 'file' | 'image' | 'video') {
		if (!type) setType('IMG')
		const inputRef = which === 'image' ? imgInputRef : which === 'video' ? videoInputRef : fileInputRef
		const file = inputRef.current?.files?.[0]
		if (file) {
			imageUpload.selectFile(file)
			if (inputRef.current) inputRef.current.value = ''
		}
	}

	function onCancelCrop() {
		imageUpload.cancelCrop()
	}

	async function doSubmit() {
		if (!api || !auth?.idTag) return

		setContent('')
		const action: NewAction = {
			type: 'POST',
			subType: imageUpload.attachmentIds.length ? 'IMG' : 'TEXT',
			content,
			attachments: imageUpload.attachmentIds.length ? imageUpload.attachmentIds : undefined,
			audienceTag: idTag,
			visibility
		}

		const res = await api.actions.create(action)
		console.log('Feed res', res)
		onSubmit?.(res)
		imageUpload.reset()
	}

	function onKeyDown(e: React.KeyboardEvent) {
		if (e.ctrlKey && e.key == 'Enter') {
			e.preventDefault()
			doSubmit()
		}
	}

	if (!auth?.idTag) return

	return <>
		<div ref={ref} className={mergeClasses('c-panel g-2', className)}>
			<div className="c-hbox">
				<ProfilePicture profile={{ profilePic: auth.profilePic }} small/>
				<div className="c-input-group">
					<div ref={editorRef} className="c-input" tabIndex={0} onKeyDown={onKeyDown}>
						{ generateFragments(content).map((n, i) => <React.Fragment key={i}>{n}</React.Fragment>) }
					</div>
					<div className="c-hbox g-1 align-self-end m-1">
						<VisibilitySelector value={visibility} onChange={setVisibility}/>
						<Button link primary onClick={doSubmit}><IcSend/></Button>
					</div>
				</div>
			</div>
			<AttachmentPreview
				attachmentIds={imageUpload.attachmentIds}
				idTag={auth.idTag}
				onRemove={imageUpload.removeAttachment}
			/>
			<hr className="w-100"/>
			<div className="c-hbox g-3">
				<button className="c-link" disabled={process.env.NODE_ENV == 'production'} onClick={() => setType('POLL')}><IcPoll/>Poll</button>
				<button className="c-link" disabled={process.env.NODE_ENV == 'production'} onClick={() => setType('EVENT')}><IcEvent/>Event</button>
				<div className="c-hbox ms-auto">
					<label htmlFor={fileInputId} className="cursor-pointer"><IcImage/></label>
					<input ref={fileInputRef} id={fileInputId} type="file" accept="image/*,video/*,.pdf" style={{ display: 'none' }} onChange={() => onFileChange('file')}/>

					<label htmlFor={imgInputId} className="cursor-pointer"><IcCamera/></label>
					<input ref={imgInputRef} id={imgInputId} type="file" capture="environment" accept="image/*" style={{ display: 'none' }} onChange={() => onFileChange('image')}/>

					<label htmlFor={videoInputId} className="cursor-pointer"><IcVideo/></label>
					<input ref={videoInputRef} id={videoInputId} type="file" capture="environment" accept="video/*" style={{ display: 'none' }} onChange={() => onFileChange('video')}/>
				</div>
			</div>
		</div>
		{ imageUpload.attachment && <ImageUpload src={imageUpload.attachment} aspects={['', '4:1', '3:1', '2:1', '16:9', '3:2', '1:1']} onSubmit={imageUpload.uploadAttachment} onCancel={onCancelCrop}/> }
	</>
}))

const FilterBar = React.memo(
function FilterBar() {
	return <ul className="c-nav vertical low">
		<li><a className="c-nav-item" href="/app/feed"><IcAll/>All</a></li>
		<li><a className="c-nav-item" href="/app/feed?audience=public"><IcPublic/>Public</a></li>
		<li><a className="c-nav-item" href="/app/feed?audience=private"><IcPrivate/>Private</a></li>
		<li><a className="c-nav-item" href="/app/feed?audience=me"><IcUser/>Me</a></li>
	</ul>
		
})

export function FeedApp() {
	const navigate = useNavigate()
	const { t } = useTranslation()
	const [appConfig] = useAppConfig()
	const { api, setIdTag } = useApi()
	const [auth] = useAuth()
	const contextIdTag = useCurrentContextIdTag()
	const [feed, setFeed] = React.useState<ActionEvt[] | undefined>()
	const [text, setText] = React.useState('')
	const ref = React.useRef<HTMLDivElement>(null)
	const [width, setWidth] = React.useState(0)

	useWsBus({ cmds: ['ACTION'] }, function handleAction(msg) {
		const action = msg.data as ActionView

		switch (action.type) {
			case 'POST': return setFeed(function (feed) {
				const fIdx = feed?.findIndex(f => f.actionId === action.parentId) ?? -1
				return fIdx >= 0 ? feed : [action, ...(feed || [])]
			})
			case 'STAT': return setFeed(function (feed) {
				const fIdx = feed?.findIndex(f => f.actionId === action.parentId) ?? -1
				console.log('STAT inside fIdx', action.parentId, fIdx, feed)
				if (fIdx >= 0) {
					return feed?.map(f => {
						const content = action.content as { r?: number, c?: number }
						return f.actionId === action.parentId ? {
							...f,
							stat: {
								...f.stat,
								reactions: content.r,
								comments: content.c
							}
						} : f
					})
				} else {
					return feed
				}
			})
		}
	})

	React.useLayoutEffect(function () {
		//if (!ref.current || !api || !auth?.roles) return
		if (!ref.current || !api || !auth) return
		function onResize() {
			if (!ref.current) return
			const styles = getComputedStyle(ref.current)
			const w = (ref.current?.clientWidth || 0) - parseInt(styles.paddingLeft || '0') - parseInt(styles.paddingRight || '0')
			//console.log('WIDTH calc', ref.current, ref.current.clientWidth, styles, w, styles.paddingLeft, styles.paddingRight)
			if (width != w) setWidth(w)
		}

		onResize()
		window.addEventListener('resize', onResize)

		return function () {
			window.removeEventListener('resize', onResize)
		}
	}, [auth, api, ref])

	React.useEffect(function onLoadFeed() {
		console.log('FEED useEffect', !ref.current, !api, !auth)
		if (!api || !api.idTag || !auth) return
		const idTag = auth?.idTag

		;(async function () {
			const actions = await api.actions.list({ type: 'POST' })
			if (ref) console.log('Feed res', actions)
			setFeed(actions)
		})()
	}, [auth, api, ref])

	const setFeedAction = React.useCallback(function setFeedAction(actionId: string, action: ActionEvt) {
		setFeed(feed => !feed ? feed :  feed.map(f => f.actionId === actionId ? action : f))
	}, [])

	const onSubmit = React.useCallback(function onSubmit(action: ActionEvt) {
		setFeed(feed => [action, ...(feed || [])])
	}, [])

	const style = React.useMemo(() => ({ minHeight: '3rem' }), [])

	return <Fcd.Container className="g-1">
		{ !!auth && <>
			<Fcd.Filter>
				<FilterBar/>
			</Fcd.Filter>
			<Fcd.Content>
				<div><NewPost ref={ref} className="col" style={style} idTag={contextIdTag !== auth?.idTag ? contextIdTag : undefined} onSubmit={onSubmit}/></div>
				{ feed === undefined
					? <div className="c-vbox g-2 p-2">
						<SkeletonCard showAvatar showImage lines={2} />
						<SkeletonCard showAvatar lines={3} />
						<SkeletonCard showAvatar showImage lines={2} />
					</div>
					: feed.length === 0
						? <EmptyState
							icon={<IcAll style={{ fontSize: '2.5rem' }} />}
							title={t('No posts yet')}
							description={t('Be the first to share something with your community!')}
						/>
						: feed.map(action => <ActionComp key={action.actionId} action={action} setAction={setFeedAction} width={width}/>)
				}
			</Fcd.Content>
			<Fcd.Details>
			</Fcd.Details>
		</> }
	</Fcd.Container>
}

// vim: ts=4
