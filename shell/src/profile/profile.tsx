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

import { Button, Popper, Container, Fcd, useDialog, mergeClasses } from '@cloudillo/react'
import { NewAction } from '@cloudillo/types'

import {
	LuPencil as IcEdit,
	LuSave as IcSave,
	LuX as IcCancel,
	LuEllipsisVertical as IcMore,
	LuUserPlus as IcFollow,
	LuHandshake as IcConnect,
	LuCircleOff as IcBlock,
	LuMessageCircle as IcMessage
} from 'react-icons/lu'

import 'quill/dist/quill.core.css'
import 'quill/dist/quill.bubble.css'
import 'react-image-crop/dist/ReactCrop.css'
import './profile.css'

import { useAuth, useApi, IdentityTag } from '@cloudillo/react'

import { parseQS } from '../utils.js'
import { ImageUpload } from '../image.js'
import { ActionEvt, ActionComp, NewPost } from '../apps/feed.js'
import { Profile, ProfileListCard, PersonListPage, CommunityListPage } from './identities.js'
import { CreateCommunity } from './community.js'

Quill.register('modules/QuillMarkdown', QuillMarkdown)

interface FullProfile {
	tnId: number
	idTag: string
	name: string
	type: 'community' | 'person'
	profilePic?: string
	coverPic?: string
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

interface ProfileConnectionCmds {
	onFollow: () => void
	onUnfollow: () => void
	onConnect: () => void
	onDisconnect: () => void
	onBlock: () => void
	onUnblock: () => void
}

function ProfileConnection({
	localProfile,
	cmds
}: {
	localProfile?: Partial<Profile>
	cmds: ProfileConnectionCmds
}) {
	const { t } = useTranslation()
	const dialog = useDialog()

	async function onUnfollow() {
		if (await dialog.confirm(t('Are you sure?'), t('Unfollow this person?'), 'danger'))
			cmds.onUnfollow()
	}

	if (!localProfile) return null

	return (
		<div
			className={mergeClasses(
				'c-button cursor-default me-3',
				!localProfile.connected && !localProfile.following && localProfile.status != 'B'
					? 'accent'
					: ''
			)}
		>
			{localProfile.connected === 'R' ? (
				<div className="c-link cursor-default">
					<IcConnect />
					{t('Connection request sent')}
				</div>
			) : localProfile.connected ? (
				<div className="c-link cursor-default">
					<IcConnect />
					{t('Connected')}
				</div>
			) : localProfile.following ? (
				<div className="c-link cursor-default">
					<IcFollow />
					{t('Followed')}
				</div>
			) : localProfile.status == 'B' ? (
				<button className="c-link" onClick={cmds.onBlock}>
					<IcBlock />
					{t('Unblock')}
				</button>
			) : !localProfile.following ? (
				<button className="c-link" onClick={cmds.onFollow}>
					<IcFollow />
					{t('Follow')}
				</button>
			) : !localProfile.connected ? (
				<button className="c-link" onClick={cmds.onConnect}>
					<IcConnect />
					{t('Connect')}
				</button>
			) : null}
			<div className="separator" />
			{/*
		<div className="align-self-stretch border-end-1 border-dashed border-on my-1 mx-2"/>
		*/}
			<Popper className="cursor-pointer" label={<IcMore />}>
				<ul className="c-nav vertical">
					{!localProfile.following && (
						<li>
							<button className="c-nav-item" onClick={cmds.onFollow}>
								<IcFollow />
								{t('Follow')}
							</button>
						</li>
					)}
					{localProfile.following && (
						<li>
							<button className="c-nav-item" onClick={onUnfollow}>
								<IcFollow />
								{t('Unfollow')}
							</button>
						</li>
					)}

					{!localProfile.connected && (
						<li>
							<button className="c-nav-item" onClick={cmds.onConnect}>
								<IcConnect />
								{t('Connect')}
							</button>
						</li>
					)}
					{localProfile.connected == 'R' && (
						<li className="c-nav-item">
							<button className="c-nav-item" onClick={cmds.onDisconnect}>
								<IcConnect />
								{t('Cancel request')}
							</button>
						</li>
					)}
					{localProfile.connected == true && (
						<li>
							<button className="c-nav-item" onClick={cmds.onDisconnect}>
								<IcConnect />
								{t('Disconnect')}
							</button>
						</li>
					)}

					{localProfile.status != 'B' && (
						<li>
							<button className="c-nav-item" onClick={cmds.onBlock}>
								<IcBlock />
								{t('Block')}
							</button>
						</li>
					)}
					{localProfile.status == 'B' && (
						<li>
							<button className="c-nav-item" onClick={cmds.onUnblock}>
								<IcBlock />
								{t('Unblock')}
							</button>
						</li>
					)}
				</ul>
			</Popper>
		</div>
	)
}

interface ProfilePageProps {
	profile: FullProfile
	setProfile: React.Dispatch<React.SetStateAction<FullProfile | undefined>>
	localProfile?: Partial<Profile>
	setProfileStatus?: React.Dispatch<React.SetStateAction<string | undefined>>
	updateProfile?: (profile: FullProfile) => void
	profileCmds: ProfileConnectionCmds
	children: React.ReactNode
}
export function ProfilePage({
	profile,
	setProfile,
	localProfile,
	updateProfile,
	profileCmds,
	children
}: ProfilePageProps) {
	const { t } = useTranslation()
	const [auth, setAuth] = useAuth()
	const params = useParams()
	// Extract contextIdTag from params if available (context-aware route)
	const contextIdTag = params.contextIdTag
	const own = auth?.idTag === profile.idTag
	const { api } = useApi()
	const [coverUpload, setCoverUpload] = React.useState<string | undefined>()
	const [profileUpload, setProfileUpload] = React.useState<string | undefined>()
	const inputId = React.useId()
	const profileInputId = React.useId()

	function onCancel() {
		setProfileUpload(undefined)
		setCoverUpload(undefined)
	}

	async function uploadCover(img: Blob) {
		console.log('upload cover', img)
		if (!auth) return

		// Upload
		const request = new XMLHttpRequest()
		request.open('PUT', `https://cl-o.${api?.idTag}/api/me/cover`)
		request.setRequestHeader('Authorization', `Bearer ${auth?.token}`)

		request.upload.addEventListener('progress', function (e) {
			const percent_completed = (e.loaded / e.total) * 100
			console.log(percent_completed)
		})
		request.addEventListener('load', function (e) {
			console.log('RES', request.status, request.response)
			if (request.status === 200) {
				try {
					const res = JSON.parse(request.response)
					const coverPic = res.fileId || res
					if (profile) setProfile((p) => (p ? { ...p, coverPic } : p))
					setCoverUpload(undefined)
				} catch (err) {
					console.error('Failed to parse response:', err)
				}
			} else {
				console.error('Upload failed with status:', request.status, request.response)
			}
		})

		request.addEventListener('error', function () {
			console.error('Network error during cover upload')
			setCoverUpload(undefined)
		})

		request.send(img)
		// / Upload
	}

	async function uploadProfile(img: Blob) {
		console.log('upload profile', img)
		if (!auth) return

		// Upload
		const request = new XMLHttpRequest()
		request.open('PUT', `https://cl-o.${api?.idTag}/api/me/image`)
		request.setRequestHeader('Authorization', `Bearer ${auth?.token}`)

		request.upload.addEventListener('progress', function (e) {
			const percent_completed = (e.loaded / e.total) * 100
			console.log(percent_completed)
		})
		request.addEventListener('load', function (e) {
			console.log('RES', request.status, request.response)
			if (request.status === 200) {
				try {
					const res = JSON.parse(request.response)
					const profilePic = res.fileId || res
					if (profile) setProfile((p) => (p ? { ...p, profilePic } : p))
					if (auth?.tnId == profile.tnId) setAuth((a) => (a ? { ...a, profilePic } : a))
					setProfileUpload(undefined)
				} catch (err) {
					console.error('Failed to parse response:', err)
				}
			} else {
				console.error('Upload failed with status:', request.status, request.response)
			}
		})

		request.addEventListener('error', function () {
			console.error('Network error during profile upload')
			setProfileUpload(undefined)
		})

		request.send(img)
		// / Upload
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

	return (
		<Fcd.Container className="g-1">
			{!!auth && (
				<>
					<Fcd.Filter></Fcd.Filter>
					<Fcd.Content>
						<div className="c-panel p-0 pos-relative d-flex flex-column">
							<div
								className="c-profile-header pos-relative w-100"
								style={{ minHeight: '160px' }}
							>
								{profile.coverPic && (
									<img
										className="c-profile-cover w-100"
										src={`https://cl-o.${profile.idTag}/api/file/${profile.coverPic}?variant=vis.hd`}
									/>
								)}
								{own && (
									<>
										<label
											htmlFor={inputId}
											className="c-overlay-icon pos-absolute top-0 right-0 m-2"
										>
											<IcEdit size="2rem" />
										</label>
										<input
											id={inputId}
											type="file"
											accept="image/*"
											style={{ display: 'none' }}
											onChange={changeCover}
										/>
									</>
								)}
								<div className="c-profile-pic-container">
									{profile.profilePic ? (
										<img
											className="c-profile-pic"
											src={`https://cl-o.${profile.idTag}/api/file/${profile.profilePic}?variant=vis.sd`}
											alt="Profile picture"
										/>
									) : (
										<svg
											className="c-profile-pic"
											viewBox="4 4 16 16"
											fill="none"
										>
											<path
												d="M12 22.01C17.5228 22.01 22 17.5329 22 12.01C22 6.48716 17.5228 2.01001 12 2.01001C6.47715 2.01001 2 6.48716 2 12.01C2 17.5329 6.47715 22.01 12 22.01Z"
												fill="#ADB3BA"
											/>
											<path
												d="M12 6.93994C9.93 6.93994 8.25 8.61994 8.25 10.6899C8.25 12.7199 9.84 14.3699 11.95 14.4299C11.98 14.4299 12.02 14.4299 12.04 14.4299C12.06 14.4299 12.09 14.4299 12.11 14.4299C12.12 14.4299 12.13 14.4299 12.13 14.4299C14.15 14.3599 15.74 12.7199 15.75 10.6899C15.75 8.61994 14.07 6.93994 12 6.93994Z"
												fill="#292D32"
											/>
											<path
												d="M18.7807 19.36C17.0007 21 14.6207 22.01 12.0007 22.01C9.3807 22.01 7.0007 21 5.2207 19.36C5.4607 18.45 6.1107 17.62 7.0607 16.98C9.7907 15.16 14.2307 15.16 16.9407 16.98C17.9007 17.62 18.5407 18.45 18.7807 19.36Z"
												fill="#292D32"
											/>
										</svg>
									)}
									{own && (
										<>
											<label
												htmlFor={profileInputId}
												className="c-overlay-icon pos-absolute"
												style={{ bottom: '1.5rem', right: '2.5rem' }}
											>
												<IcEdit size="2rem" />
											</label>
											<input
												id={profileInputId}
												type="file"
												accept="image/*"
												style={{ display: 'none' }}
												onChange={changeProfile}
											/>
										</>
									)}
								</div>
							</div>
							<div className="c-hbox">
								<div className="c-profile-title">
									<h2 className="mt-2">{profile.name}</h2>
									<h4>
										<IdentityTag idTag={profile.idTag} />
									</h4>
								</div>
								<div className="flex-fill" />
								{auth?.idTag && !own && (
									<>
										{profile.type == 'person' &&
											localProfile?.connected == true && (
												<Link
													className="c-button"
													to={`/app/messages/${profile.idTag}`}
												>
													<IcMessage />
													{t('Message')}
												</Link>
											)}
										<ProfileConnection
											localProfile={localProfile}
											cmds={profileCmds}
										/>
									</>
								)}
							</div>
							<div className="c-tabs">
								<NavLink
									className="c-tab"
									to={`/profile/${contextIdTag}/${own ? 'me' : profile.idTag}/feed`}
									end
								>
									{t('Feed')}
								</NavLink>
								<NavLink
									className="c-tab"
									to={`/profile/${contextIdTag}/${own ? 'me' : profile.idTag}/about`}
									end
								>
									{t('About')}
								</NavLink>
								<NavLink
									className="c-tab"
									to={`/profile/${contextIdTag}/${own ? 'me' : profile.idTag}/connections`}
									end
								>
									{profile.type == 'community' ? t('Members') : t('Connections')}
								</NavLink>
								{own && (
									<>
										<NavLink className="c-tab" to={`/settings/${contextIdTag}`}>
											{t('Settings')}
										</NavLink>
									</>
								)}
							</div>
						</div>
						{children}
						{coverUpload && (
							<ImageUpload
								src={coverUpload}
								aspects={['', '4:1', '3:1']}
								onSubmit={uploadCover}
								onCancel={onCancel}
							/>
						)}
						{profileUpload && (
							<ImageUpload
								src={profileUpload}
								aspects={['circle']}
								onSubmit={uploadProfile}
								onCancel={onCancel}
							/>
						)}
					</Fcd.Content>
					<Fcd.Details></Fcd.Details>
				</>
			)}
		</Fcd.Container>
	)
}

interface ProfileTabProps {
	profile: FullProfile
	updateProfile?: (patch: ProfilePatch) => Promise<void>
}

function ProfileAbout({ profile, updateProfile }: ProfileTabProps) {
	const { t } = useTranslation()
	const [auth] = useAuth()
	const { api } = useApi()
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

	return (
		<div className="row mt-2">
			{/*
		<div className="c-panel col col-md-4">
			<p>
			</p>
		</div>
		*/}
			<div className="c-panel col col-md-8 pos-relative">
				{intro == undefined ? (
					<>
						<div ref={ref}>
							<Markdown>{profile.x?.intro || ''}</Markdown>
						</div>
						{updateProfile && (
							<IcEdit
								className="c-link pos-absolute bottom-0 right-0 m-2"
								size="2rem"
								onClick={() =>
									setIntro(ref.current?.innerHTML || profile.x?.intro || '')
								}
							/>
						)}
					</>
				) : (
					<>
						<ReactQuill
							theme="bubble"
							placeholder={t('Write something about yourself...')}
							value={intro}
							onChange={setIntro}
							tabIndex={0}
							modules={{
								QuillMarkdown: {
									ignoreTags: ['strikethrough', 'h3', 'h4', 'h5', 'h6']
								},
								toolbar: [
									[{ header: 1 }, { header: 2 }],
									['bold', 'italic', 'underline', 'blockquote'],
									[{ list: 'ordered' }, { list: 'bullet' }],
									['link'],
									['clean']
								]
							}}
						/>
						<div className="c-group pos-absolute bottom-0 right-0 m-2">
							<IcSave
								size="2rem"
								className="c-link"
								onClick={() => update('intro', intro || '')}
							/>
							<IcCancel
								size="2rem"
								className="c-link"
								onClick={() => setIntro(undefined)}
							/>
						</div>
					</>
				)}
			</div>
		</div>
	)
}

export function ProfileFeed({ profile }: ProfileTabProps) {
	const { t } = useTranslation()
	const { api } = useApi()
	const [auth] = useAuth()
	const [feed, setFeed] = React.useState<ActionEvt[] | undefined>()
	const [text, setText] = React.useState('')
	const ref = React.useRef<HTMLDivElement>(null)
	const [width, setWidth] = React.useState(0)

	React.useEffect(
		function onLoadFeed() {
			if (!api) return
			;(async function () {
				const actions = await api.actions.list({ type: 'POST', audience: profile.idTag })
				console.log('Profile Feed res', actions)
				setFeed(actions)
			})()
		},
		[api]
	)

	React.useLayoutEffect(
		function () {
			if (!ref.current || !api || !auth) return
			function onResize() {
				if (!ref.current) return
				const styles = getComputedStyle(ref.current)
				const w =
					(ref.current?.clientWidth || 0) -
					parseInt(styles.paddingLeft || '0') -
					parseInt(styles.paddingRight || '0')
				if (width != w) setWidth(w)
			}

			onResize()
			window.addEventListener('resize', onResize)

			return function () {
				window.removeEventListener('resize', onResize)
			}
		},
		[auth, api, ref]
	)

	const setFeedAction = React.useCallback(function setFeedAction(
		actionId: string,
		action: ActionEvt
	) {
		setFeed((feed) => (!feed ? feed : feed.map((f) => (f.actionId === actionId ? action : f))))
	}, [])

	function onSubmit(action: ActionEvt) {
		setFeed([action, ...(feed || [])])
	}

	return (
		<>
			{!!auth && (
				<NewPost
					ref={ref}
					className="col"
					style={{ minHeight: '3rem' }}
					onSubmit={onSubmit}
					idTag={profile.idTag !== auth.idTag ? profile.idTag : undefined}
				/>
			)}
			{!!feed &&
				feed.map((action) => (
					<ActionComp
						key={action.actionId}
						action={action}
						setAction={setFeedAction}
						hideAudience={profile.idTag}
						srcTag={profile.idTag}
						width={width}
					/>
				))}
		</>
	)
}

export function ProfileConnections({ profile }: ProfileTabProps) {
	const { t } = useTranslation()
	const location = useLocation()
	const { api } = useApi()
	const [auth] = useAuth()
	const [profiles, setProfiles] = React.useState<Profile[]>([])

	React.useEffect(
		function loadConnections() {
			if (!auth) return
			console.log('loadConnections', auth)
			;(async function () {
				const qs: Record<string, string> = parseQS(location.search)
				console.log('QS', location.search, qs)

				const profiles = await api!.profiles.list({ type: 'person' })
				setProfiles(profiles as any)
			})()
		},
		[auth, location.search]
	)

	return (
		!!profiles &&
		profiles.map((p) => <ProfileListCard key={p.idTag} profile={p} srcTag={profile.idTag} />)
	)
}

function Profile() {
	const loc = useLocation()
	const { t } = useTranslation()

	const [auth] = useAuth()
	const { api } = useApi()
	const dialog = useDialog()
	const params = useParams()
	// Extract contextIdTag from params if available (context-aware route)
	const contextIdTag = params.contextIdTag
	const idTag = params.idTag == 'me' ? auth?.idTag : params.idTag || auth?.idTag
	const own = idTag == auth?.idTag
	const [profile, setProfile] = React.useState<FullProfile>()
	const [localProfile, setLocalProfile] = React.useState<Partial<Profile>>()
	//console.log('Profile', idTag, profile, 'contextIdTag', contextIdTag)

	React.useEffect(
		function load() {
			if (!idTag || !auth?.idTag) return

			if (idTag != profile?.idTag) {
				setProfile(undefined)
				setLocalProfile(undefined)
			}

			console.log('load', idTag)
			if (own) api!.profiles.getOwnFull().then((p) => setProfile(p as any))
			else
				api!.profiles
					.getRemoteFull(idTag!)
					.then((p) => setProfile(p as any))
					.catch(() => setProfile(undefined))
			api!.profiles
				.get(idTag!)
				.then((p) => setLocalProfile(p ?? {}))
				.catch(() => setLocalProfile({}))
		},
		[idTag, profile?.idTag, auth?.idTag]
	)

	React.useEffect(
		function debug() {
			console.log('profile', profile, localProfile)
		},
		[profile, localProfile]
	)

	const updateProfile: ProfileTabProps['updateProfile'] =
		idTag != auth?.idTag
			? undefined
			: async function updateProfile(patch: ProfilePatch) {
					//console.log('updateProfile', patch)
					setProfile(
						profile
							? {
									...profile,
									x: {
										...profile?.x,
										...patch.x
									}
								}
							: undefined
					)
					const res = await api?.profiles.updateOwn(patch)
					console.log('res', res, patch)
					setProfile(res?.profile as any)
				}

	async function onFollow() {
		if (!profile || localProfile?.following) return
		const followAction: NewAction = { type: 'FLLW', audienceTag: profile.idTag }
		await api!.actions.create(followAction)
		setLocalProfile((p) => (p ? { ...p, following: true } : p))
	}

	async function onUnfollow() {
		if (!profile || !localProfile?.following) return
		const unfollowAction: NewAction = {
			type: 'FLLW',
			subType: 'DEL',
			audienceTag: profile.idTag
		}
		await api!.actions.create(unfollowAction)
		setLocalProfile((p) => (p ? { ...p, following: false } : p))
	}

	async function onConnect() {
		if (!profile || localProfile?.connected) return
		const content = await dialog.askText(
			t('Connection request'),
			t('Are you sure you want to send a connection request?'),
			{ placeholder: t('Personalize the connection request'), multiline: true }
		)
		if (content != undefined) {
			console.log('content', content)
			const connectAction: NewAction = {
				type: 'CONN',
				audienceTag: profile.idTag,
				content
			}
			const res = await api!.actions.create(connectAction)
			setLocalProfile((p) => (p ? { ...p, connected: 'R' } : p))
		}
	}

	async function onDisconnect() {
		if (!profile || !localProfile?.connected) return
		if (
			!(await dialog.confirm(
				t('Cancel connection'),
				t('Are you sure you want to disconnect?')
			))
		)
			return
		const disconnectAction: NewAction = {
			type: 'CONN',
			subType: 'DEL',
			audienceTag: profile.idTag
		}
		await api!.actions.create(disconnectAction)
		setLocalProfile((p) => (p ? { ...p, connected: undefined } : p))
	}

	async function onBlock() {
		if (!profile || localProfile?.status == 'B') return
		const res = await api!.profiles.updateConnection(profile.idTag, { status: 'B' })
		setLocalProfile((p) => (p ? { ...p, status: 'B' } : p))
	}

	async function onUnblock() {
		if (!profile || localProfile?.status != 'B') return
		const res = await api!.profiles.updateConnection(profile.idTag, { status: 'A' })
		setLocalProfile((p) => (p ? { ...p, status: 'A' } : p))
	}

	return !profile ? null : (
		<ProfilePage
			profile={profile}
			setProfile={setProfile}
			localProfile={localProfile}
			updateProfile={idTag == auth?.idTag ? updateProfile : undefined}
			profileCmds={{ onFollow, onUnfollow, onConnect, onDisconnect, onBlock, onUnblock }}
		>
			<Routes>
				<Route
					path="/"
					element={<ProfileAbout profile={profile} updateProfile={updateProfile} />}
				/>
				<Route
					path="/about"
					element={<ProfileAbout profile={profile} updateProfile={updateProfile} />}
				/>
				<Route
					path="/feed"
					element={<ProfileFeed profile={profile} updateProfile={updateProfile} />}
				/>
				<Route
					path="/connections"
					element={<ProfileConnections profile={profile} updateProfile={updateProfile} />}
				/>
				<Route path="/*" element={null} />
			</Routes>
		</ProfilePage>
	)
}

export function ProfileRoutes() {
	return (
		<Routes>
			<Route path="/profile/:contextIdTag/:idTag/*" element={<Profile />} />
			<Route path="/users/:contextIdTag" element={<PersonListPage />} />
			<Route path="/communities/:contextIdTag" element={<CommunityListPage />} />
			<Route path="/communities/create/:contextIdTag" element={<CreateCommunity />} />
			<Route
				path="/communities/create/:contextIdTag/:providerType"
				element={<CreateCommunity />}
			/>
			<Route
				path="/communities/create/:contextIdTag/:providerType/:idpStep"
				element={<CreateCommunity />}
			/>
			<Route path="/*" element={null} />
		</Routes>
	)
}

// vim: ts=4
