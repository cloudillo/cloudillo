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

import { FiEdit2 as IcEdit, FiMoreVertical as IcMore } from 'react-icons/fi'
import {
	LuLink as IcLink,
	LuCopy as IcCopy,
	LuQrCode as IcQrCode,
	LuShare2 as IcShare,
	LuTrash2 as IcTrash,
	LuStar as IcStar,
	LuPin as IcPin,
	LuChevronDown as IcChevronDown
} from 'react-icons/lu'

import { ActionView, NewAction } from '@cloudillo/types'
import * as Types from '@cloudillo/core'
import { getFileUrl } from '@cloudillo/core'
import {
	useAuth,
	useDialog,
	useToast,
	Button,
	Popper,
	ProfileCard,
	InlineEditForm,
	QRCodeDialog
} from '@cloudillo/react'
import { useAtom } from 'jotai'
import { useContextAwareApi, activeContextAtom } from '../../../context/index.js'

import { getFileIcon, IcUnknown } from '../icons.js'
import { TagsCell } from './TagsCell.js'
import {
	formatRelativeTime,
	getVisibilityIcon,
	getVisibilityLabelKey,
	canManageFile,
	VISIBILITY_DROPDOWN_OPTIONS
} from '../utils.js'
import type { File, FileOps, FileVisibility } from '../types.js'

interface DetailsPanelProps {
	className?: string
	file: File
	renameFileId?: string
	renameFileName?: string
	fileOps: FileOps
	onShare?: (file: File) => void
}

export function DetailsPanel({
	className,
	file,
	renameFileId,
	renameFileName,
	fileOps,
	onShare
}: DetailsPanelProps) {
	const { t } = useTranslation()
	const { api } = useContextAwareApi()
	const [auth] = useAuth()
	const [activeContext] = useAtom(activeContextAtom)
	const dialog = useDialog()
	const toast = useToast()
	const [fileActions, setFileActions] = React.useState<ActionView[] | undefined>()
	const [shareRefs, setShareRefs] = React.useState<Types.Ref[] | undefined>()
	const [debouncedFileId, setDebouncedFileId] = React.useState(file.fileId)
	const [qrCodeUrl, setQrCodeUrl] = React.useState<string | undefined>()

	const Icon = getFileIcon(file.contentType, file.fileTp)
	const isImage = file.contentType?.startsWith('image/')
	const isFolder = file.fileTp === 'FLDR'

	const readPerms = React.useMemo(
		function readPerms() {
			return fileActions
				?.filter((a) => a.type === 'FSHR' && a.subType === 'READ')
				.sort((a, b) => a.audience?.idTag.localeCompare(b.audience?.idTag ?? '') || 0)
		},
		[fileActions]
	)

	const writePerms = React.useMemo(
		function writePerms() {
			return fileActions
				?.filter((a) => a.type === 'FSHR' && a.subType === 'WRITE')
				.sort((a, b) => a.audience?.idTag.localeCompare(b.audience?.idTag ?? '') || 0)
		},
		[fileActions]
	)

	// Debounce file ID changes to avoid excessive API calls during keyboard navigation
	React.useEffect(
		function debounceFileId() {
			const timer = setTimeout(() => {
				setDebouncedFileId(file.fileId)
			}, 300)

			return () => clearTimeout(timer)
		},
		[file.fileId]
	)

	React.useEffect(
		function loadFileDetails() {
			if (!api) return

			;(async function () {
				const actions = await api.actions.list({ type: 'FSHR', subject: debouncedFileId })
				setFileActions(actions)

				const refs = await api.refs.list({
					type: 'share.file',
					resourceId: debouncedFileId
				})
				setShareRefs(refs)
			})()
		},
		[api, debouncedFileId]
	)

	// Permissions
	async function removePerm(idTag: string) {
		if (!file || !api) return
		if (
			!(await dialog.confirm(
				t('Confirmation'),
				t("Are you sure you want to remove this user's permission?")
			))
		)
			return

		const action: NewAction = {
			type: 'FSHR',
			subject: file.fileId,
			audienceTag: idTag
		}

		await api.actions.create(action)
		setFileActions((fa) => fa?.filter((fa) => fa.audience?.idTag !== idTag))
	}

	// Public Links
	async function deleteShareLink(refId: string) {
		if (!api) return
		if (
			!(await dialog.confirm(
				t('Confirmation'),
				t('Are you sure you want to delete this link?')
			))
		)
			return

		try {
			await api.refs.delete(refId)
			setShareRefs((refs) => refs?.filter((r) => r.refId !== refId))
			toast.success(t('Share link deleted'))
		} catch (err) {
			console.error('Failed to delete share link', err)
			toast.error(t('Failed to delete share link'))
		}
	}

	function copyShareLink(refId: string) {
		const url = `${window.location.origin}/s/${refId}`
		navigator.clipboard.writeText(url)
		toast.success(t('Link copied to clipboard'))
	}

	return (
		<div className="c-vbox g-2">
			{/* File Preview Section */}
			{!isFolder && (
				<div className="c-file-preview">
					{isImage && auth?.idTag ? (
						<img
							className="c-file-preview-image"
							src={getFileUrl(auth.idTag, file.fileId, 'vis.sd')}
							alt={file.fileName}
						/>
					) : file.variantId && auth?.idTag ? (
						<img
							className="c-file-preview-image"
							src={getFileUrl(auth.idTag, file.variantId, 'vis.sd')}
							alt={file.fileName}
						/>
					) : (
						<div className="c-file-preview-icon">
							{React.createElement<React.ComponentProps<typeof IcUnknown>>(Icon, {})}
						</div>
					)}
				</div>
			)}

			{/* Quick actions bar */}
			<div className="c-hbox g-2 mb-1">
				<Button
					className={file.userData?.starred ? 'accent' : 'secondary'}
					onClick={() => fileOps.toggleStarred?.(file.fileId)}
				>
					<IcStar /> {file.userData?.starred ? t('Starred') : t('Star')}
				</Button>
				<Button
					className={file.userData?.pinned ? 'accent' : 'secondary'}
					onClick={() => fileOps.togglePinned?.(file.fileId)}
				>
					<IcPin /> {file.userData?.pinned ? t('Pinned') : t('Pin')}
				</Button>
			</div>

			{/* Visibility section */}
			<div className="c-panel mid">
				<h4 className="c-panel-title">{t('Visibility')}</h4>
				<div className="c-hbox g-2 align-items-center">
					{(() => {
						const VisibilityIcon = getVisibilityIcon(file.visibility ?? null)
						return <VisibilityIcon className="text-secondary" />
					})()}
					{canManageFile(file, auth?.idTag, activeContext?.roles ?? []) &&
					fileOps.setVisibility ? (
						<Popper
							menuClassName="c-button secondary c-hbox g-2 align-items-center"
							icon={<span>{t(getVisibilityLabelKey(file.visibility ?? null))}</span>}
							label={<IcChevronDown className="text-secondary" />}
						>
							<ul className="c-nav vertical">
								{VISIBILITY_DROPDOWN_OPTIONS.map((opt) => {
									const OptionIcon = opt.icon
									const isCurrentVisibility =
										(file.visibility ?? null) === opt.value
									return (
										<li key={opt.value ?? 'null'} className="c-nav-item">
											<a
												className={isCurrentVisibility ? 'active' : ''}
												onClick={() =>
													fileOps.setVisibility!(file.fileId, opt.value)
												}
											>
												<OptionIcon className="me-2" />
												{t(opt.labelKey)}
											</a>
										</li>
									)
								})}
							</ul>
						</Popper>
					) : (
						<span>{t(getVisibilityLabelKey(file.visibility ?? null))}</span>
					)}
				</div>
			</div>

			{/* Activity section */}
			{(file.userData?.accessedAt || file.userData?.modifiedAt) && (
				<div className="c-panel mid">
					<h4 className="c-panel-title">{t('Activity')}</h4>
					<dl className="c-description-list">
						{file.userData?.accessedAt && (
							<>
								<dt>{t('Last opened')}</dt>
								<dd>{formatRelativeTime(file.userData.accessedAt)}</dd>
							</>
						)}
						{file.userData?.modifiedAt && (
							<>
								<dt>{t('Last edited')}</dt>
								<dd>{formatRelativeTime(file.userData.modifiedAt)}</dd>
							</>
						)}
						<dt>{t('Created')}</dt>
						<dd>{formatRelativeTime(file.createdAt)}</dd>
					</dl>
				</div>
			)}

			<div className="c-panel mid">
				<div className="c-panel-header d-flex">
					<h3 className="c-panel-title d-flex flex-fill">
						{React.createElement<React.ComponentProps<typeof IcUnknown>>(Icon, {
							className: 'me-1'
						})}
						{renameFileName !== undefined && file.fileId === renameFileId ? (
							<InlineEditForm
								value={renameFileName}
								onSave={(newName) => fileOps.doRenameFile(file.fileId, newName)}
								onCancel={() => fileOps.setRenameFileName(undefined)}
								size="small"
							/>
						) : (
							file.fileName
						)}
					</h3>
					<div className="c-hbox justify-content-end g-2 me-4">
						{!isFolder && (
							<Button
								link
								className="p-1"
								onClick={() =>
									fileOps.openFile(
										file.fileId,
										file.accessLevel === 'none' ? 'read' : file.accessLevel
									)
								}
							>
								<IcEdit />
							</Button>
						)}
						<Popper className="c-link" icon={<IcMore />}>
							<ul className="c-nav">
								<li className="c-nav-item">
									<a href="#" onClick={() => fileOps.renameFile(file.fileId)}>
										{t('Rename...')}
									</a>
								</li>
							</ul>
						</Popper>
					</div>
				</div>
				<div className="c-tag-list">
					<TagsCell fileId={file.fileId} tags={file.tags} editable />
				</div>
			</div>

			{canManageFile(file, auth?.idTag, activeContext?.roles ?? []) && (
				<div className="c-panel mid">
					<div className="c-panel-header d-flex align-items-center">
						<h3 className="flex-fill">{t('Sharing')}</h3>
						{onShare && (
							<Button
								link
								className="p-1"
								onClick={() => onShare(file)}
								title={t('Share...')}
							>
								<IcShare />
							</Button>
						)}
					</div>
					<div className="c-vbox g-3">
						{/* Write permissions */}
						{writePerms && writePerms.length > 0 && (
							<div>
								<h4 className="text-small text-secondary mb-2">{t('Can edit')}</h4>
								<div className="c-vbox g-1">
									{writePerms
										.filter((rp) => rp.audience)
										.map((rp) => (
											<button
												key={rp.audience!.idTag}
												type="button"
												className="c-link w-100 p-0 ps-1 c-hbox align-items-center"
												onClick={() => removePerm(rp.audience!.idTag)}
												title={t('Remove permission')}
											>
												<ProfileCard
													className="flex-fill"
													profile={rp.audience!}
												/>
												<IcTrash className="text-secondary" />
											</button>
										))}
								</div>
							</div>
						)}

						{/* Read permissions */}
						{readPerms && readPerms.length > 0 && (
							<div>
								<h4 className="text-small text-secondary mb-2">{t('Read only')}</h4>
								<div className="c-vbox g-1">
									{readPerms
										.filter((rp) => rp.audience)
										.map((rp) => (
											<button
												key={rp.audience!.idTag}
												type="button"
												className="c-link w-100 p-0 ps-1 c-hbox align-items-center"
												onClick={() => removePerm(rp.audience!.idTag)}
												title={t('Remove permission')}
											>
												<ProfileCard
													className="flex-fill"
													profile={rp.audience!}
												/>
												<IcTrash className="text-secondary" />
											</button>
										))}
								</div>
							</div>
						)}

						{/* Public links */}
						{shareRefs && shareRefs.length > 0 && (
							<div>
								<h4 className="text-small text-secondary mb-2">
									{t('Public links')}
								</h4>
								<div className="c-vbox g-2">
									{shareRefs.map((ref) => (
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
												onClick={() => deleteShareLink(ref.refId)}
											>
												<IcTrash />
											</button>
										</div>
									))}
								</div>
							</div>
						)}

						{/* Empty state */}
						{(!writePerms || writePerms.length === 0) &&
							(!readPerms || readPerms.length === 0) &&
							(!shareRefs || shareRefs.length === 0) && (
								<div className="text-secondary text-center py-2">
									{t('Not shared')}
									{onShare && (
										<>
											{' · '}
											<button
												type="button"
												className="c-link"
												onClick={() => onShare(file)}
											>
												{t('Share now')}
											</button>
										</>
									)}
								</div>
							)}
					</div>
				</div>
			)}
			<QRCodeDialog value={qrCodeUrl} onClose={() => setQrCodeUrl(undefined)} />
		</div>
	)
}

// vim: ts=4
