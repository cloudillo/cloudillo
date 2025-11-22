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
import { Link, NavLink, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useEditable, Position } from 'use-editable'
import dayjs from 'dayjs'
import { useTranslation } from 'react-i18next'
import debounce from 'debounce'

import {
	LuPlus as IcNew,
	LuMessagesSquare as IcConvList,

	LuImage as IcImage,
	LuSendHorizontal as IcSend,
	LuArrowDownToLine as IcScrollBottom,

	LuMessageCircle as IcComment,
	LuThumbsUp as IcLike,
	LuForward as IcShare,

	LuSmile as EmSmile,
	LuLaugh as EmLaugh,
	LuFrown as EmSad,
	LuMeh as EmMeh,
	LuHeart as EmHeart,
} from 'react-icons/lu'

import { Profile, ActionView, NewAction } from '@cloudillo/types'
import * as Types from '@cloudillo/base'
import { useAuth, useApi, Button, Fcb, IdentityTag, ProfileCard, mergeClasses } from '@cloudillo/react'
import '@cloudillo/react/src/components.css'

import { useAppConfig, parseQS, qs } from '../utils.js'
import { getBestImageId, ImageUpload } from '../image.js'
import { useWsBus } from '../ws-bus.js'
import { useCurrentContextIdTag } from '../context/index.js'

//////////////////////
// Action datatypes //
//////////////////////
interface MsgAction extends ActionView {
	type: 'MSG'
	parentId?: undefined
	content: string
}

interface MsgTextAction extends MsgAction {
	type: 'MSG'
	subType: undefined | 'TEXT'
	parentId?: undefined
	content: string
}

interface MsgImageAction extends MsgAction {
	type: 'MSG'
	subType: 'IMG'
	parentId?: undefined
	content: string
	attachments: ActionView['attachments']
	//attachments: [string]
}
export type ActionEvt = MsgAction | MsgTextAction | MsgImageAction

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

/////////////////
// Msg Action //
/////////////////
interface MsgProps {
	className?: string
	action: MsgAction
	local?: boolean
}
function Msg({ className, action, local }: MsgProps) {
	const { t } = useTranslation()
	const { api, setIdTag } = useApi()
	const [tab, setTab] = React.useState<undefined | 'CMNT' | 'LIKE' | 'SHRE'>(undefined)
	/*
	let imgSrc: string | undefined

	if (action.subType == 'IMG' && action.attachments?.[0]) {
		//console.log('url', api.url, action.user.tag, getBestImageId(action.attachments[0], 'sd'))
		imgSrc = `https://cl-o.${action.issuer.tag}/api/file/${getBestImageId(action.attachments[0], 'sd')}`
	}
	*/

	function onTabClick(clicked: 'CMNT' | 'LIKE' | 'SHRE') {
		if (clicked == tab) {
			setTab(undefined)
		} else {
			setTab(clicked)
		}
	}

	return <>
		<div className={mergeClasses('c-panel c-msg p-2 px-3 mb-1', local ? 'local primary' : 'remote secondary', className)}>
			{ !local && <div className="c-panel-header d-flex">
				<Link to={`/profile/${action.issuer.idTag}`}>
					<ProfileCard profile={action.issuer}/>
				</Link>
			</div> }
			<div className="d-flex flex-column">
				{/* imgSrc && <img src={imgSrc} className="mb-2 mx-auto w-max-100"/> */}
				{ typeof action.content != 'string' ? null : action.content.split('\n\n').map((paragraph, i) => <p key={i}>
					{ paragraph.split('\n').map((line, i) => <React.Fragment key={i}>
						{ generateFragments(line).map((n, i) => <React.Fragment key={i}>{n}</React.Fragment>) }
					<br/></React.Fragment>) }
				</p>) }
				{/* generateFragments(action.content) */}
			</div>
			{/*
			<div className="c-group">
				<Button link className={tab == 'CMNT' ? 'active' : ''} onClick={() => onTabClick('CMNT')}>
					<IcComment/>
					{!!action.comments && <span className="c-badge ms-1">{action.comments}</span>}
				</Button>
				<Button link className={tab == 'LIKE' ? 'active' : ''} onClick={() => onTabClick('LIKE')}>
					<IcLike/>
					{!!action.reactions && <span className="c-badge ms-1">{action.reactions}</span>}
				</Button>
				<Button link className={tab == 'SHRE' ? 'active' : ''} onClick={() => onTabClick('SHRE')}>
					<IcShare/>
				</Button>
			</div>
			*/}
		</div>
	</>
}

// New Msg
export function NewMsg({ className, style, idTag, onSubmit }: { className?: string, style?: React.CSSProperties, idTag: string, onSubmit?: (action: ActionEvt) => void }) {
	const { t } = useTranslation()
	const { api, setIdTag } = useApi()
	const [auth] = useAuth()
	const [type, setType] = React.useState<'TEXT' | 'IMG' | 'VIDEO'>('TEXT')
	const [content, setContent] = React.useState('')
	const [attachment, setAttachment] = React.useState<string | undefined>()
	const [attachmentId, setAttachmentId] = React.useState<string | undefined>()
	const editorRef = React.useRef<HTMLDivElement>(null)
	const imgInputId = React.useId()

	//useEditable(newPostRef, setContent)
	useEditable(editorRef, onChange)

	React.useEffect(() => {
		setTimeout(function () { console.log('blur+focus', editorRef.current), editorRef.current?.blur(), editorRef.current?.focus() }, 1000)
		//editorRef.current?.focus()
	}, [])

	function onCancel() {
		setAttachment(undefined)
		;(document.getElementById(imgInputId) as HTMLInputElement).value = ''
	}

	function onChange(text: string, pos: Position) {
		//console.log('onChange', text, pos)
		setContent(text)
	}

	function changeAttachment() {
		console.log('changeAttachment')
		const file = (document.getElementById(imgInputId) as HTMLInputElement)?.files?.[0]
		if (!file) return
		console.log('FILE', file)
		const reader = new FileReader()
		reader.onload = function (evt) {
			console.log('FILE', typeof evt?.target?.result)
			if (typeof evt?.target?.result == 'string') setAttachment(evt.target.result)
		}
		reader.readAsDataURL(file)
	}

	async function uploadAttachment(img: Blob) {
		console.log('upload attachment', img)
		if (!auth) return
	
		// Upload
		const request = new XMLHttpRequest()
		request.open('POST', `https://cl-o.${auth.idTag}/api/file/image/attachment`)
		//request.withCredentials = true
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
			setAttachmentId(j.attachment)
		})

		request.send(img)
		// / Upload

		//setProfileUpload(undefined)
	}

	async function doSubmit() {
		if (!api || !auth?.idTag || !content) return

		setContent('')
		//const action: Omit<PostAction, 'actionId' | 'user'> = {
		const action: NewAction = {
			type: 'MSG',
			subType: attachmentId ? 'IMG' : 'TEXT',
			content: content.trim(),
			attachments: attachmentId ? [attachmentId] : undefined,
			audienceTag: idTag
		}

		const res = await api.actions.create(action)
		console.log('MSG res', res)
		onSubmit?.({
			...res,
			issuer: { name: auth.name ?? '', idTag: auth.idTag, profilePic: auth.profilePic },
			audience: undefined
		} as ActionEvt)
		setAttachmentId(undefined)
		setTimeout(function () { editorRef.current?.blur(), editorRef.current?.focus() }, 0)
	}

	function onKeyDown(e: React.KeyboardEvent) {
		if (!e.shiftKey && e.key == 'Enter') {
			e.preventDefault()
			doSubmit()
		}
	}

	return <>
		<div className={mergeClasses('c-panel', className)}><div className="h-100" style={style}>
		<div className="c-input-group">
			<label htmlFor={imgInputId} className="c-button secondary align-self-start"><IcImage/></label>
			<input id={imgInputId} type="file" accept="image/*" style={{ display: 'none' }} onChange={changeAttachment}/>
			<div ref={editorRef} className="c-input flex-fill" tabIndex={0} onKeyDown={onKeyDown}>
				{ generateFragments(content).map((n, i) => <React.Fragment key={i}>{n}</React.Fragment>) }
			</div>
			<button className="c-button primary align-self-end" onClick={doSubmit}><IcSend/></button>
		</div>
	</div>
	</div>
		{ attachment && <ImageUpload src={attachment} aspects={['', '4:1', '3:1', '2:1', '16:9', '3:2', '1:1']} onSubmit={uploadAttachment} onCancel={onCancel}/> }
	</>
}

///////////////////////
// Conversation list //
///////////////////////
interface Conversation {
	id: string
	profiles: Profile[]
}

export function ConversationCard({ className, conversation }: { className?: string, conversation: Conversation }) {
	const [auth] = useAuth()
	const contextIdTag = useCurrentContextIdTag()
	const profile = conversation.profiles[0] || {}

	return <Link className={mergeClasses('c-nav-item', className)} to={`/app/${contextIdTag || auth?.idTag}/messages/${conversation.id}`}>
		<ProfileCard profile={profile}/>
	</Link>
}

interface ConversationFilter {
	q?: string
}

interface ConversationBarProps {
	className?: string
	filter: ConversationFilter
	setFilter: React.Dispatch<React.SetStateAction<ConversationFilter>>
	conversations?: Conversation[]
	activeId?: string
}

function ConversationBar({ className, filter, setFilter, conversations, activeId }: ConversationBarProps) {
	const { t } = useTranslation()
	const location = useLocation()
	const navigate = useNavigate()
	const [search, setSearch] = React.useState(filter.q || '')

	const qs = parseQS(location.search)

	const setFilterDebounced = React.useCallback(debounce(function setFilterD({ q }: { q?: string }) {
		setFilter(filter => ({ ...filter, q }))
	}, 300), [setFilter])

	function onSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
		setSearch(e.target.value)
		setFilterDebounced({ q: e.target.value })
	}

	return <div className={mergeClasses('c-nav vertical low', className)}>
		<div className="c-input-group mb-1">
			<input type="text" className="c-input" placeholder="Search" value={search} onChange={onSearchChange}/>
		</div>
		{ !!conversations && conversations.map(con => <ConversationCard
			key={con.profiles[0]?.idTag}
			conversation={con}
			className={activeId === con.id ? 'bg container-primary' : undefined}
		/>) }
	</div>
}

export function MessagesApp() {
	const { convId } = useParams()
	const navigate = useNavigate()
	const { t } = useTranslation()
	const [appConfig] = useAppConfig()
	const { api, setIdTag } = useApi()
	const [auth] = useAuth()
	const [showFilter, setShowFilter] = React.useState(!convId)
	const [filter, setFilter] = React.useState<ConversationFilter>({})
	const [conversations, setConversations] = React.useState<Conversation[] | undefined>()
	const [conversation, setConversation] = React.useState<Conversation | undefined>()
	const [msg, setMsg] = React.useState<ActionEvt[] | undefined>()
	const [text, setText] = React.useState('')
	const convRef = React.useRef<HTMLDivElement>(null)
	const [scrollBottom, setScrollBottom] = React.useState(true)

	useWsBus({ cmds: ['ACTION'] }, function handleAction(msg) {
		setMsg(msgs => [...(msgs || []), msg.data as ActionEvt])
	})

	React.useEffect(function loadConversations() {
		setConversations([]);
		if (!auth || !api) return

		(async function () {
			const conversationRes: { conversations: Conversation[] } = { conversations: [] }
			const profiles = await api.profiles.list({ ...filter, type: 'person', connected: true })
			console.log('profiles', profiles)
			const profileConvs: Conversation[] = profiles.map(profile => ({
				id: profile.idTag,
				profiles: [profile]
			}))
			setConversations([ ...conversationRes.conversations, ...profileConvs ])
		})()
	}, [auth, api, filter])

	React.useEffect(function loadMessages() {
		setShowFilter(!convId)
		if (!auth || !convId || !api) return
		(async function () {
			// Get profile by idTag
			try {
				const profile = await api.profiles.get(convId)
				const profileRes = { profiles: [profile] }
				console.log('profile', profileRes)

				setConversation({ id: convId, profiles: profileRes.profiles })
				const actions = await api.actions.list({ involved: convId, type: 'MSG' })
				console.log('Msg res', actions)
				setMsg((actions as any).sort((a: any, b: any) => dayjs(a.createdAt).unix() - dayjs(b.createdAt).unix()))
				//convRef.current?.scrollTo({ top: convRef.current.scrollHeight })
			} catch (err) {
				console.error('Failed to load messages', err)
			}
		})()
	}, [auth, convId, api])

	function onConvScroll() {
		if (!convRef.current) return

		const bottom = convRef.current?.scrollHeight - (convRef.current?.scrollTop + convRef.current?.clientHeight)
		//console.log('conv scroll', convRef.current?.scrollTop, convRef.current?.scrollHeight, convRef.current?.clientHeight, bottom)
		if (scrollBottom && bottom > 800) setScrollBottom(false)
		if (!scrollBottom && bottom <= 800) setScrollBottom(true)
	}

	function onConvScrollBottomClick() {
		setScrollBottom(true)
		convRef.current?.scrollTo({
			top: convRef.current.scrollHeight,
			behavior: 'smooth'
		})
	}

	React.useEffect(function scrollMessages() {
		//console.log('scroll info', convRef.current?.scrollTop, convRef.current?.scrollHeight, convRef.current?.clientHeight)
		if (scrollBottom) convRef.current?.scrollTo({
			top: convRef.current.scrollHeight,
			behavior: 'instant'
		})
	}, [msg])

	function onSubmit(action: ActionEvt) {
		console.log('onSubmit', action)
		setMsg([...(msg || []), action])
	}

	return <><Fcb.Container className="g-1">
		{ !!auth && <>
			<Fcb.Filter isVisible={showFilter} hide={() => setShowFilter(false)}>
				<ConversationBar className="col col-md-4 col-lg-3 h-100"
					filter={filter}
					setFilter={setFilter}
					conversations={conversations}
					activeId={convId}
				/>
			</Fcb.Filter>
			<Fcb.Content ref={convRef} onScroll={onConvScroll}
				header={<div className="c-nav c-hbox md-hide lg-hide">
					<IcConvList onClick={() => setShowFilter(true)}/>
					{convId && <IdentityTag idTag={convId}/>}
				</div>}
			>
				{ !scrollBottom && <button className="c-button float m-1 secondary pos-absolute bottom-0 right-0" onClick={onConvScrollBottomClick}><IcScrollBottom/></button> }
				{ !!msg && msg.sort((a, b) => +a.createdAt - +b.createdAt).map(action => <Msg key={action.actionId} action={action} local={action.issuer.idTag === auth?.idTag}/>) }
			</Fcb.Content>
			<Fcb.Details>
			</Fcb.Details>
		</> }
	</Fcb.Container>
	{ !!auth && !!convId && <NewMsg className="mt-1" idTag={convId} onSubmit={onSubmit}/> }
	</>
}

// vim: ts=4
