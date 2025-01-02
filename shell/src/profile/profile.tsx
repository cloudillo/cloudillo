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

import React from 'react'
import { useTranslation, Trans } from 'react-i18next'
import { Link, NavLink, Routes, Route, useParams, useLocation } from 'react-router-dom'
import Markdown from 'react-markdown'
import ReactQuill, { Quill } from 'react-quill-new'
import QuillMarkdown from 'quilljs-markdown'
import Turndown from 'turndown'

import { Button, Container, Fcb } from '@cloudillo/react'
import { NewAction } from '@cloudillo/types'

import {
	FiEdit2 as IcEdit,
	FiSave as IcSave,
	FiX as IcCancel
} from 'react-icons/fi'

import 'quill/dist/quill.core.css'
import 'quill/dist/quill.bubble.css'
import 'react-image-crop/dist/ReactCrop.css'
import './profile.css'

import { useAuth, useApi } from '@cloudillo/react'

import { ImageUpload } from '../image.js'
import { ActionEvt, ActionComp, NewPost } from '../apps/feed.js'
import { UserListPage, CommunityListPage } from './identities.js'

Quill.register('modules/QuillMarkdown', QuillMarkdown)

interface Profile {
	tnId: number
	idTag: string
	name: string
	profilePic?: {
		ic: string
		sd?: string
		hd?: string
	}
	coverPic?: {
		sd: string
		hd: string
	}
	x?: {
		category?: string
		intro?: string
	}
}

interface ProfilePatch {
	name?: string
	x?: {
		category?: string
		intro?: string
	}
}

export function ProfilePage({ profile, setProfile, updateProfile, children }: { profile: Profile, setProfile: React.Dispatch<React.SetStateAction<Profile | undefined>>, updateProfile?: (profile: Profile) => void, children: React.ReactNode }) {
	const { t } = useTranslation()
	const [auth, setAuth] = useAuth()
	const own = auth?.idTag === profile.idTag
	const api = useApi()
	const [coverUpload, setCoverUpload] = React.useState<string | undefined>()
	const [profileUpload, setProfileUpload] = React.useState<string | undefined>()
	const inputId = React.useId()
	const profileInputId = React.useId()

	async function onFollow() {
		const followAction: NewAction = {
			type: 'FLLW',
			audienceTag: profile.idTag,
		}
		const res = await api?.post('', '/action', { data: followAction })
	}

	function onCancel() {
		setProfileUpload(undefined)
		setCoverUpload(undefined)
	}

	async function uploadCover(img: Blob) {
		console.log('upload cover', img)
	
		// Upload
		const request = new XMLHttpRequest()
		request.open('PUT', '/api/me/cover');
		request.setRequestHeader('Authorization', `Bearer ${auth?.token}`)

		request.upload.addEventListener('progress', function(e) {
			const percent_completed = (e.loaded / e.total) * 100
			console.log(percent_completed)
		})
		request.addEventListener('load', function(e) {
			console.log('RES', request.status, request.response)
			const coverPic = JSON.parse(request.response)
			if (profile) setProfile(p => p ? { ...p, coverPic } : p)
		})

		request.send(img)
		// / Upload

		setCoverUpload(undefined)
	}

	async function uploadProfile(img: Blob) {
		console.log('upload profile', img)
	
		// Upload
		const request = new XMLHttpRequest()
		request.open('PUT', '/api/me/image');
		request.setRequestHeader('Authorization', `Bearer ${auth?.token}`)

		request.upload.addEventListener('progress', function(e) {
			const percent_completed = (e.loaded / e.total) * 100
			console.log(percent_completed)
		})
		request.addEventListener('load', function(e) {
			console.log('RES', request.status, request.response)
			const profilePic = JSON.parse(request.response)
			if (profile) setProfile(p => p ? { ...p, profilePic } : p)
			if (auth?.tnId == profile.tnId) setAuth(a => a ? {  ...a, profilePic: profilePic.ic } : a)
		})

		request.send(img)
		// / Upload

		setProfileUpload(undefined)
	}

	function changeCover() {
		console.log('changeCover')
		const file = (document.getElementById(inputId) as HTMLInputElement)?.files?.[0]
		if (!file) return
		const reader = new FileReader()
		reader.onload = function (evt) {
			if (typeof evt?.target?.result == 'string') setCoverUpload(evt.target.result)
		}
		reader.readAsDataURL(file)
	}

	function changeProfile() {
		console.log('changeProfile')
		const file = (document.getElementById(profileInputId) as HTMLInputElement)?.files?.[0]
		if (!file) return
		const reader = new FileReader()
		reader.onload = function (evt) {
			if (typeof evt?.target?.result == 'string') setProfileUpload(evt.target.result)
		}
		reader.readAsDataURL(file)
	}

	return <Fcb.Container className="g-1">
		{ !!auth && <>
			<Fcb.Filter>
			</Fcb.Filter>
			<Fcb.Content>
				<div className="c-panel p-0 pos relative d-flex flex-column">
					<div className="c-profile-header pos relative w-100" style={{ minHeight: '160px' }}>
						{ profile.coverPic &&
							<img className="c-profile-cover w-100" src={`https://cl-o.${profile.idTag}/api/store/${profile?.coverPic?.hd || profile?.coverPic.sd}`}/>
						}
						{ own && <>
							<label htmlFor={inputId} className="c-overlay-icon pos absolute top-0 right-0 m-2">
								<IcEdit size="2rem"/>
							</label>
							<input id={inputId} type="file" accept="image/*" style={{ display: 'none' }} onChange={changeCover}/>
						</> }
						<div className="c-profile-pic-container">
							{ profile.profilePic
								? <img className="c-profile-pic" src={`https://cl-o.${profile.idTag}/api/store/${profile.profilePic.sd || profile.profilePic.ic}`} alt="Profile picture"/>
								: <svg className="c-profile-pic" viewBox="4 4 16 16" fill="none">
									<path d="M12 22.01C17.5228 22.01 22 17.5329 22 12.01C22 6.48716 17.5228 2.01001 12 2.01001C6.47715 2.01001 2 6.48716 2 12.01C2 17.5329 6.47715 22.01 12 22.01Z" fill="#ADB3BA"/>
									<path d="M12 6.93994C9.93 6.93994 8.25 8.61994 8.25 10.6899C8.25 12.7199 9.84 14.3699 11.95 14.4299C11.98 14.4299 12.02 14.4299 12.04 14.4299C12.06 14.4299 12.09 14.4299 12.11 14.4299C12.12 14.4299 12.13 14.4299 12.13 14.4299C14.15 14.3599 15.74 12.7199 15.75 10.6899C15.75 8.61994 14.07 6.93994 12 6.93994Z" fill="#292D32"/>
									<path d="M18.7807 19.36C17.0007 21 14.6207 22.01 12.0007 22.01C9.3807 22.01 7.0007 21 5.2207 19.36C5.4607 18.45 6.1107 17.62 7.0607 16.98C9.7907 15.16 14.2307 15.16 16.9407 16.98C17.9007 17.62 18.5407 18.45 18.7807 19.36Z" fill="#292D32"/>
								</svg>
							}
							{ own && <>
								<label htmlFor={profileInputId} className="c-overlay-icon pos absolute" style={{ bottom: '1.5rem', right: '2.5rem'}}>
									<IcEdit size="2rem"/>
								</label>
								<input id={profileInputId} type="file" accept="image/*" style={{ display: 'none' }} onChange={changeProfile}/>
							</> }
						</div>
					</div>
					<div className="c-profile-title">
						<h2 className="mt-2">{profile.name}</h2>
						<h4>{profile.idTag}</h4>
					</div>
					<div className="c-tabs">
						<NavLink className="c-tab" to={`/profile/${own ? 'me' : profile.idTag}/feed`} end >{t('Feed')}</NavLink>
						<NavLink className="c-tab" to={`/profile/${own ? 'me' : profile.idTag}/about`} end >{t('About')}</NavLink>
						{ own && <>
							<NavLink className="c-tab" to="/profile/settings">{t('Settings')}</NavLink>
						</> }
						<div className="flex-fill"/>
						{ auth?.idTag && !own && <>
							<Button className="mb-1 me-1" onClick={onFollow}>{t('Follow')}</Button>
						</> }
					</div>
				</div>
				{children}
				{ coverUpload && <ImageUpload src={coverUpload} aspects={['', '4:1', '3:1']} onSubmit={uploadCover} onCancel={onCancel}/> }
				{ profileUpload && <ImageUpload src={profileUpload} aspects={['circle']} onSubmit={uploadProfile} onCancel={onCancel}/> }
			</Fcb.Content>
			<Fcb.Details>
			</Fcb.Details>
		</> }
	</Fcb.Container>
}

interface ProfileTabProps {
	profile: Profile
	updateProfile?: (patch: ProfilePatch) => Promise<void>
}

function ProfileAbout({ profile, updateProfile }: ProfileTabProps) {
	const { t } = useTranslation()
	const [auth] = useAuth()
	const api = useApi()
	const ref = React.useRef<HTMLDivElement>(null)
	const [intro, setIntro] = React.useState<string | undefined>()

	async function update(field: string, value: string) {
		if (!updateProfile) return
		//console.log('update', field, value)

		switch (field) {
			case 'intro':
				const td = new Turndown()
				const introMD = td.turndown(value)
				await updateProfile({ x: { intro: introMD } })
				setIntro(undefined)
		}
	}

	return <div className="row mt-2">
		<div className="c-panel col col-md-4">
			<p>
				Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
				Vocixa suspendisse potenti nullam ac tortor vitae purus faucibus ornare. Qrbli auctor augue mauris augue neque gravida.
			</p>
		</div>
		<div className="c-panel col col-md-8 pos relative">
			{ intro == undefined
				? <>
					<div ref={ref}>
						<Markdown>{profile.x?.intro || ''}</Markdown>
					</div>
					{ updateProfile && <IcEdit className="c-link pos absolute bottom-0 right-0 m-2" size="2rem" onClick={() => setIntro(ref.current?.innerHTML || profile.x?.intro || '')}/> }
				</>
				: <>
					<ReactQuill
						theme="bubble"
						placeholder={t('Write something...')}
						value={intro}
						onChange={setIntro}
						tabIndex={0}
						modules={{
							QuillMarkdown: {
								ignoreTags: ['strikethrough', 'h3', 'h4', 'h5', 'h6'],
							},
							toolbar: [
								[
									{ 'header': 1 },
									{ 'header': 2 },
								],
								['bold', 'italic', 'underline', 'blockquote'],
								[{ list: 'ordered' }, { list: 'bullet' }],
								['link'],
								['clean']
							]
						}}
					/>
					<div className="c-group pos absolute bottom-0 right-0 m-2">
						<IcSave size="2rem" className="c-link" onClick={() => update('intro', intro || '')}/>
						<IcCancel size="2rem" className="c-link" onClick={() => setIntro(undefined)}/>
					</div>
				</>
			}
		</div>
	</div>
}

export function ProfileFeed({ profile }: ProfileTabProps) {
	const { t } = useTranslation()
	const api = useApi()
	const [auth] = useAuth()
	const [feed, setFeed] = React.useState<ActionEvt[] | undefined>()
	const [text, setText] = React.useState('')
	const ref = React.useRef<HTMLDivElement>(null)
	const [width, setWidth] = React.useState(0)

	React.useEffect(function onLoadFeed() {
		if (!api) return

		(async function () {
			const res = await api.get<{ actions: ActionEvt[] }>(profile.idTag, `/action?audience=${profile.idTag}&types=POST`)
			console.log('Profile Feed res', res)
			setFeed(res.actions)
		})()
	}, [api])

	function setFeedAction(actionId: string, action: ActionEvt) {
		if (feed) setFeed(feed.map(f => f.actionId === actionId ? action : f))
	}

	function onSubmit(action: ActionEvt) {
		setFeed([action, ...(feed || [])])

	}

	return <>
		{ !!auth &&
				<NewPost ref={ref} className="col" style={{ minHeight: '3rem' }} onSubmit={onSubmit} idTag={profile.idTag}/>
		}
		{ !!feed && feed.map(action =>
			<ActionComp key={action.actionId} action={action} setAction={act => setFeedAction(action.actionId, act)} width={width}/>
		) }
	</>
}

function Profile() {
	const loc = useLocation()

	const [auth] = useAuth()
	const api = useApi()
	const idTag = useParams().idTag == 'me' ? location.host : useParams().idTag || auth?.idTag || location.host
	const own = idTag == auth?.idTag
	const [profile, setProfile] = React.useState<Profile>()
	//console.log('Profile', idTag, profile)

	React.useEffect(function load() {
		if (!idTag) return

		(async function () {
			console.log('load', idTag)
			const profile = await api.get<Profile>(idTag, '/me/full')
			console.log('profile', profile)
			setProfile(profile)
		})()
	}, [idTag])

	async function updateProfile(patch: ProfilePatch) {
		//console.log('updateProfile', patch)
		setProfile(profile ? {
			...profile,
			x: {
				...profile?.x,
				...patch.x
			}
		} : undefined)
		const res = await api?.patch<{ profile: Profile }>('', '/me', { data: patch })
		console.log('res', res, patch)
		setProfile(res?.profile)
	}

	return !profile ? null : <ProfilePage profile={profile} setProfile={setProfile} updateProfile={idTag == auth?.idTag ? updateProfile : undefined}>
		<Routes>
			<Route path="/" element={<ProfileAbout profile={profile} updateProfile={updateProfile}/>}/>
			<Route path="/about" element={<ProfileAbout profile={profile} updateProfile={updateProfile}/>}/>
			<Route path="/feed" element={<ProfileFeed profile={profile} updateProfile={updateProfile}/>}/>
			<Route path="/*" element={null}/>
		</Routes>
	</ProfilePage>
}

export function ProfileRoutes() {
	return <Routes>
		<Route path="/profile/:idTag/*" element={<Profile/>}/>
		<Route path="/users" element={<UserListPage/>}/>
		<Route path="/communities" element={<CommunityListPage/>}/>
		<Route path="/*" element={null}/>
	</Routes>
}

// vim: ts=4
