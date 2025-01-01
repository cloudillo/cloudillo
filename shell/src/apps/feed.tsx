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
import * as T from '@symbion/runtype'

import {
	FiPlus as IcNew
} from 'react-icons/fi'

import {
	LuMessageCircle as IcComment,
	LuHeart as IcLike,
	LuForward as IcShare,
	LuSendHorizontal as IcSend,
	LuRepeat as IcRepost,
	LuEllipsis as IcMore,

	LuListChecks as IcPoll,
	LuCalendarDays as IcEvent,

	LuImage as IcImage,
	LuCamera as IcCamera,
	LuVideo as IcVideo,

	LuSmile as EmSmile,
	LuLaugh as EmLaugh,
	LuFrown as EmSad,
	LuMeh as EmMeh,
	LuHeart as EmHeart,
} from 'react-icons/lu'

import { NewAction, ActionView, tActionView, tCommentAction } from '@cloudillo/types'
import { Button, ProfilePicture, ProfileCard, ProfileAudienceCard, Fcb, mergeClasses } from '@cloudillo/react'
import '@cloudillo/react/src/components.css'

import { useAppConfig, useApi, useAuth, parseQS, qs } from '../utils.js'
import { getBestImageId, ImageUpload } from '../image.js'

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
		comments?: number
		reactions?: number
	}
}

type CommentAction = ActionView
export type ActionEvt = PostAction | ActionView

/////////////////////
// Text formatting //
/////////////////////
const emojis: Record<string, React.ReactNode> = {
	':)': <EmSmile size="1em"/>, //'🙂',
	':D': <EmLaugh size="1em"/>, //'😀',
	':P': '😛',
	';P': '😜',
	':|': <EmMeh size="1em"/>, //'😐',
	':(': <EmSad size="1em"/>, //'🙁',
	//':O': '😮',
	//':.(': '😢',
	'<3': <EmHeart size="1em"/>, //'❤️️',
	'::': <img src="https://w9.hu/w9.png"/>
	//'::': <span><img src="https://w9.hu/w9.png"/><span className="d-inline-block" style={{ width: 0, overflow: 'hidden' }}>::</span></span>
}

function generateFragments(text: string): React.ReactNode[] {
	const fragments: React.ReactNode[] = []

	for (const w of text.split(/(\s+)/)) {
		let n: React.ReactNode = w

		switch (w[0]) {
			case 'h':
				if (w.match(/^https?:\/\//)) {
					if (w.startsWith(`https://${window.location.host}/`)) {
						n = <Link to={w.replace(`https://${window.location.host}/`, '/')}>{w}</Link>
					} else {
						n = <a href={w} target="_blank">{w}</a>
					}
				}
				break
			case '#':
				if (w.match(/^#\S+/)) {
					n = <span className="c-tag">{w}</span>
				}
				break
			case ':':
			case ';':
			case '<':
			case '8':
				const emoji = emojis[w]
				if (typeof emoji == 'object') {
					n = <span>{emojis[w]}<span className="d-inline-block" style={{ width: 0, overflow: 'hidden' }}>{w}</span></span>
				} else {
					n = emoji || w
				}
				break
		}
		//if (typeof n == 'string') n = htmlEncode(n)
		const last = fragments[fragments.length - 1]
		if (typeof n == 'string' && typeof last == 'string') {
			fragments[fragments.length - 1] = last + n
		} else {
			fragments.push(n)
		}
	}
	return fragments
}

//////////////////////
// Image formatting //
//////////////////////
export function Images({ idTag, width, attachments }: { idTag: string, width: number, attachments: ActionView['attachments'] }) {
	const gap = 8
	const baseUrl = `https://cl-o.${idTag}/api/store/`
	const [img1, img2, img3] = attachments || []
	console.log('ATTACHMENTS', attachments, width)

	if (!attachments?.length) return null

	switch (attachments?.length) {
		case 0:
			return null
		case 1:
			return <img src={baseUrl + (img1.sd || img1.hd)} style={{ maxWidth: '100%', maxHeight: '30rem', margin: '0 auto'}}/>
		case 2: {
			const aspect12 = (img1.dim?.[0] ?? 100) / (img1.dim?.[1] ?? 100) + (img2.dim?.[0] ?? 100) / (img2.dim?.[1] ?? 100)
			console.log('ASPECT', aspect12)
			const height = (width - gap) / aspect12

			return <div className="c-hbox g-2">
				<img src={baseUrl + (img1.sd || img1.hd)} style={{ height, margin: '0 auto'}}/>
				<img src={baseUrl + (img2.sd || img2.hd)} style={{ height, margin: '0 auto'}}/>
			</div>
		}
		default:
		case 3: {
			// Adding the reciprocals of the aspect ratios of img2 and img3
			const aspect23 = 1 / (
				(img2.dim?.[1] ?? 100) / (img2.dim?.[0] ?? 100) + (img3.dim?.[1] ?? 100) / (img3.dim?.[0] ?? 100)
			)
			// Adding the aspect ratios of img1 and the right column (img2 and img3)
			const aspect123 = (img1.dim?.[0] ?? 100) / (img1.dim?.[1] ?? 100) + aspect23
			console.log('ASPECT', aspect23, aspect123)
			const height = (width - gap) / aspect123
			const width23 = (height - gap) * aspect23
			console.log('DIMS', { width, height, width23, attachmentsLength: attachments.length })

			return <div className="c-hbox g-2">
				<img src={baseUrl + (img1.sd || img1.hd)} style={{ height, margin: '0 auto'}}/>
				<div className="c-vbox">
					<img src={baseUrl + (img2.sd || img2.hd)} style={{ width: width23, margin: '0 auto'}}/>
					{ attachments.length == 3
						? <img src={baseUrl + (img3.sd || img3.hd)} style={{ width: width23, margin: '0 auto'}}/>
						: <div className="pos relative" style={{ width: width23, margin: '0 auto'}}>
							<img className="w-100" src={baseUrl + (img3.sd || img3.hd)}/>
							<div className="c-image-overlay-counter">+{attachments.length - 3}</div>
						</div>
					}
				</div>
			</div>
		}
	}
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
function NewComment({ actionId, className, style, onSubmit }: { actionId: string, className?: string, style?: React.CSSProperties, onSubmit?: (action: CommentAction) => void }) {
	const api = useApi()
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
			parentId: actionId
		}

		const actionRes = await api.post('', '/action', { type: tActionView, data: action })
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
		<ProfilePicture profile={{ name: auth.name, idTag: auth.idTag, profilePic: auth.profilePic }} small/>
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

function Comments({ actionId, ...props }: { actionId: string, className?: string, style?: React.CSSProperties }) {
	const api = useApi()
	const [comments, setComments] = React.useState<ActionView[]>([])

	React.useEffect(() => {
		if (!api) return

		(async function getComments() {
			const res = await api.get('', `/action?parentId=${actionId}&types=CMNT`, {
				type: T.struct({ actions: T.array(tActionView) })
			})
			console.log('Comments res', res)
			setComments(res.actions || [])
		})()
	}, [api, actionId])

	function onSubmit(action: CommentAction) {
		setComments([...comments, action])
	}

	return <div {...props}>
		<SubComments comments={comments} parentId={actionId}/>
		<NewComment actionId={actionId} onSubmit={onSubmit}/>
	</div>
}

/////////////////
// Post Action //
/////////////////
interface PostProps {
	className?: string
	action: PostAction
	setAction: (action: PostAction) => void
	width: number
}
function Post({ className, action, setAction, width }: PostProps) {
	const { t } = useTranslation()
	const [auth] = useAuth()
	const api = useApi()
	const [tab, setTab] = React.useState<undefined | 'CMNT' | 'LIKE' | 'SHRE'>(undefined)
	if (typeof action.content != 'string' && action.content !== undefined) return null
	console.log('Post action', action)

	function onTabClick(clicked: 'CMNT' | 'LIKE' | 'SHRE') {
		if (clicked == tab) {
			setTab(undefined)
		} else {
			setTab(clicked)
		}
	}

	async function onReactClick(reaction: 'LIKE') {
		const ra: NewAction & { content?: string } = {
			type: 'REACT',
			content: reaction !== action.stat?.ownReaction ? reaction : undefined,
			parentId: action.actionId
		}
		const actionRes = await api.post('', '/action', { type: tActionView, data: ra })
		console.log('react res', actionRes)
		setAction({ ...action, stat: { ...action.stat, ownReaction: ra.content } })
	}

	return <>
		<div className={mergeClasses('c-panel g-2', className)}>
			<div className="c-panel-header c-hbox">
				<Link to={`/profile/${action.issuer.idTag}`}>
					{ action.audience
						? <ProfileAudienceCard profile={action.issuer} audience={action.audience}/>
						: <ProfileCard profile={action.issuer}/>
					}
				</Link>
				<div className="c-hbox ms-auto g-3">
					<button className="c-link" onClick={() => console.log('share')}><IcRepost/></button>
					<button className="c-link" onClick={() => console.log('more')}><IcMore/></button>
				</div>
			</div><div className="d-flex flex-column">
				{ !!action.content && action.content.split('\n\n').map((paragraph, i) => <p key={i}>
					{ paragraph.split('\n').map((line, i) => <React.Fragment key={i}>
						{ generateFragments(line).map((n, i) => <React.Fragment key={i}>{n}</React.Fragment>) }
					<br/></React.Fragment>) }
				</p>) }
				{ !!action.attachments?.length && <Images idTag={action.issuer.idTag} width={width} attachments={action.attachments || []}/> }
				{/* imgSrc
					? <img src={imgSrc} className="mb-2 mx-auto w-max-100"/>
					: <hr className="w-100"/>
				*/}
				{/* generateFragments(action.content) */}
			</div><div className="c-hbox">
				<div className="c-hbox">
					<Button link accent className={tab == 'LIKE' ? 'active' : ''} onClick={() => onReactClick('LIKE')}>
						<IcLike style={action.stat?.ownReaction ? { fill: 'currentColor' } : {}}/>
					</Button>
				</div>
				<div className="c-hbox ms-auto g-3">
					{ <Button link secondary className={tab == 'CMNT' ? 'active' : ''} onClick={() => onTabClick('CMNT')}>
						<IcComment/>
						<span>{action.stat?.comments}</span>
					</Button> }
					{ !!action.stat?.reactions && <Button link secondary className={tab == 'LIKE' ? 'active' : ''} onClick={() => onTabClick('LIKE')}>
						<IcLike/>
						<span>{action.stat?.reactions}</span>
					</Button> }
					{/*
					<Button link className={tab == 'SHRE' ? 'active' : ''} onClick={() => onTabClick('SHRE')}>
						<IcShare/>
					</Button>
					*/}
				</div>
			</div>
		</div>
		{ tab == 'CMNT' && <Comments actionId={action.actionId} className="mt-1"/> }
	</>
}

export function ActionComp({ className, action, setAction, width }: { className?: string, action: ActionEvt, setAction: (action: ActionEvt) => void, width: number }) {
	switch (action.type) {
		case 'POST': return <Post className={className} action={action as PostAction} setAction={setAction} width={width}/>
	}
}

// New Post
//export function NewPost({ className, style, idTag, onSubmit, ...props }: { className?: string, style?: React.CSSProperties, idTag?: string, ref: React.Ref<any>, onSubmit?: (action: ActionEvt) => void }) {
export const NewPost = React.forwardRef(function NewPostInside({ className, style, idTag, onSubmit }: { className?: string, style?: React.CSSProperties, idTag?: string, onSubmit?: (action: ActionEvt) => void }, ref: React.Ref<any>) {
	const { t } = useTranslation()
	const api = useApi()
	const [auth] = useAuth()
	const [type, setType] = React.useState<'TEXT' | 'IMG' | 'VIDEO' | 'POLL' | 'EVENT' | undefined>()
	const [content, setContent] = React.useState('')
	const [attachment, setAttachment] = React.useState<string | undefined>()
	const [attachmentIds, setAttachmentIds] = React.useState<string[]>([])
	const editorRef = React.useRef(null)
	const fileInputId = React.useId()
	const imgInputId = React.useId()
	const videoInputId = React.useId()

	//useEditable(newPostRef, setContent)
	//console.log('editorRef', editorRef)
	useEditable(editorRef, onChange)

	function onCancel() {
		setAttachment(undefined)
		;(document.getElementById(imgInputId) as HTMLInputElement).value = ''
	}

	function onChange(text: string, pos: Position) {
		//console.log('onChange', text, pos)
		setContent(text)
	}

	function changeAttachment(which: 'file' | 'image' | 'video') {
		console.log('changeAttachment')
		if (!type) setType('IMG')
		const file = ((
			which == 'image' ? document.getElementById(imgInputId)
			: which == 'video' ? document.getElementById(videoInputId)
			: document.getElementById(fileInputId)
		) as HTMLInputElement)?.files?.[0]
		if (!file) return
		console.log('FILE', file)
		const reader = new FileReader()
		reader.onload = function (evt) {
			console.log('FILE', typeof evt?.target?.result)
			if (typeof evt?.target?.result == 'string') setAttachment(evt.target.result)
			switch (which) {
				case 'file': (document.getElementById(fileInputId) as HTMLInputElement).value = ''; break
				case 'image': (document.getElementById(imgInputId) as HTMLInputElement).value = ''; break
				case 'video': (document.getElementById(videoInputId) as HTMLInputElement).value = ''; break
			}
		}
		reader.readAsDataURL(file)
	}

	async function uploadAttachment(img: Blob) {
		console.log('upload attachment', img)
	
		// Upload
		const request = new XMLHttpRequest()
		request.open('POST', '/api/store/image/attachment')
		request.setRequestHeader('Authorization', `Bearer ${auth?.token}`)

		request.upload.addEventListener('progress', function(e) {
			const percent_completed = (e.loaded / e.total) * 100
			console.log(percent_completed)
		})
		request.addEventListener('load', function(e) {
			console.log('RES', request.status, request.response)
			const j = JSON.parse(request.response)
			setAttachment(undefined)
			;(document.getElementById(imgInputId) as HTMLInputElement).value = ''
			setAttachmentIds(a => [...a, j.attachment])
		})

		request.send(img)
		// / Upload

		//setProfileUpload(undefined)
	}

	async function doSubmit() {
		if (!api || !auth?.idTag) return

		setContent('')
		//const action: Omit<PostAction, 'actionId' | 'user'> = {
		const action: NewAction = {
			type: 'POST',
			subType: attachmentIds.length ? 'IMG' : 'TEXT',
			content,
			attachments: attachmentIds.length ? attachmentIds : undefined,
			audienceTag: idTag
		}

		const res = await api.post<ActionView>('', '/action', { data: action })
		console.log('Feed res', res)
		onSubmit?.(res)
		setAttachmentIds([])
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
				<ProfilePicture profile={{ name: auth.name ?? '', idTag: auth.idTag, profilePic: auth.profilePic }} small/>
				<div className="c-input-group">
					<div ref={editorRef} className="c-input" tabIndex={0} onKeyDown={onKeyDown}>
						{ generateFragments(content).map((n, i) => <React.Fragment key={i}>{n}</React.Fragment>) }
					</div>
					<Button link primary className="align-self-end m-1" onClick={doSubmit}><IcSend/></Button>
				</div>
			</div>
			{ !!attachmentIds.length && <div className="c-hbox wrap mu-2">
				{ attachmentIds.map((id) => <img key={id} className="c-thumbnail" src={`https://cl-o.${auth.idTag}/api/store/${id.split(':')[1].split(',')[0]}/tn`}/>) }
			</div> }
			<hr className="w-100"/>
			<div className="c-hbox g-3">
				<button className="c-link" onClick={() => setType('POLL')}><IcPoll/>Poll</button>
				<button className="c-link" onClick={() => setType('EVENT')}><IcEvent/>Event</button>
				<div className="c-hbox ms-auto">
					<label htmlFor={fileInputId} className="cursor-pointer"><IcImage/></label>
					<input id={fileInputId} type="file" accept="image/*,video/*,.pdf" style={{ display: 'none' }} onChange={() => changeAttachment('file')}/>

					<label htmlFor={imgInputId} className="cursor-pointer"><IcCamera/></label>
					<input id={imgInputId} type="file" capture="environment" accept="image/*" style={{ display: 'none' }} onChange={() => changeAttachment('image')}/>

					<label htmlFor={videoInputId} className="cursor-pointer"><IcVideo/></label>
					<input id={videoInputId} type="file" capture="environment" accept="video/*" style={{ display: 'none' }} onChange={() => changeAttachment('video')}/>
				</div>
			</div>
		</div>
		{ attachment && <ImageUpload src={attachment} aspects={['', '4:1', '3:1', '2:1', '16:9', '3:2', '1:1']} onSubmit={uploadAttachment} onCancel={onCancel}/> }
	</>
})

function FilterBar() {
	return <ul className="c-panel c-nav">
		<li className="c-nav-item"><a href="/app/feed">All</a></li>
		<li className="c-nav-item"><a href="/app/feed?audience=public">Public</a></li>
		<li className="c-nav-item"><a href="/app/feed?audience=private">Private</a></li>
		<li className="c-nav-item"><a href="/app/feed?audience=me">Me</a></li>
	</ul>
		
}

export function FeedApp() {
	const navigate = useNavigate()
	const { t } = useTranslation()
	const [appConfig] = useAppConfig()
	const api = useApi()
	const [auth] = useAuth()
	const [feed, setFeed] = React.useState<ActionEvt[] | undefined>()
	const [text, setText] = React.useState('')
	const ref = React.useRef<HTMLDivElement>(null)
	const [width, setWidth] = React.useState(0)

	if (feed) console.log('Feed state', feed)

	React.useLayoutEffect(function () {
		console.log('Here 1', ref)
		if (!ref.current || !api || !auth?.roles) return
		console.log('Here 2')
		function onResize() {
			if (!ref.current) return
			const styles = getComputedStyle(ref.current)
			const w = (ref.current?.clientWidth || 0) - parseInt(styles.paddingLeft || '0') - parseInt(styles.paddingRight || '0')
			console.log('WIDTH calc', ref.current, ref.current.clientWidth, styles, w, styles.paddingLeft, styles.paddingRight)
			if (width != w) setWidth(w)
		}

		onResize()
		window.addEventListener('resize', onResize)

		return function () {
			window.removeEventListener('resize', onResize)
		}
	}, [auth, api, ref])

	React.useEffect(function onLoadFeed() {
		if (!api || !auth?.roles) return
		const idTag = location.hostname // FIXME

		;(async function () {
			//const res = await api.get<{ actions: ActionEvt[] }>('', `/action?audience=${idTag}&types=POST`)
			const res = await api.get<{ actions: ActionEvt[] }>('', `/action?types=POST`)
			if (ref) console.log('Feed res', res)
			setFeed(res.actions)
		})()
	}, [auth, api, ref])

	function setFeedAction(actionId: string, action: ActionEvt) {
		if (feed) setFeed(feed.map(f => f.actionId === actionId ? action : f))
	}

	function onSubmit(action: ActionEvt) {
		setFeed([action, ...(feed || [])])

	}

		//{ !!auth && auth.roles?.includes(0) && <>
	return <Fcb.Container className="g-1">
		{ !!auth && <>
			<Fcb.Filter>
				<FilterBar/>
			</Fcb.Filter>
			<Fcb.Content>
				<div><NewPost ref={ref} className="col" style={{ minHeight: '3rem' }} onSubmit={onSubmit}/></div>
				{ !!feed && feed.map(action =>  <ActionComp key={action.actionId} action={action} setAction={act => setFeedAction(action.actionId, act)} width={width}/>) }
			</Fcb.Content>
			<Fcb.Details>
			</Fcb.Details>
		</> }
	</Fcb.Container>
}

// vim: ts=4
