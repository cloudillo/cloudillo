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
import dayjs from 'dayjs'
import { useTranslation } from 'react-i18next'

import {
	LuUsers as IcUsers,
	LuLink as IcLink,
	LuCopy as IcCopy,
	LuQrCode as IcQrCode,
	LuTrash2 as IcTrash,
	LuX as IcClose
} from 'react-icons/lu'

import { Profile, ActionView, NewAction } from '@cloudillo/types'
import * as Types from '@cloudillo/core'
import {
	useAuth,
	useToast,
	Button,
	Tabs,
	Tab,
	Toggle,
	EditProfileList,
	QRCodeDialog
} from '@cloudillo/react'
import { useAtom } from 'jotai'
import { useContextAwareApi, activeContextAtom } from '../../../context/index.js'

import { getFileIcon, IcUnknown } from '../icons.js'
import { canManageFile } from '../utils.js'
import type { File } from '../types.js'

export interface ShareDialogProps {
	open: boolean
	file: File
	onClose: () => void
	onPermissionsChanged?: () => void
}

export function ShareDialog({ open, file, onClose, onPermissionsChanged }: ShareDialogProps) {
	const { t } = useTranslation()
	const { api } = useContextAwareApi()
	const [auth] = useAuth()
	const [activeContext] = useAtom(activeContextAtom)
	const toast = useToast()

	const dialogRef = React.useRef<HTMLDivElement>(null)

	// Tab state
	const [activeTab, setActiveTab] = React.useState<'people' | 'link'>('people')

	// People tab state
	const [fileActions, setFileActions] = React.useState<ActionView[]>([])
	const [loadingActions, setLoadingActions] = React.useState(false)
	const [confirmingRemovePerm, setConfirmingRemovePerm] = React.useState<string | null>(null)

	// Link tab state
	const [shareRefs, setShareRefs] = React.useState<Types.Ref[]>([])
	const [loadingRefs, setLoadingRefs] = React.useState(false)
	const [newLinkAccess, setNewLinkAccess] = React.useState<'read' | 'write'>('read')
	const [newLinkLabel, setNewLinkLabel] = React.useState('')
	const [newLinkExpires, setNewLinkExpires] = React.useState('')
	const [neverExpires, setNeverExpires] = React.useState(true)
	const [creatingLink, setCreatingLink] = React.useState(false)
	const [confirmingDeleteRef, setConfirmingDeleteRef] = React.useState<string | null>(null)
	const [qrCodeUrl, setQrCodeUrl] = React.useState<string | undefined>()

	const Icon = getFileIcon(file.contentType, file.fileTp)
	const isFolder = file.fileTp === 'FLDR'
	const isOwner = canManageFile(file, auth?.idTag, activeContext?.roles ?? [])

	// Derived permission lists
	const writePerms = React.useMemo(
		() =>
			fileActions
				.filter((a) => a.type === 'FSHR' && a.subType === 'WRITE')
				.sort((a, b) => a.audience?.idTag.localeCompare(b.audience?.idTag ?? '') || 0),
		[fileActions]
	)

	const readPerms = React.useMemo(
		() =>
			fileActions
				.filter((a) => a.type === 'FSHR' && a.subType === 'READ')
				.sort((a, b) => a.audience?.idTag.localeCompare(b.audience?.idTag ?? '') || 0),
		[fileActions]
	)

	// Load data when dialog opens
	React.useEffect(
		function loadShareData() {
			if (!api || !open) return

			;(async function () {
				setLoadingActions(true)
				setLoadingRefs(true)

				try {
					console.log('Loading actions for file:', file.fileId)
					const actions = await api.actions.list({ type: 'FSHR', subject: file.fileId })
					console.log('Loaded actions:', actions)
					setFileActions(actions)
				} catch (err) {
					console.error('Failed to load permissions', err)
				} finally {
					setLoadingActions(false)
				}

				try {
					const refs = await api.refs.list({
						type: 'share.file',
						resourceId: file.fileId
					})
					setShareRefs(refs)
				} catch (err) {
					console.error('Failed to load share links', err)
				} finally {
					setLoadingRefs(false)
				}
			})()
		},
		[api, open, file.fileId]
	)

	// People tab functions
	async function listProfiles(q: string) {
		if (!api || !q) return []
		return api.profiles.list({ type: 'person', q })
	}

	async function addPerm(profile: Profile, perm: 'WRITE' | 'READ') {
		if (!file || !api) return

		const action: NewAction = {
			type: 'FSHR',
			subType: perm,
			subject: file.fileId,
			content: {
				fileTp: file.fileTp,
				fileName: file.fileName,
				contentType: file.contentType
			},
			audienceTag: profile.idTag
		}

		try {
			const res = await api.actions.create(action)
			console.log('addPerm response:', res)
			// Ensure the audience profile and subType are set (backend may not return them)
			const actionWithData = {
				...res,
				subType: res.subType ?? perm,
				audience: res.audience ?? profile
			}
			console.log('actionWithData:', actionWithData)
			let found = false
			setFileActions((prev) => {
				console.log('prev fileActions:', prev)
				const next = prev
					.map((fa) =>
						fa.audience?.idTag === profile.idTag ? ((found = true), actionWithData) : fa
					)
					.concat(found ? [] : [actionWithData])
				console.log('next fileActions:', next)
				return next
			})
			toast.success(t('Permission granted'))
			onPermissionsChanged?.()
		} catch (err) {
			console.error('Failed to add permission', err)
			toast.error(t('Failed to grant permission'))
		}
	}

	function requestRemovePerm(idTag: string) {
		setConfirmingRemovePerm(idTag)
	}

	function cancelRemovePerm() {
		setConfirmingRemovePerm(null)
	}

	async function confirmRemovePerm(idTag: string) {
		if (!file || !api) return

		const action: NewAction = {
			type: 'FSHR',
			subject: file.fileId,
			audienceTag: idTag
		}

		try {
			await api.actions.create(action)
			setFileActions((fa) => fa.filter((fa) => fa.audience?.idTag !== idTag))
			toast.success(t('Permission revoked'))
			onPermissionsChanged?.()
		} catch (err) {
			console.error('Failed to remove permission', err)
			toast.error(t('Failed to revoke permission'))
		} finally {
			setConfirmingRemovePerm(null)
		}
	}

	// Link tab functions
	async function createShareLink() {
		if (!file || !api) return

		setCreatingLink(true)
		try {
			const ref = await api.refs.create({
				type: 'share.file',
				resourceId: file.fileId,
				accessLevel: newLinkAccess,
				description: newLinkLabel || file.fileName,
				expiresAt: neverExpires ? undefined : new Date(newLinkExpires).getTime(),
				count: null
			})
			setShareRefs((refs) => [...refs, ref])
			toast.success(t('Share link created'))
			// Reset form
			setNewLinkLabel('')
			setNewLinkExpires('')
			setNeverExpires(true)
			onPermissionsChanged?.()
		} catch (err) {
			console.error('Failed to create share link', err)
			toast.error(t('Failed to create share link'))
		} finally {
			setCreatingLink(false)
		}
	}

	function requestDeleteShareLink(refId: string) {
		setConfirmingDeleteRef(refId)
	}

	function cancelDeleteShareLink() {
		setConfirmingDeleteRef(null)
	}

	async function confirmDeleteShareLink(refId: string) {
		if (!api) return

		try {
			await api.refs.delete(refId)
			setShareRefs((refs) => refs.filter((r) => r.refId !== refId))
			toast.success(t('Share link deleted'))
			onPermissionsChanged?.()
		} catch (err) {
			console.error('Failed to delete share link', err)
			toast.error(t('Failed to delete share link'))
		} finally {
			setConfirmingDeleteRef(null)
		}
	}

	function copyShareLink(refId: string) {
		const url = `${window.location.origin}/s/${refId}`
		navigator.clipboard.writeText(url)
		toast.success(t('Link copied to clipboard'))
	}

	function handleClose() {
		onClose()
	}

	function handleBackdropClick(e: React.MouseEvent) {
		if (e.target === dialogRef.current) {
			handleClose()
		}
	}

	if (!open) return null

	return (
		<div ref={dialogRef} className="c-modal show" tabIndex={-1} onClick={handleBackdropClick}>
			<div
				className="c-dialog c-panel emph p-0"
				style={{ minWidth: '400px', maxWidth: '500px' }}
			>
				{/* Header */}
				<div className="c-hbox g-2 p-3 border-bottom">
					<div className="c-hbox g-2 flex-fill align-items-center">
						{React.createElement<React.ComponentProps<typeof IcUnknown>>(Icon, {
							style: { fontSize: '1.25rem' }
						})}
						<div>
							<h3 className="m-0">{t('Share')}</h3>
							<div
								className="text-secondary text-small text-truncate"
								style={{ maxWidth: '300px' }}
							>
								{file.fileName}
							</div>
						</div>
					</div>
					<button
						type="button"
						className="c-link p-1"
						onClick={handleClose}
						aria-label={t('Close')}
					>
						<IcClose style={{ fontSize: '1.25rem' }} />
					</button>
				</div>

				{/* Tabs */}
				<div className="px-3 pt-2">
					<Tabs
						value={activeTab}
						onTabChange={(v) => setActiveTab(v as 'people' | 'link')}
					>
						<Tab value="people">
							<IcUsers className="me-2" />
							{t('People')}
						</Tab>
						<Tab value="link">
							<IcLink className="me-2" />
							{t('Link')}
						</Tab>
					</Tabs>
				</div>

				{/* Tab content */}
				<div
					className="p-3"
					style={{ minHeight: '300px', maxHeight: '60vh', overflowY: 'auto' }}
				>
					{!isOwner ? (
						<div className="text-secondary text-center py-4">
							{t('Only the owner can share this file.')}
						</div>
					) : activeTab === 'people' ? (
						<div className="c-vbox g-3">
							{/* Can edit section */}
							<div>
								<h4 className="mb-2">{t('Can edit')}</h4>
								<EditProfileList
									placeholder={t('Add people with edit access...')}
									profiles={writePerms.flatMap((rp) =>
										rp.audience ? [rp.audience] : []
									)}
									listProfiles={listProfiles}
									addProfile={(p) => addPerm(p, 'WRITE')}
									confirmingRemove={confirmingRemovePerm}
									onRequestRemove={requestRemovePerm}
									onCancelRemove={cancelRemovePerm}
									onConfirmRemove={confirmRemovePerm}
								/>
							</div>

							{/* Read only section */}
							<div>
								<h4 className="mb-2">{t('Read only')}</h4>
								<EditProfileList
									placeholder={t('Add people with view access...')}
									profiles={readPerms.flatMap((rp) =>
										rp.audience ? [rp.audience] : []
									)}
									listProfiles={listProfiles}
									addProfile={(p) => addPerm(p, 'READ')}
									confirmingRemove={confirmingRemovePerm}
									onRequestRemove={requestRemovePerm}
									onCancelRemove={cancelRemovePerm}
									onConfirmRemove={confirmRemovePerm}
								/>
							</div>
						</div>
					) : null}

					{isOwner && activeTab === 'link' && (
						<div className="c-vbox g-3">
							{/* Create new link form */}
							<div className="c-panel mid p-3">
								<h4 className="mb-3">{t('Create a new link')}</h4>

								<div className="c-vbox g-2">
									{/* Access level */}
									<div className="c-hbox g-2 align-items-center">
										<label className="text-nowrap" style={{ minWidth: '80px' }}>
											{t('Access')}
										</label>
										<select
											className="c-input flex-fill"
											value={newLinkAccess}
											onChange={(e) =>
												setNewLinkAccess(e.target.value as 'read' | 'write')
											}
										>
											<option value="read">{t('Read only')}</option>
											<option value="write">{t('Can edit')}</option>
										</select>
									</div>

									{/* Label */}
									<div className="c-hbox g-2 align-items-center">
										<label className="text-nowrap" style={{ minWidth: '80px' }}>
											{t('Label')}
										</label>
										<input
											type="text"
											className="c-input flex-fill"
											placeholder={t('e.g. For review, Public access...')}
											value={newLinkLabel}
											onChange={(e) => setNewLinkLabel(e.target.value)}
										/>
									</div>

									{/* Expiration */}
									<div className="c-hbox g-2 align-items-center">
										<label className="text-nowrap" style={{ minWidth: '80px' }}>
											{t('Expires')}
										</label>
										<div className="c-hbox g-2 flex-fill align-items-center">
											<input
												type="date"
												className="c-input flex-fill"
												value={newLinkExpires}
												onChange={(e) => {
													setNewLinkExpires(e.target.value)
													if (e.target.value) setNeverExpires(false)
												}}
												disabled={neverExpires}
												min={dayjs().format('YYYY-MM-DD')}
											/>
											<Toggle
												label={t('Never')}
												checked={neverExpires}
												onChange={(e) => {
													setNeverExpires(e.target.checked)
													if (e.target.checked) setNewLinkExpires('')
												}}
											/>
										</div>
									</div>

									{/* Create button */}
									<div className="mt-2">
										<Button
											primary
											onClick={createShareLink}
											disabled={creatingLink}
										>
											{creatingLink ? t('Creating...') : t('Create Link')}
										</Button>
									</div>
								</div>
							</div>

							{/* Existing links */}
							{shareRefs.length > 0 && (
								<div>
									<h4 className="mb-2">{t('Active links')}</h4>
									<div className="c-vbox g-2">
										{shareRefs.map((ref) =>
											confirmingDeleteRef === ref.refId ? (
												<div
													key={ref.refId}
													className="c-hbox g-2 align-items-center p-2 bg-secondary-subtle rounded"
												>
													<span className="flex-fill text-small">
														{t('Delete this link?')}
													</span>
													<Button
														size="small"
														onClick={cancelDeleteShareLink}
													>
														{t('Cancel')}
													</Button>
													<Button
														size="small"
														primary
														onClick={() =>
															confirmDeleteShareLink(ref.refId)
														}
													>
														{t('Delete')}
													</Button>
												</div>
											) : (
												<div
													key={ref.refId}
													className="c-hbox g-2 align-items-center p-2 bg-secondary-subtle rounded"
												>
													<IcLink className="flex-shrink-0" />
													<div className="flex-fill text-truncate">
														<div>{ref.description || ref.refId}</div>
														<div className="text-secondary text-small">
															{ref.accessLevel === 'write'
																? t('Can edit')
																: t('Read only')}
															{ref.expiresAt
																? ` · ${t('Expires')} ${dayjs(ref.expiresAt).format('YYYY-MM-DD')}`
																: ` · ${t('Never expires')}`}
														</div>
													</div>
													<button
														type="button"
														className="c-link p-1"
														title={t('Copy link')}
														onClick={() => copyShareLink(ref.refId)}
													>
														<IcCopy />
													</button>
													<button
														type="button"
														className="c-link p-1"
														title={t('Show QR code')}
														onClick={() =>
															setQrCodeUrl(
																`${window.location.origin}/s/${ref.refId}`
															)
														}
													>
														<IcQrCode />
													</button>
													<button
														type="button"
														className="c-link p-1"
														title={t('Delete link')}
														onClick={() =>
															requestDeleteShareLink(ref.refId)
														}
													>
														<IcTrash />
													</button>
												</div>
											)
										)}
									</div>
								</div>
							)}

							{shareRefs.length === 0 && !loadingRefs && (
								<div className="text-secondary text-center py-3">
									{t('No share links yet. Create one above.')}
								</div>
							)}
						</div>
					)}
				</div>
			</div>
			<QRCodeDialog value={qrCodeUrl} onClose={() => setQrCodeUrl(undefined)} />
		</div>
	)
}

// vim: ts=4
