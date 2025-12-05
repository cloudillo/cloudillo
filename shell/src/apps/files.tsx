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
import dayjs from 'dayjs'
import { useTranslation } from 'react-i18next'

import {
	FiSearch as IcSearch,
	FiEdit2 as IcEdit,
	FiTrash as IcDelete,
	FiSave as IcSave,
	FiX as IcCancel,
	FiList as IcToDo,
	FiUploadCloud as IcUploaded,
	FiUser as IcUser,
	FiEye as IcMonitor,
	FiMoreVertical as IcMore,
	FiImage as IcImage,
	FiFilm as IcVideo,
	FiFileText as IcDocument,
	FiFile as IcUnknown
} from 'react-icons/fi'

import {
	LuFilter as IcFilter,
	LuFilePlus2 as IcNewFile,
	LuCloud as IcAll,
	LuFilePen as IcMutable,
	LuFile as IcImmutable,
	LuBookOpen as IcQuillo,
	LuSheet as IcCalcillo,
	LuShapes as IcIdeallo,
	LuPresentation as IcPrezillo,
	LuListTodo as IcFormillo,
	LuListChecks as IcTaskillo,
	LuLink as IcLink,
	LuCopy as IcCopy,
	LuPlus as IcPlus,
	LuTrash2 as IcTrash
} from 'react-icons/lu'

import { Columns, ColumnConfig, DataTable, TableDataProvider } from '@symbion/ui-core'
import '@symbion/ui-core/datatable.css'
import '@symbion/ui-core/scroll.css'

import { NewAction, ActionView, Profile } from '@cloudillo/types'
import * as Types from '@cloudillo/base'
import {
	useApi,
	useAuth,
	useDialog,
	useToast,
	Button,
	Fcd,
	ProfilePicture,
	EditProfileList,
	Popper,
	Dialog,
	mergeClasses,
	InlineEditForm,
	LoadingSpinner,
	EmptyState
} from '@cloudillo/react'

import { useAppConfig, parseQS, qs } from '../utils.js'
import { Tags, EditTags } from '../tags.js'
import { useCurrentContextIdTag } from '../context/index.js'

const icons: Record<string, React.ComponentType> = {
	//const icons: Record<string, (props: React.SVGProps<SVGSVGElement>) => React.ReactNode> = {
	'image/jpeg': (props) => <IcImage {...props} style={{ color: 'lch(50 50 0)' }} />,
	'image/png': (props) => <IcImage {...props} style={{ color: 'lch(50 50 0)' }} />,
	'video/mp4': (props) => <IcVideo {...props} style={{ color: 'lch(50 50 0)' }} />,
	'application/pdf': (props) => <IcDocument {...props} style={{ color: 'lch(50 50 0)' }} />,
	'cloudillo/quillo': (props) => <IcQuillo {...props} style={{ color: 'lch(50 50 250)' }} />,
	'cloudillo/calcillo': (props) => <IcCalcillo {...props} style={{ color: 'lch(50 50 150)' }} />,
	'cloudillo/ideallo': (props) => <IcIdeallo {...props} style={{ color: 'lch(50 50 60)' }} />,
	'cloudillo/prezillo': (props) => <IcPrezillo {...props} style={{ color: 'lch(50 50 100)' }} />,
	'cloudillo/formillo': (props) => <IcFormillo {...props} style={{ color: 'lch(50 50 300)' }} />,
	'cloudillo/taskillo': (props) => <IcTaskillo {...props} style={{ color: 'lch(50 50 180)' }} />
}

interface File {
	fileId: string
	fileName: string
	owner?: {
		idTag: string
		name: string
		profilePic?: string
	}
	fileTp?: string
	contentType: string
	createdAt: string
	preset: string
	tags?: string[]
	variantId?: string
}

interface FileView extends File {
	actions: undefined
}

interface FileOps {
	setFile?: (file: File) => void
	openFile: (fileId: string, access?: 'read' | 'write') => void
	renameFile: (fileId?: string) => void
	setRenameFileName: (name?: string) => void
	doRenameFile: (fileId: string, fileName: string) => void
	doDeleteFile: (fileId: string) => void
}

function TagsCell({
	fileId,
	tags,
	setTags,
	editable
}: {
	fileId: string
	tags: string[] | undefined
	setTags?: (tags: string[] | undefined) => void
	editable?: boolean
}) {
	const { api, setIdTag } = useApi()
	const [isEditing, setIsEditing] = React.useState(false)

	async function listTags(prefix: string) {
		if (!api) return
		return api.tags.list({ prefix })
	}

	async function addTag(tag: string) {
		if (!api) return
		const res = await api.files.addTag(fileId, tag)
		if (res.tags) setTags?.(res.tags)
	}

	async function removeTag(tag: string) {
		if (!api) return
		const res = await api.files.removeTag(fileId, tag)
		if (res.tags) setTags?.(res.tags)
	}

	if (isEditing) {
		return <EditTags tags={tags} listTags={listTags} addTag={addTag} removeTag={removeTag} />
	} else {
		return (
			<div className="c-tag-list g-1">
				<Tags tags={tags} />
				{!!editable && (
					<Button link onClick={() => setIsEditing(true)}>
						<IcEdit />
					</Button>
				)}
			</div>
		)
	}
}

interface FileColumnsArgs {
	t: (text: string) => string
	renameFileId?: string
	renameFileName?: string
	fileOps: FileOps
}
function fileColumns({ t, fileOps, renameFileId, renameFileName }: FileColumnsArgs) {
	const fileColumns: Columns<File, FileView> = {
		fileName: {
			title: t('Name'),
			defaultWidth: 50,
			sort: true,
			format: (v, r) =>
				r.fileId === renameFileId && renameFileName !== undefined ? (
					<InlineEditForm
						value={renameFileName}
						onSave={(newName) => fileOps.doRenameFile(r.fileId, newName)}
						onCancel={() => fileOps.renameFile()}
					/>
				) : (
					v
				)
		},
		contentType: {
			title: t(''),
			defaultWidth: 3,
			format: (v) => React.createElement(icons[v] || IcUnknown)
		},
		createdAt: {
			title: t('Created at'),
			defaultWidth: 20,
			sort: true,
			format: (v) => dayjs(v).format('YYYY-MM-DD HH:mm')
		},
		preset: {
			title: t('Preset'),
			defaultWidth: 10,
			sort: true
		},
		tags: {
			title: t('Tags'),
			defaultWidth: 30,
			sort: true,
			format: (v, r) => <TagsCell fileId={r.fileId} tags={r.tags} />
			//format: (v, r) => <EditTags tags={r.tags} listTags={listTags}/>
		},
		actions: {
			title: '',
			defaultWidth: 10,
			format: (v, r) => (
				<div className="d-flex">
					<button
						className="c-link p-1"
						type="button"
						onClick={(evt) => (evt.stopPropagation(), fileOps.openFile(r.fileId))}
					>
						<IcEdit />
					</button>
					<div className="dropdown">
						<details className="c-dropdown">
							<summary className="c-link p-1">
								<IcMore />
							</summary>
							<ul className="c-nav">
								<li className="c-nav-item">
									<a href="#" onClick={() => fileOps.renameFile(r.fileId)}>
										{t('Rename...')}
									</a>
								</li>
							</ul>
						</details>
					</div>
				</div>
			)
		}
	}
	return fileColumns
}

const fileColumnConfig: ColumnConfig<ReturnType<typeof fileColumns>>[] = [
	{ id: 'contentType', width: 2 },
	{ id: 'fileName', width: 30 },
	{ id: 'createdAt', width: 20 },
	{ id: 'tags', width: 30 },
	{ id: 'actions', width: 10 }
]

interface FileFiltState {
	fileName?: string
	preset?: string
	tags?: string[]
}

function useFileListData() {
	const { api, setIdTag } = useApi()
	const [auth] = useAuth()
	const location = useLocation()
	const [sort, setSort] = React.useState<keyof File | undefined>()
	const [sortAsc, setSortAsc] = React.useState(false)
	const [page, setPage] = React.useState(0)
	const [refreshHelper, setRefreshHelper] = React.useState(false)
	const [filter, setFilter] = React.useState<Record<string, string> | undefined>()
	const [files, setFiles] = React.useState<File[] | undefined>()
	//console.log('DT state', sort, sortAsc, page)

	React.useEffect(
		function loadFileList() {
			if (!api) return // Allow guests (removed !auth check)
			;(async function () {
				const qs = parseQS(location.search)
				setFilter(qs)

				if (Object.keys(qs).length > 0) {
					// Note: variant: 'tn' was used in old API but not in new API
					const files = await api.files.list(qs as Types.ListFilesQuery)
					setFiles(
						files.map((f) => ({
							...f,
							preset: f.preset || '',
							createdAt:
								typeof f.createdAt === 'string'
									? f.createdAt
									: f.createdAt.toISOString(),
							owner: f.owner ? { ...f.owner, name: f.owner.name || '' } : undefined,
							variantId: undefined
						}))
					)
				} else {
					setFiles([])
				}
			})()
		},
		[api, location.search, refreshHelper]
	)

	return React.useMemo(
		function () {
			function getData() {
				return files || []
			}

			function setState(
				sort: keyof File | undefined,
				sortAsc: boolean | undefined,
				page: number | undefined
			) {
				if (sort !== undefined) setSort(sort)
				if (sortAsc !== undefined) setSortAsc(sortAsc)
				if (page !== undefined) setPage(page)
			}

			function setFileData(fileId: string, file: File) {
				setFiles((files) => files?.map((f) => (f.fileId === fileId ? file : f)))
			}

			async function next() {
				if (!page) setPage(page + 1)
			}

			async function prev() {
				if (page) setPage(page - 1)
			}

			function refresh() {
				setRefreshHelper((r) => !r)
			}

			return {
				getData,
				setFileData,
				filter,
				state: { sort, sortAsc },
				setState,
				/* page, lastPage: 1, next, prev, */
				refresh
			}
		},
		[files, filter, sort, sortAsc, page]
	)
}

const FilterBar = React.memo(function FilterBar({
	className,
	contextIdTag
}: {
	className?: string
	contextIdTag?: string
}) {
	const { t } = useTranslation()
	const { api, setIdTag } = useApi()
	const [auth] = useAuth()
	const location = useLocation()
	const navigate = useNavigate()
	const dialog = useDialog()
	const fileStat = { mutable: 0, immutable: 0, todo: 0, new: 0, delegated: 0, monitored: 0 }

	const qs = parseQS(location.search)

	async function createFile(contentType: string) {
		if (!contentType) return
		if (!api) return

		const fileName = await dialog.askText(
			t('Create document'),
			t('Provide a name for the new document'),
			{
				placeholder: t('Untitled document')
			}
		)
		if (fileName === undefined) return

		const res = await api.files.create({
			fileTp: 'CRDT',
			contentType
		})
		if (res?.fileId) {
			await api.files.update(res.fileId, {
				fileName: (fileName || t('Untitled document')) as string
			})
		}
		if (res?.fileId) {
			const appPath = (appId: string) =>
				`/app/${contextIdTag || auth?.idTag}/${appId}/${res.fileId}`
			switch (contentType) {
				case 'cloudillo/quillo':
					navigate(appPath('quillo'))
					break
				case 'cloudillo/calcillo':
					navigate(appPath('calcillo'))
					break
				case 'cloudillo/ideallo':
					navigate(appPath('ideallo'))
					break
				case 'cloudillo/prezillo':
					navigate(appPath('prezillo'))
					break
				case 'cloudillo/formillo':
					navigate(appPath('formillo'))
					break
				case 'cloudillo/taskillo':
					navigate(appPath('taskillo'))
					break
			}
		}
	}

	async function createDb(contentType: string) {
		if (!contentType) return
		if (!api) return

		const fileName = await dialog.askText(
			t('Create database'),
			t('Provide a name for the new database'),
			{
				placeholder: t('Untitled database')
			}
		)
		if (fileName === undefined) return

		const res = await api.files.create({
			fileTp: 'RTDB',
			contentType
		})
		if (res?.fileId) {
			await api.files.update(res.fileId, {
				fileName: (fileName || t('Untitled database')) as string
			})
		}
		if (res?.fileId) {
			const appPath = (appId: string) =>
				`/app/${contextIdTag || auth?.idTag}/${appId}/${res.fileId}`
			switch (contentType) {
				case 'cloudillo/taskillo':
					navigate(appPath('taskillo'))
					break
			}
		}
	}

	return (
		<ul className={mergeClasses('c-nav vertical low', className)}>
			{!!auth && (
				<li className="c-nav-item">
					{/*
				<details className="c-dropdown">
				*/}
					<Popper icon={<IcNewFile />} label={t('Create document')}>
						<ul className="c-nav vertical emph">
							<li>
								<button
									className="c-nav-item"
									onClick={() => createFile('cloudillo/quillo')}
								>
									{React.createElement<React.ComponentProps<typeof IcUnknown>>(
										icons['cloudillo/quillo'],
										{ className: 'me-1' }
									)}
									{t('Quillo text document')}
								</button>
							</li>
							<li>
								<a
									className="c-nav-item"
									href="#"
									onClick={() => createFile('cloudillo/calcillo')}
								>
									{React.createElement<React.ComponentProps<typeof IcUnknown>>(
										icons['cloudillo/calcillo'],
										{ className: 'me-1' }
									)}
									{t('Calcillo spreadsheet document')}
								</a>
							</li>
							<li>
								<button
									className="c-nav-item"
									disabled={true || process.env.NODE_ENV === 'production'}
									onClick={() => createFile('cloudillo/ideallo')}
								>
									{React.createElement<React.ComponentProps<typeof IcUnknown>>(
										icons['cloudillo/ideallo'],
										{ className: 'me-1' }
									)}
									{t('Ideallo whiteboard document')}
								</button>
							</li>
							<li>
								<button
									className="c-nav-item"
									onClick={() => createFile('cloudillo/prezillo')}
								>
									{React.createElement<React.ComponentProps<typeof IcUnknown>>(
										icons['cloudillo/prezillo'],
										{ className: 'me-1' }
									)}
									{t('Prezillo presentation document')}
								</button>
							</li>
							<li>
								<button
									className="c-nav-item"
									onClick={() => createDb('cloudillo/taskillo')}
								>
									{React.createElement<React.ComponentProps<typeof IcUnknown>>(
										icons['cloudillo/taskillo'],
										{ className: 'me-1' }
									)}
									{t('Taskillo task list')}
								</button>
							</li>
							{/*
					<li><a className="c-nav-item" href="#" onClick={() => createFile('cloudillo/formillo')}>
						{React.createElement<React.ComponentProps<typeof IcUnknown>>(icons['cloudillo/formillo'], { className: 'me-1' })}
						<IcFormillo/>
						{t('Formillo document')}</a></li>
					*/}
						</ul>
					</Popper>
				</li>
			)}
			{!!auth && <hr className="w-100" />}

			<li className="c-nav-item">
				<Link className={'c-nav-link ' + (!qs.fileTp ? 'active' : '')} to="">
					<IcAll /> {t('All')}
					{!!fileStat.todo && (
						<span className="c-badge bg error">{fileStat.mutable}</span>
					)}
				</Link>
			</li>
			<li className="c-nav-item">
				<Link
					className={'c-nav-link ' + (qs.fileTp === 'CRDT,RTDB' ? 'active' : '')}
					to="?fileTp=CRDT,RTDB"
				>
					<IcMutable /> {t('Editable')}
					{!!fileStat.todo && (
						<span className="c-badge bg error">{fileStat.mutable}</span>
					)}
				</Link>
			</li>
			<li className="c-nav-item">
				<Link
					className={'c-nav-link ' + (qs.fileTp === 'BLOB' ? 'active' : '')}
					to="?fileTp=BLOB"
				>
					<IcImmutable /> {t('Finalized')}
					{!!fileStat.todo && <span className="c-badge bg error">{fileStat.todo}</span>}
				</Link>
			</li>
			<hr className="w-100" />

			<li className="c-nav-item">
				<Link className="c-nav-link" to="?filter=new">
					<IcUploaded /> {t('New uploads')}
					{!!fileStat.new && <span className="c-badge bg error">{fileStat.new}</span>}
				</Link>
			</li>

			<div className="c-input-group">
				<input type="text" className="c-input" placeholder="Search" />
				<button className="c-button secondary" type="button">
					<IcSearch />
				</button>
			</div>
		</ul>
	)
})

interface FileCardProps {
	className?: string
	file: File
	onClick?: (file: File) => void
	renameFileId?: string
	renameFileName?: string
	fileOps: FileOps
}
const FileCard = React.memo(function FileCard({
	className,
	file,
	onClick,
	renameFileId,
	renameFileName,
	fileOps
}: FileCardProps) {
	const [auth] = useAuth()
	const { t } = useTranslation()

	function setTags(tags?: string[]) {
		fileOps.setFile?.({ ...file, tags })
	}

	return (
		<div className={'c-panel ' + (className || '')} onClick={(evt) => onClick?.(file)}>
			<div className="c-panel-header d-flex">
				<h3 className="c-panel-title d-flex flex-fill">
					{React.createElement<React.ComponentProps<typeof IcUnknown>>(
						icons[file.contentType] || IcUnknown,
						{ className: 'me-1' }
					)}
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
				{/* file.ownerTag && <h4>{file.ownerTag}</h4> */}
				<div className="c-hbox g-2">
					{/* Access level icons - for testing, show both */}
					<button
						className="c-link p-1"
						type="button"
						title={t('View (read-only)')}
						onClick={(evt) => (
							evt.stopPropagation(), fileOps.openFile(file.fileId, 'read')
						)}
					>
						<IcMonitor />
					</button>
					{!!auth && (
						<button
							className="c-link p-1"
							type="button"
							title={t('Edit')}
							onClick={(evt) => (
								evt.stopPropagation(), fileOps.openFile(file.fileId, 'write')
							)}
						>
							<IcEdit />
						</button>
					)}
					{!!file.owner && <ProfilePicture profile={file.owner} small />}
					{!!auth && (
						<Popper className="c-link" label={<IcMore />}>
							<ul className="c-nav vertical">
								<li className="c-nav-item">
									<a
										className="c-link"
										href="#"
										onClick={() => fileOps.renameFile(file.fileId)}
									>
										<IcEdit /> {t('Rename...')}
									</a>
								</li>
								<li className="c-nav-item">
									<a
										className="c-link"
										href="#"
										onClick={() => fileOps.doDeleteFile(file.fileId)}
									>
										<IcDelete />
										{t('Delete...')}
									</a>
								</li>
							</ul>
						</Popper>
					)}
					{auth?.idTag && file.variantId && (
						<img src={`https://cl-o.${auth.idTag}/api/file/${file.variantId}`} />
					)}
				</div>
			</div>
			{!!file.tags?.length && (
				<div>
					<div>
						<TagsCell fileId={file.fileId} tags={file.tags} setTags={setTags} />
					</div>
				</div>
			)}
		</div>
	)
})

interface FileDetailsProps {
	className?: string
	file: File
	renameFileId?: string
	renameFileName?: string
	fileOps: FileOps
}
function FileDetails({ className, file, renameFileId, renameFileName, fileOps }: FileDetailsProps) {
	const { t } = useTranslation()
	const { api, setIdTag } = useApi()
	const [auth] = useAuth()
	const dialog = useDialog()
	const toast = useToast()
	const [fileActions, setFileActions] = React.useState<ActionView[] | undefined>()
	const [shareRefs, setShareRefs] = React.useState<Types.Ref[] | undefined>()
	const [newLinkAccess, setNewLinkAccess] = React.useState<'read' | 'write'>('read')

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

	React.useEffect(
		function loadFileDetails() {
			if (!api) return
			;(async function () {
				// Query actions of type FSHR that apply to this file as the subject
				const actions = await api.actions.list({ type: 'FSHR', subject: file.fileId })
				setFileActions(actions)

				// Load share refs for this file
				const refs = await api.refs.list({ type: 'share.file', resourceId: file.fileId })
				setShareRefs(refs)
			})()
		},
		[api, file.fileId]
	)

	// Permissions //
	/////////////////
	async function listProfiles(q: string) {
		if (!api) return []
		if (!q) return []
		const profiles = await api.profiles.list({ type: 'person', q })
		return profiles
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

		const res = await api.actions.create(action)
		let found = false
		setFileActions((fileActions) =>
			(fileActions || [])
				.map((fa) => (fa.audience?.idTag === profile.idTag ? ((found = true), res) : fa))
				.concat(found ? [] : [res])
		)
	}

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

		const _res = await api.actions.create(action)
		setFileActions((fa) => fa?.filter((fa) => fa.audience?.idTag !== idTag))
	}

	// Public Links //
	//////////////////
	async function createShareLink() {
		if (!file || !api) return

		const label = await dialog.askText(
			t('Create share link'),
			t('Enter a label for this share link'),
			{ placeholder: t('e.g. For review, Public access, etc.') }
		)
		if (label === undefined) return // Cancelled

		try {
			const ref = await api.refs.create({
				type: 'share.file',
				resourceId: file.fileId,
				accessLevel: newLinkAccess,
				description: label || file.fileName,
				count: null // Unlimited uses for share links
			})
			setShareRefs((refs) => [...(refs || []), ref])
			toast.success(t('Share link created'))
		} catch (err) {
			console.error('Failed to create share link', err)
			toast.error(t('Failed to create share link'))
		}
	}

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
			<div className="c-panel mid">
				<div className="c-panel-header d-flex">
					<h3 className="c-panel-title d-flex flex-fill">
						{React.createElement<React.ComponentProps<typeof IcUnknown>>(
							icons[file.contentType] || IcUnknown,
							{ className: 'me-1' }
						)}
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
						<button
							className="c-link p-1"
							type="button"
							onClick={() => fileOps.openFile(file.fileId)}
						>
							<IcEdit />
						</button>
						<Popper className="c-link" icon={<IcMore />}>
							<ul className="c-nav">
								<li className="c-nav-item">
									<a href="#" onClick={() => fileOps.renameFile(file.fileId)}>
										{t('Rename...')}
									</a>
								</li>
							</ul>
						</Popper>
						{/*
					<details className="c-dropdown">
						<summary className="c-link p-1"><IcMore/></summary>
						<ul className="c-nav">
							<li className="c-nav-item"><a href="#" onClick={() => fileOps.renameFile(file.fileId)}>{t('Rename...')}</a></li>
						</ul>
					</details>
					*/}
						{auth?.idTag && file.variantId && (
							<img src={`https://cl-o.${auth.idTag}/api/file/${file.variantId}`} />
						)}
					</div>
				</div>
				<div className="c-tag-list">
					<TagsCell fileId={file.fileId} tags={file.tags} editable />
				</div>
			</div>

			{file.owner?.idTag == auth?.idTag && (
				<div className="c-panel mid">
					<div className="c-panel-header d-flex">
						<h3>{t('Permissions')}</h3>
					</div>
					<div>
						{!!writePerms && (
							<>
								<h4 className="py-2">{t('Write permissions')}</h4>
								<EditProfileList
									className="my-2"
									placeholder={t('Add profile')}
									profiles={
										writePerms
											.filter((rp) => rp.audience)
											.map((rp) => rp.audience) as Profile[]
									}
									listProfiles={listProfiles}
									addProfile={(p) => addPerm(p, 'WRITE')}
									removeProfile={removePerm}
								/>
							</>
						)}
						{!!readPerms && (
							<>
								<h4 className="py-2">{t('Read only permissions')}</h4>
								<EditProfileList
									className="my-2"
									placeholder={t('Add profile')}
									profiles={
										readPerms
											.filter((rp) => rp.audience)
											.map((rp) => rp.audience) as Profile[]
									}
									listProfiles={listProfiles}
									addProfile={(p) => addPerm(p, 'READ')}
									removeProfile={removePerm}
								/>
							</>
						)}

						<hr className="my-3" />

						<h4 className="py-2 d-flex align-items-center">
							<IcLink className="me-2" />
							{t('Public Link')}
						</h4>
						<div className="c-hbox g-2 mb-3">
							<select
								className="c-input"
								value={newLinkAccess}
								onChange={(e) =>
									setNewLinkAccess(e.target.value as 'read' | 'write')
								}
							>
								<option value="read">{t('Read only')}</option>
								<option value="write">{t('Can edit')}</option>
							</select>
							<button
								className="c-button primary"
								type="button"
								onClick={createShareLink}
							>
								<IcPlus className="me-1" />
								{t('Create Link')}
							</button>
						</div>

						{shareRefs && shareRefs.length > 0 && (
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
												{ref.expiresAt &&
													` · ${t('Expires')} ${dayjs(ref.expiresAt).format('YYYY-MM-DD')}`}
											</div>
										</div>
										<a
											className="c-link"
											title={t('Copy link')}
											onClick={() => copyShareLink(ref.refId)}
										>
											<IcCopy />
										</a>
										<a
											className="c-link"
											title={t('Delete link')}
											onClick={() => deleteShareLink(ref.refId)}
										>
											<IcTrash />
										</a>
									</div>
								))}
							</div>
						)}
					</div>
				</div>
			)}
		</div>
	)
}

export function FilesApp() {
	const navigate = useNavigate()
	const location = useLocation()
	const { t } = useTranslation()
	const [appConfig] = useAppConfig()
	const { api, setIdTag } = useApi()
	const [auth] = useAuth()
	const contextIdTag = useCurrentContextIdTag()
	const dialog = useDialog()
	//const [files, setFiles] = React.useState<File[] | undefined>()
	const [columnConfig, setColumnConfig] = React.useState(fileColumnConfig)
	const fileListData = useFileListData()
	const [selectedFile, setSelectedFile] = React.useState<File | undefined>()
	// rename
	const [renameFileId, setRenameFileId] = React.useState<string | undefined>()
	const [renameFileName, setRenameFileName] = React.useState<string | undefined>()
	const [showFilter, setShowFilter] = React.useState<boolean>(false)

	React.useEffect(
		function onLocationEffect() {
			setShowFilter(false)
		},
		[location]
	)

	function selectFile(file?: File) {
		setSelectedFile(file)
	}

	const onClickFile = React.useCallback(function onClickFile(file: File) {
		setSelectedFile((selectedFile) => (selectedFile === file ? undefined : file))
	}, [])

	const fileOps = React.useMemo(
		() => ({
			setFile: function setFile(file: File) {
				fileListData.setFileData(file.fileId, file)
			},

			openFile: function openFile(fileId?: string, access?: 'read' | 'write') {
				const file = fileListData.getData()?.find((f) => f.fileId === fileId)
				const app = file && appConfig?.mime[file?.contentType]

				if (app) {
					// Extract app name from path like '/app/quillo' -> 'quillo'
					const appName = app.split('/').pop()
					const basePath = `/app/${contextIdTag || auth?.idTag}/${appName}/${(file.owner?.idTag || auth?.idTag) + ':'}${file.fileId}`
					navigate(access === 'read' ? `${basePath}?access=read` : basePath)
				}
			},

			renameFile: function renameFile(fileId?: string) {
				const file = fileListData.getData()?.find((f) => f.fileId === fileId)
				setRenameFileId(fileId)
				setRenameFileName(file?.fileName || '')
			},

			setRenameFileName,

			doRenameFile: async function doRenameFile(fileId: string, fileName: string) {
				if (!api) return
				await api.files.update(fileId, { fileName })
				setRenameFileId(undefined)
				setRenameFileName(undefined)
				fileListData.refresh()
			},

			doDeleteFile: async function doDeleteFile(fileId: string) {
				if (!api) return
				const res = await dialog.confirm(
					t('Delete document'),
					t('Are you sure you want to delete this document')
				)
				if (!res) return

				await api.files.delete(fileId)
				fileListData.refresh()
			}
		}),
		[auth, api, appConfig, contextIdTag, navigate, t, fileListData, dialog]
	)

	if (!fileListData.getData())
		return (
			<div className="d-flex align-items-center justify-content-center h-100">
				<LoadingSpinner size="lg" label={t('Loading files...')} />
			</div>
		)

	return (
		<Fcd.Container className="g-1">
			<Fcd.Filter isVisible={showFilter} hide={() => setShowFilter(false)}>
				<FilterBar contextIdTag={contextIdTag} />
			</Fcd.Filter>
			<Fcd.Content
				header={
					<div className="c-nav c-hbox md-hide lg-hide">
						<IcFilter onClick={() => setShowFilter(true)} />
						<div className="c-tag-list">
							{fileListData.filter?.fileTp == 'CRDT' && (
								<div className="c-tag">{t('draft document')}</div>
							)}
							{fileListData.filter?.fileTp == 'RTDB' && (
								<div className="c-tag">{t('database')}</div>
							)}
							{fileListData.filter?.fileTp == 'BLOB' && (
								<div className="c-tag">{t('finalized')}</div>
							)}
						</div>
					</div>
				}
			>
				{fileListData.getData().length === 0 ? (
					<EmptyState
						icon={<IcAll style={{ fontSize: '2.5rem' }} />}
						title={t('No files found')}
						description={t('Create a new document or upload files to get started')}
					/>
				) : (
					fileListData
						.getData()
						.map((file) => (
							<FileCard
								key={file.fileId}
								className={mergeClasses(
									'mb-1',
									selectedFile?.fileId === file.fileId && 'accent'
								)}
								file={file}
								onClick={onClickFile}
								renameFileId={renameFileId}
								renameFileName={renameFileName}
								fileOps={fileOps}
							/>
						))
				)}
			</Fcd.Content>
			<Fcd.Details isVisible={!!selectedFile} hide={() => setSelectedFile(undefined)}>
				{selectedFile && (
					<FileDetails
						file={selectedFile}
						renameFileId={renameFileId}
						renameFileName={renameFileName}
						fileOps={fileOps}
					/>
				)}
			</Fcd.Details>
		</Fcd.Container>
	)
}

// vim: ts=4
