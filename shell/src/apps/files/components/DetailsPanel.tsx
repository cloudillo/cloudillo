// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

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

import type { ActionView, NewAction } from '@cloudillo/types'
import type * as Types from '@cloudillo/core'
import { getFileUrl } from '@cloudillo/core'
import {
	useAuth,
	useDialog,
	useToast,
	Button,
	Popper,
	ProfileCard,
	QRCodeDialog
} from '@cloudillo/react'
import { useAtom } from 'jotai'
import {
	useContextAwareApi,
	useCurrentContextIdTag,
	activeContextAtom
} from '../../../context/index.js'

import { getFileIcon, IcUnknown } from '../icons.js'
import { TagsCell } from './TagsCell.js'
import {
	formatRelativeTime,
	getVisibilityIcon,
	getVisibilityLabel,
	canManageFile,
	getVisibilityDropdownOptions
} from '../utils.js'
import type { File, FileOps } from '../types.js'

interface DetailsPanelProps {
	className?: string
	file: File
	fileOps: FileOps
	onShare?: (file: File) => void
}

export function DetailsPanel({ file, fileOps, onShare }: DetailsPanelProps) {
	const { t } = useTranslation()
	const { api } = useContextAwareApi()
	const [auth] = useAuth()
	const contextIdTag = useCurrentContextIdTag()
	const [activeContext] = useAtom(activeContextAtom)
	const dialog = useDialog()
	const toast = useToast()
	const [fileActions, setFileActions] = React.useState<ActionView[] | undefined>()
	const [shareRefs, setShareRefs] = React.useState<Types.Ref[] | undefined>()
	const [shareEntries, setShareEntries] = React.useState<Types.ShareEntry[] | undefined>()
	const [qrCodeUrl, setQrCodeUrl] = React.useState<string | undefined>()

	const Icon = getFileIcon(file.contentType, file.fileTp)
	const isImage = file.contentType?.startsWith('image/')
	const isFolder = file.fileTp === 'FLDR'

	const readPerms = React.useMemo(
		function readPerms() {
			return fileActions
				?.filter((a) => a.type === 'FSHR' && a.subType === 'READ')
				.sort(
					(a, b) => (a.audience?.idTag ?? '').localeCompare(b.audience?.idTag ?? '') || 0
				)
		},
		[fileActions]
	)

	const commentPerms = React.useMemo(
		function commentPerms() {
			return fileActions
				?.filter((a) => a.type === 'FSHR' && a.subType === 'COMMENT')
				.sort(
					(a, b) => (a.audience?.idTag ?? '').localeCompare(b.audience?.idTag ?? '') || 0
				)
		},
		[fileActions]
	)

	const writePerms = React.useMemo(
		function writePerms() {
			return fileActions
				?.filter((a) => a.type === 'FSHR' && a.subType === 'WRITE')
				.sort(
					(a, b) => (a.audience?.idTag ?? '').localeCompare(b.audience?.idTag ?? '') || 0
				)
		},
		[fileActions]
	)

	React.useEffect(
		function loadFileDetails() {
			if (!api) return

			let cancelled = false

			;(async function () {
				const actions = await api.actions.list({ type: 'FSHR', subject: file.fileId })
				if (cancelled) return
				setFileActions(actions)

				const refs = await api.refs.list({
					type: 'share.file',
					resourceId: file.fileId
				})
				if (cancelled) return
				setShareRefs(refs)

				try {
					const allEntries = await api.files.listShares(file.fileId)
					if (cancelled) return
					const fileEntries = allEntries.filter((e) => e.subjectType === 'F')
					setShareEntries(fileEntries)
				} catch (err) {
					console.error('Failed to load share entries', err)
				}
			})()

			return () => {
				cancelled = true
			}
		},
		[api, file.fileId]
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

	// Share entries
	async function deleteShareEntry(entryId: number) {
		if (!api) return
		if (
			!(await dialog.confirm(
				t('Confirmation'),
				t('Are you sure you want to remove this linked file?')
			))
		)
			return

		try {
			await api.files.deleteShare(file.fileId, entryId)
			setShareEntries((entries) => entries?.filter((e) => e.id !== entryId))
			toast.success(t('Link removed'))
		} catch (err) {
			console.error('Failed to delete share entry', err)
			toast.error(t('Failed to remove link'))
		}
	}

	const VisibilityIcon = getVisibilityIcon(file.visibility ?? null)
	const canManage = canManageFile(file, auth?.idTag, activeContext?.roles ?? [])

	const sharedPeopleCount =
		(readPerms?.length ?? 0) + (commentPerms?.length ?? 0) + (writePerms?.length ?? 0)
	const sharedLinkCount = shareRefs?.length ?? 0
	const sharingSummary =
		sharedPeopleCount > 0 || sharedLinkCount > 0
			? [
					sharedPeopleCount > 0
						? sharedPeopleCount === 1
							? t('1 person')
							: t('{{n}} people', { n: sharedPeopleCount })
						: null,
					sharedLinkCount > 0
						? sharedLinkCount === 1
							? t('1 link')
							: t('{{n}} links', { n: sharedLinkCount })
						: null
				]
					.filter(Boolean)
					.join(' · ')
			: undefined

	return (
		<div className="c-vbox g-2">
			{/* Header — subject of the panel — and quick-actions toolbar */}
			<div className="c-panel mid c-details-subject">
				<div className="c-details-header">
					<div className="c-details-thumb">
						{isImage && contextIdTag ? (
							<img
								src={getFileUrl(contextIdTag, file.fileId, 'vis.sd')}
								alt={file.fileName}
							/>
						) : file.variantId && contextIdTag ? (
							<img
								src={getFileUrl(contextIdTag, file.variantId, 'vis.sd')}
								alt={file.fileName}
							/>
						) : (
							<Icon />
						)}
					</div>
					<div className="c-details-title">
						<h2 title={file.fileName}>{file.fileName}</h2>
						{(file.contentType || file.owner?.name) && (
							<div className="text-secondary text-small">
								{[file.contentType, file.owner?.name].filter(Boolean).join(' · ')}
							</div>
						)}
					</div>
				</div>

				{/* Quick actions toolbar */}
				<div className="c-details-actions c-hbox g-1">
					{!isFolder && (
						<Button
							kind="link"
							title={t('Open')}
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
					<Button
						kind="link"
						aria-pressed={!!file.userData?.starred}
						className={file.userData?.starred ? 'text-accent' : ''}
						title={file.userData?.starred ? t('Starred') : t('Star')}
						onClick={() => fileOps.toggleStarred?.(file.fileId)}
					>
						<IcStar />
					</Button>
					<Button
						kind="link"
						aria-pressed={!!file.userData?.pinned}
						className={file.userData?.pinned ? 'text-accent' : ''}
						title={file.userData?.pinned ? t('Pinned') : t('Pin')}
						onClick={() => fileOps.togglePinned?.(file.fileId)}
					>
						<IcPin />
					</Button>
					{onShare && canManage && (
						<Button kind="link" title={t('Share')} onClick={() => onShare(file)}>
							<IcShare />
						</Button>
					)}
					<Popper className="c-link ms-auto" icon={<IcMore />}>
						<ul className="c-nav vertical">
							<li className="c-nav-item">
								<a onClick={() => fileOps.renameFile(file.fileId)}>
									{t('Rename...')}
								</a>
							</li>
						</ul>
					</Popper>
				</div>
			</div>

			{/* Properties */}
			<div className="c-panel mid">
				<dl className="c-description-list">
					<dt>{t('Visibility')}</dt>
					<dd>
						{canManage && fileOps.setVisibility ? (
							<Popper
								menuClassName="c-button secondary c-hbox g-2 align-items-center"
								icon={
									<>
										<VisibilityIcon className="me-2" />
										{getVisibilityLabel(t, file.visibility ?? null)}
									</>
								}
								label={<IcChevronDown />}
							>
								<ul className="c-nav vertical">
									{getVisibilityDropdownOptions(t).map((opt) => {
										const OptionIcon = opt.icon
										const isCurrentVisibility =
											(file.visibility ?? null) === opt.value
										return (
											<li key={opt.value ?? 'null'} className="c-nav-item">
												<a
													className={isCurrentVisibility ? 'active' : ''}
													onClick={() =>
														fileOps.setVisibility!(
															file.fileId,
															opt.value
														)
													}
												>
													<OptionIcon className="me-2" />
													{opt.label}
												</a>
											</li>
										)
									})}
								</ul>
							</Popper>
						) : (
							<span className="c-hbox g-2 align-items-center">
								<VisibilityIcon />
								{getVisibilityLabel(t, file.visibility ?? null)}
							</span>
						)}
					</dd>

					{file.owner?.name && (
						<>
							<dt>{t('Owner')}</dt>
							<dd>{file.owner.name}</dd>
						</>
					)}

					{file.contentType && (
						<>
							<dt>{t('Type')}</dt>
							<dd>{file.contentType}</dd>
						</>
					)}

					<dt>{t('Created')}</dt>
					<dd>{formatRelativeTime(file.createdAt)}</dd>

					{file.userData?.modifiedAt && (
						<>
							<dt>{t('Last edited')}</dt>
							<dd>{formatRelativeTime(file.userData.modifiedAt)}</dd>
						</>
					)}

					{file.userData?.accessedAt && (
						<>
							<dt>{t('Last opened')}</dt>
							<dd>{formatRelativeTime(file.userData.accessedAt)}</dd>
						</>
					)}

					<dt>{t('Tags')}</dt>
					<dd>
						<TagsCell fileId={file.fileId} tags={file.tags} editable />
					</dd>
				</dl>
			</div>

			{canManage && (
				<div className="c-panel mid">
					<div className="c-panel-header">
						<h3>
							{t('Sharing')}
							{sharingSummary && (
								<span className="text-secondary text-small ms-2">
									{sharingSummary}
								</span>
							)}
						</h3>
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

						{/* Comment permissions */}
						{commentPerms && commentPerms.length > 0 && (
							<div>
								<h4 className="text-small text-secondary mb-2">
									{t('Can comment')}
								</h4>
								<div className="c-vbox g-1">
									{commentPerms
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
														: ref.accessLevel === 'comment'
															? t('Can comment')
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

						{/* Embedded in */}
						{shareEntries && shareEntries.length > 0 && (
							<div>
								<h4 className="text-small text-secondary mb-2">
									{t('Embedded in')}
								</h4>
								<div className="c-vbox g-1">
									{shareEntries.map((entry) => {
										const EntryIcon = entry.subjectContentType
											? getFileIcon(
													entry.subjectContentType,
													entry.subjectFileTp
												)
											: IcUnknown

										return (
											<div
												key={entry.id}
												className="w-100 p-0 ps-1 c-hbox g-2 align-items-center"
											>
												{React.createElement<
													React.ComponentProps<typeof IcUnknown>
												>(EntryIcon, { className: 'flex-shrink-0' })}
												<div className="flex-fill" style={{ minWidth: 0 }}>
													<div className="text-truncate">
														{entry.subjectFileName || entry.subjectId}
													</div>
													<div className="text-secondary text-small">
														{entry.permission === 'W'
															? t('Can edit')
															: entry.permission === 'C'
																? t('Can comment')
																: t('Read only')}
													</div>
												</div>
												<button
													type="button"
													className="c-link p-1"
													title={t('Remove link')}
													onClick={() => deleteShareEntry(entry.id)}
												>
													<IcTrash className="text-secondary" />
												</button>
											</div>
										)
									})}
								</div>
							</div>
						)}

						{/* Empty state */}
						{(!writePerms || writePerms.length === 0) &&
							(!commentPerms || commentPerms.length === 0) &&
							(!readPerms || readPerms.length === 0) &&
							(!shareRefs || shareRefs.length === 0) &&
							(!shareEntries || shareEntries.length === 0) && (
								<div className="c-vbox g-2 align-items-center text-center py-2">
									<div className="text-secondary">
										{t('This file is private')}
									</div>
									{onShare && (
										<Button onClick={() => onShare(file)}>
											<IcShare /> {t('Share file')}
										</Button>
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
