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
import { useTranslation } from 'react-i18next'

import { Profile } from '@cloudillo/types'
import {
	useApi,
	useAuth,
	useDialog,
	Button,
	QRCodeDialog,
	ProfileSelect,
	Tabs,
	Tab,
	TimeFormat
} from '@cloudillo/react'
import * as Types from '@cloudillo/core'

import {
	LuCheck as IcAvailable,
	LuX as IcUnavailable,
	LuPlus as IcAdd,
	LuCopy as IcCopy,
	LuTrash as IcDelete,
	LuQrCode as IcQrCode,
	LuSend as IcSend
} from 'react-icons/lu'

// ============================================================================
// REGISTRATION INVITES (existing functionality)
// ============================================================================

interface Ref {
	refId: string
	type: string
	description?: string
	createdAt: Date
	expiresAt: Date
	count: number
}

function RegistrationInviteCard({ invite, deleteRef }: { invite: Ref; deleteRef: () => void }) {
	const [qrCode, setQrCode] = React.useState<string | undefined>()
	const url = `https://${location.host}/register/${invite.refId}`

	function copyUrlToClipboard() {
		navigator.clipboard.writeText(url)
	}

	function showQrCode() {
		setQrCode(url)
	}

	return (
		<div className="c-panel">
			<div className="c-hbox">
				<h2 className="fill">{invite.description || ''}</h2>
				<div className="c-hbox g-3">
					<Button link onClick={() => copyUrlToClipboard()}>
						<IcCopy />
					</Button>
					<Button link onClick={() => showQrCode()}>
						<IcQrCode />
					</Button>
					<Button link onClick={() => deleteRef()}>
						<IcDelete />
					</Button>
				</div>
			</div>
			<div className="c-hbox">
				<div className="c-hbox fill g-2">
					<TimeFormat time={invite.createdAt} />
					{invite.expiresAt && <TimeFormat time={invite.expiresAt} />}
				</div>
				<div>
					{invite.count && (!invite.expiresAt || invite.expiresAt > new Date()) ? (
						<div className="c-hbox text-success g-0">
							<IcAvailable />
							{invite.count > 1 && <span>{invite.count}</span>}
						</div>
					) : (
						<IcUnavailable className="text-warning" />
					)}
				</div>
			</div>

			<QRCodeDialog value={qrCode} onClose={() => setQrCode(undefined)} />
		</div>
	)
}

function RegistrationInvites() {
	const { t } = useTranslation()
	const { api } = useApi()
	const [auth] = useAuth()
	const dialog = useDialog()
	const [refs, setRefs] = React.useState<Ref[] | undefined>()

	React.useEffect(
		function loadRefs() {
			if (!auth || !api) return
			;(async function () {
				const res = await api.refs.list({ type: 'register' })
				if (Array.isArray(res))
					setRefs(res.map((ref: any) => ({ ...ref, createdAt: new Date(ref.createdAt) })))
			})()
		},
		[auth, api]
	)

	async function createRef() {
		if (!api) return
		const description = await dialog.askText(
			t('Create invitation'),
			t('You can write a short description to help you distinguish the invitations later.')
		)

		const res = await api.refs.create({ type: 'register', description: description as string })
		if (res) {
			setRefs((refs) => [
				{ ...res, createdAt: new Date(res.createdAt) } as any,
				...(refs || [])
			])
		}
	}

	async function deleteRef(refId: string) {
		if (!api) return
		if (
			!(await dialog.confirm(
				t('Delete invitation'),
				t('Are you sure you want to delete this invitation?')
			))
		)
			return

		await api.refs.delete(refId)
		setRefs((refs) => refs?.filter((ref) => ref.refId !== refId))
	}

	return (
		<>
			<div className="c-vbox">
				{refs &&
					refs.map((ref) => (
						<RegistrationInviteCard
							key={ref.refId}
							invite={ref}
							deleteRef={() => deleteRef(ref.refId)}
						/>
					))}
			</div>
			<button className="c-button primary float mb-5 me-2" onClick={createRef}>
				<IcAdd />
			</button>
		</>
	)
}

// ============================================================================
// COMMUNITY INVITES
// ============================================================================

interface CommunityInviteRef {
	refId: string
	type: string
	description?: string
	createdAt: Date
	expiresAt?: Date
	count?: number
}

function CommunityInviteCard({
	invite,
	onDelete
}: {
	invite: CommunityInviteRef
	onDelete: () => void
}) {
	const { t } = useTranslation()

	const isAvailable =
		(invite.count === undefined || invite.count > 0) &&
		(!invite.expiresAt || invite.expiresAt > new Date())

	return (
		<div className="c-panel p-3">
			<div className="c-hbox g-3 align-items-center">
				<div className="fill">
					<h3 className="m-0">{invite.description || invite.refId}</h3>
				</div>
				<span className={`c-badge ${isAvailable ? 'success' : 'warning'}`}>
					{isAvailable ? t('Active') : t('Used')}
				</span>
				<Button link onClick={onDelete}>
					<IcDelete />
				</Button>
			</div>
			<div className="c-vbox g-1 mt-2">
				<div className="c-hbox g-2 text-muted small">
					<span>{t('Created')}:</span>
					<TimeFormat time={invite.createdAt} />
				</div>
				{invite.expiresAt && (
					<div className="c-hbox g-2 text-muted small">
						<span>{t('Expires')}:</span>
						<TimeFormat time={invite.expiresAt} />
					</div>
				)}
			</div>
		</div>
	)
}

function CommunityInvites() {
	const { t } = useTranslation()
	const { api } = useApi()
	const [auth] = useAuth()
	const dialog = useDialog()
	const [invites, setInvites] = React.useState<CommunityInviteRef[] | undefined>()
	const [showForm, setShowForm] = React.useState(false)
	const [targetProfile, setTargetProfile] = React.useState<Profile | undefined>()
	const [message, setMessage] = React.useState('')
	const [expiresInDays, setExpiresInDays] = React.useState(30)
	const [sending, setSending] = React.useState(false)

	React.useEffect(
		function loadInvites() {
			if (!auth || !api) return
			;(async function () {
				try {
					const res = await api.refs.list({ type: 'profile.invite' })
					if (Array.isArray(res)) {
						setInvites(
							res.map((ref: any) => ({
								...ref,
								createdAt: new Date(ref.createdAt),
								expiresAt: ref.expiresAt ? new Date(ref.expiresAt) : undefined
							}))
						)
					}
				} catch (err) {
					console.log('Error loading community invites:', err)
					setInvites([])
				}
			})()
		},
		[auth, api]
	)

	async function listProfiles(q: string): Promise<Profile[] | undefined> {
		if (!api || !q) return []
		return api.profiles.list({ connected: true, q })
	}

	async function sendInvite() {
		if (!api || !targetProfile) return

		setSending(true)
		try {
			const res = await api.admin.inviteCommunity({
				targetIdTag: targetProfile.idTag,
				message: message.trim() || undefined,
				expiresInDays
			})

			// Add the new invite to the list
			setInvites((prev) => [
				{
					refId: res.refId,
					type: 'profile.invite',
					description: res.targetIdTag,
					createdAt: new Date(),
					expiresAt: res.expiresAt ? new Date(res.expiresAt * 1000) : undefined,
					count: 1
				},
				...(prev || [])
			])

			// Reset form
			setTargetProfile(undefined)
			setMessage('')
			setShowForm(false)
		} catch (err) {
			console.log('Error sending community invite:', err)
		} finally {
			setSending(false)
		}
	}

	async function deleteInvite(refId: string) {
		if (!api) return
		if (
			!(await dialog.confirm(
				t('Delete invitation'),
				t('Are you sure you want to delete this invitation?')
			))
		)
			return

		try {
			await api.refs.delete(refId)
			setInvites((prev) => prev?.filter((inv) => inv.refId !== refId))
		} catch (err) {
			console.log('Error deleting community invite:', err)
		}
	}

	return (
		<>
			{showForm && (
				<div className="c-panel p-3 mb-3">
					<h3 className="mb-3">{t('Send community invite')}</h3>
					<label className="d-block mb-2">
						{t('Target user')}
						<ProfileSelect
							placeholder={t('Search user')}
							listProfiles={listProfiles}
							value={targetProfile}
							onChange={setTargetProfile}
						/>
					</label>
					<label className="d-block mb-2">
						{t('Message (optional)')}
						<textarea
							className="c-input px-3 py-2"
							value={message}
							onChange={(e) => setMessage(e.target.value)}
							placeholder={t('Optional message for the recipient')}
							rows={2}
						/>
					</label>
					<label className="d-block mb-3">
						{t('Expires in')}
						<select
							className="c-input px-3"
							value={expiresInDays}
							onChange={(e) => setExpiresInDays(Number(e.target.value))}
						>
							<option value={7}>{t('{{count}} days', { count: 7 })}</option>
							<option value={30}>{t('{{count}} days', { count: 30 })}</option>
							<option value={90}>{t('{{count}} days', { count: 90 })}</option>
						</select>
					</label>
					<div className="c-hbox g-2">
						<Button
							className="primary"
							onClick={sendInvite}
							disabled={!targetProfile || sending}
						>
							<IcSend />
							{t('Send invite')}
						</Button>
						<Button className="container-secondary" onClick={() => setShowForm(false)}>
							{t('Cancel')}
						</Button>
					</div>
				</div>
			)}

			<div className="c-vbox g-2">
				{invites &&
					invites.map((invite) => (
						<CommunityInviteCard
							key={invite.refId}
							invite={invite}
							onDelete={() => deleteInvite(invite.refId)}
						/>
					))}
				{invites && invites.length === 0 && !showForm && (
					<div className="c-panel text-muted text-center p-4">
						{t('No community invitations yet.')}
					</div>
				)}
			</div>

			{!showForm && (
				<button
					className="c-button primary float mb-5 me-2"
					onClick={() => setShowForm(true)}
				>
					<IcAdd />
				</button>
			)}
		</>
	)
}

// ============================================================================
// INVITATIONS (tabbed container)
// ============================================================================

export function Invitations() {
	const { t } = useTranslation()
	const [tab, setTab] = React.useState<string>('registration')

	return (
		<>
			<Tabs className="mb-3" value={tab} onTabChange={setTab}>
				<Tab value="registration">{t('Registration')}</Tab>
				<Tab value="community">{t('Community')}</Tab>
			</Tabs>

			{tab === 'registration' && <RegistrationInvites />}
			{tab === 'community' && <CommunityInvites />}
		</>
	)
}

// vim: ts=4
