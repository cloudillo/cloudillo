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
	FiFile as IcUnknown,
} from 'react-icons/fi'

import {
	LuFilter as IcFilter,

	LuFilePlus2 as IcNewFile,
	LuCloud as IcAll,
	LuFilePen as IcMutable,
	LuFile as IcImmutable,

	LuBookOpen as IcQuillo,
	LuSheet as IcSheello,
	LuShapes as IcIdeallo,
	LuPresentation as IcPrello,
	LuListTodo as IcFormillo
} from 'react-icons/lu'

import * as T from '@symbion/runtype'
import { Columns, ColumnConfig, DataTable, TableDataProvider } from '@symbion/ui-core'
import '@symbion/ui-core/datatable.css'
import '@symbion/ui-core/scroll.css'

import { NewAction, tActionView, ActionView, Profile } from '@cloudillo/types'
import { useApi, useAuth, useDialog, Button, Fcb, ProfilePicture, EditProfileList, Popper, Dialog, mergeClasses } from '@cloudillo/react'

import { useAppConfig, parseQS, qs } from '../utils.js'
import { Tags, EditTags } from '../tags.js'

const icons: Record<string, React.ComponentType> = {
//const icons: Record<string, (props: React.SVGProps<SVGSVGElement>) => React.ReactNode> = {
	'image/jpeg': (props) => <IcImage {...props} style={{ color: 'lch(50 50 0)' }}/>,
	'image/png': (props) => <IcImage {...props} style={{ color: 'lch(50 50 0)' }}/>,
	'video/mp4': (props) => <IcVideo {...props} style={{ color: 'lch(50 50 0)' }}/>,
	'application/pdf': (props) => <IcDocument {...props} style={{ color: 'lch(50 50 0)' }}/>,
	'cloudillo/quillo': (props) => <IcQuillo {...props} style={{ color: 'lch(50 50 250)' }}/>,
	'cloudillo/sheello': (props) => <IcSheello {...props} style={{ color: 'lch(50 50 150)' }}/>,
	'cloudillo/ideallo': (props) => <IcIdeallo {...props} style={{ color: 'lch(50 50 60)' }}/>,
	'cloudillo/prello': (props) => <IcPrello {...props} style={{ color: 'lch(50 50 100)' }}/>,
	'cloudillo/formillo': (props) => <IcFormillo {...props} style={{ color: 'lch(50 50 300)' }}/>
}

interface File {
	fileId: string
	fileName: string
	owner?: {
		idTag: string
		name: string
		profilePic?: string
	}
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
	openFile: (fileId: string) => void
	renameFile: (fileId?: string) => void
	setRenameFileName: (name?: string) => void
	doRenameFile: (fileId: string, fileName: string) => void
	doDeleteFile: (fileId: string) => void
}

function TagsCell({ fileId, tags, setTags, editable }: { fileId: string, tags: string[] | undefined, setTags?: (tags: string[] | undefined) => void, editable?: boolean }) {
	const api = useApi()
	const [isEditing, setIsEditing] = React.useState(false)

	async function listTags(prefix: string) {
		if (!api) return

		const res = await api.get<{ tags: { tag: string, privilaged?: boolean }[] }>('', '/tag', {
			query: { prefix }
		})
		console.log('TAGS', res)
		return res.tags
	}

	async function addTag(tag: string) {
		if (!api) return

		console.log('ADD TAG', tag)
		const { tags } = await api.put<{ tags: string[] }>('', `/store/${fileId}/tag/${tag}`, {})
		console.log('NEW TAGS', tags)
		if (tags) setTags?.(tags)
		//setTags?.(tags?.concat(tag))
	}

	async function removeTag(tag: string) {
		if (!api) return

		console.log('REMOVE TAG', tag)
		const { tags } = await api.delete<{ tags: string[] }>('', `/store/${fileId}/tag/${tag}`)
		console.log('NEW TAGS', tags)
		if (tags) setTags?.(tags)
		//setTags?.(tags?.filter(t => t !== tag))
	}

	if (isEditing) {
		return <EditTags tags={tags} listTags={listTags} addTag={addTag} removeTag={removeTag}/>
	} else {
		return <div className="c-tag-list g-1">
			<Tags tags={tags}/>
			{ !!editable && <Button link onClick={() => setIsEditing(true)}><IcEdit/></Button> }
		</div>
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
			format: (v, r) => r.fileId === renameFileId ? (<form onSubmit={evt => (evt.preventDefault(), renameFileName && fileOps.doRenameFile(r.fileId, renameFileName))} className="input-group w-100">
				<input className="c-input" type="text" autoFocus value={renameFileName} onChange={e => fileOps.setRenameFileName(e.target.value)}/>
					<button className="c-button primary" type="submit"><IcSave/></button>
					<button className="c-button secondary" type="button" onClick={() => fileOps.renameFile()}
					><IcCancel/></button>
			</form>) : v
		},
		contentType: {
			title: t(''),
			defaultWidth: 3,
			format: v => React.createElement(icons[v] || IcUnknown)
		},
		createdAt: {
			title: t('Created at'),
			defaultWidth: 20,
			sort: true,
			format: v => dayjs(v).format('YYYY-MM-DD HH:mm')
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
			format: (v, r) => <TagsCell fileId={r.fileId} tags={r.tags}/>
			//format: (v, r) => <EditTags tags={r.tags} listTags={listTags}/>
		},
		actions: {
			title: '',
			defaultWidth: 10,
			format: (v, r) => <div className="d-flex">
				<button className="c-link p-1" type="button" onClick={() => fileOps.openFile(r.fileId)}><IcEdit/></button>
				<div className="dropdown">
					<details className="c-dropdown">
						<summary className="c-link p-1"><IcMore/></summary>
						<ul className="c-nav">
							<li className="c-nav-item"><a href="#" onClick={() => fileOps.renameFile(r.fileId)}>{t('Rename...')}</a></li>
						</ul>
					</details>
				</div>
			</div>
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
	const api = useApi()
	const [auth] = useAuth()
	const location = useLocation()
	const [sort, setSort] = React.useState<keyof File | undefined>()
	const [sortAsc, setSortAsc] = React.useState(false)
	const [page, setPage] = React.useState(0)
	const [refreshHelper, setRefreshHelper] = React.useState(false)
	const [filter, setFilter] = React.useState<Record<string, string> | undefined>()
	const [files, setFiles] = React.useState<File[] | undefined>()
	//console.log('DT state', sort, sortAsc, page)

	React.useEffect(function loadFileList() {
		if (!api || !auth) return

		(async function () {
			const qs = parseQS(location.search)
			setFilter(qs)

			if (Object.keys(qs).length > 0 -1) {
				const res = await api.get<{ files: File[] }>('', '/store', { query: { variant: 'tn', ...qs }})
				setFiles(res.files)
			} else {
				setFiles([])
			}
		})()
	}, [api, auth, location.search, refreshHelper])

	return React.useMemo(function () {
		function getData() {
			return files || []
		}

		function setState(sort: keyof File | undefined, sortAsc: boolean | undefined, page: number | undefined) {
			console.log('FL setState', sort, sortAsc, page)
			if (sort !== undefined) setSort(sort)
			if (sortAsc !== undefined) setSortAsc(sortAsc)
			if (page !== undefined) setPage(page)
		}

		function setFileData(fileId: string, file: File) {
			setFiles(files => files?.map(f => f.fileId === fileId ? file : f))
		}

		async function next() {
			if (!page) setPage(page + 1)
		}

		async function prev() {
			if (page) setPage(page - 1)
		}

		function refresh() {
			setRefreshHelper(r => !r)
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
	}, [files, filter, sort, sortAsc, page])
}

const FilterBar = React.memo(function FilterBar({ className }: { className?: string }) {
	const { t } = useTranslation()
	const api = useApi()
	const location = useLocation()
	const navigate = useNavigate()
	const dialog = useDialog()
	const fileStat = { mutable: 0, immutable: 0, todo: 0, new: 0, delegated: 0, monitored: 0 }

	const qs = parseQS(location.search)

	async function createFile(contentType: string) {
		console.log('createFile', contentType)
		if (!contentType) return

		const fileName = await dialog.askText(t('Create document'), t('Provide a name for the new document'), {
			placeholder: t('Untitled document')
		})
		console.log('CONFIRM', fileName)
		if (fileName === undefined) return

		const res = await api.post<File>('', '/store', {
			data: { contentType, fileName: fileName || t('Untitled document') }
		})
		console.log('CREATE FILE', res)
		if (res?.fileId) {
			switch (contentType) {
				case 'cloudillo/quillo':
					navigate(`/app/quillo/${res.fileId}`)
					break
				case 'cloudillo/sheello':
					navigate(`/app/sheello/${res.fileId}`)
					break
				case 'cloudillo/ideallo':
					navigate(`/app/ideallo/${res.fileId}`)
					break
				case 'cloudillo/prello':
					navigate(`/app/prello/${res.fileId}`)
					break
				case 'cloudillo/formillo':
					navigate(`/app/formillo/${res.fileId}`)
					break
			}
		}
	}

	return <ul className={mergeClasses('c-nav vertical low', className)}>
		<li className="c-nav-item">
			{/*
			<details className="c-dropdown">
			*/}
			<Popper icon={<IcNewFile/>} label={t('Create document')}>
				<ul className="c-nav vertical emph">
					<li><button className="c-nav-item" onClick={() => createFile('cloudillo/quillo')}>
						{React.createElement<React.ComponentProps<typeof IcUnknown>>(icons['cloudillo/quillo'], { className: 'me-1' })}
						{t('Quillo text document')}</button></li>
					<li><a className="c-nav-item" href="#" onClick={() => createFile('cloudillo/sheello')}>
						{React.createElement<React.ComponentProps<typeof IcUnknown>>(icons['cloudillo/sheello'], { className: 'me-1' })}
						{t('Sheello spreadsheet document')}</a></li>
					<li><button className="c-nav-item" disabled={true || process.env.NODE_ENV === 'production'} onClick={() => createFile('cloudillo/ideallo')}>
						{React.createElement<React.ComponentProps<typeof IcUnknown>>(icons['cloudillo/ideallo'], { className: 'me-1' })}
						{t('Ideallo whiteboard document')}</button></li>
					<li><button className="c-nav-item" disabled={process.env.NODE_ENV === 'production'} onClick={() => createFile('cloudillo/prello')}>
						{React.createElement<React.ComponentProps<typeof IcUnknown>>(icons['cloudillo/prello'], { className: 'me-1' })}
						{t('Prello presentation document')}</button></li>
					{/*
					<li><a className="c-nav-item" href="#" onClick={() => createFile('cloudillo/formillo')}>
						{React.createElement<React.ComponentProps<typeof IcUnknown>>(icons['cloudillo/formillo'], { className: 'me-1' })}
						<IcFormillo/>
						{t('Formillo document')}</a></li>
					*/}
				</ul>
			</Popper>
		</li>
		<hr className="w-100"/>

		<li className="c-nav-item">
			<Link className={'c-nav-link ' + (!qs.filter ? 'active' : '')} to=""><IcAll/> {t('All')}
				{!!fileStat.todo && <span className="c-badge bg error">{fileStat.mutable}</span>}
			</Link>
		</li>
		<li className="c-nav-item">
			<Link className={'c-nav-link ' + (qs.filter === 'mut' ? 'active' : '')} to="?filter=mut"><IcMutable/> {t('Editable')}
				{!!fileStat.todo && <span className="c-badge bg error">{fileStat.mutable}</span>}
			</Link>
		</li>
		<li className="c-nav-item">
			<Link className={'c-nav-link ' + (qs.filter === 'imm' ? 'active' : '')} to="?filter=imm"><IcImmutable/> {t('Finalized')}
				{!!fileStat.todo && <span className="c-badge bg error">{fileStat.todo}</span>}
			</Link>
		</li>
		<hr className="w-100"/>

		<li className="c-nav-item">
			<Link className="c-nav-link" to="?filter=new"><IcUploaded/> {t('New uploads')}
				{!!fileStat.new && <span className="c-badge bg error">{fileStat.new}</span>}
			</Link>
		</li>

		<div className="c-input-group">
			<input type="text" className="c-input" placeholder="Search" />
			<button className="c-button secondary" type="button"><IcSearch/></button>
		</div>
	</ul>
})

interface FileCardProps {
	className?: string
	file: File
	onClick?: (file: File) => void
	renameFileId?: string
	renameFileName?: string
	fileOps: FileOps
}
const FileCard = React.memo(
function FileCard({ className, file, onClick, renameFileId, renameFileName, fileOps }: FileCardProps) {
	const [auth] = useAuth()
	const { t } = useTranslation()

	function setTags(tags?: string[]) {
		fileOps.setFile?.({ ...file, tags })
	}

	//return <div className={'c-panel ' + (className || '')} onClick={onClick}>
	return <div className={'c-panel ' + (className || '')} onClick={evt => (console.log('CLICK', evt), onClick?.(file))}>
		<div className="c-panel-header d-flex">
			<h3 className="c-panel-title d-flex flex-fill">
				{React.createElement<React.ComponentProps<typeof IcUnknown>>(icons[file.contentType] || IcUnknown, { className: 'me-1' })}
				{ renameFileName !== undefined && file.fileId === renameFileId ? <form onSubmit={evt => (evt.preventDefault(), renameFileName && fileOps.doRenameFile(file.fileId, renameFileName))} className="c-input-group">
					<input className="c-input" type="text" autoFocus value={renameFileName} onChange={e => fileOps.setRenameFileName(e.target.value)}/>
						<button className="c-button primary p-1" type="submit"><IcSave/></button>
						<button className="c-button secondary p-1" type="button" onClick={() => fileOps.setRenameFileName(undefined)}
						><IcCancel/></button>
				</form>
				: file.fileName}
			</h3>
			{/* file.ownerTag && <h4>{file.ownerTag}</h4> */}
			<div className="c-hbox g-2">
				{ !!file.owner && <ProfilePicture profile={file.owner} small/> }
				<button className="c-link p-1" type="button" onClick={() => fileOps.openFile(file.fileId)}><IcEdit/></button>
				<Popper className="c-link" label={<IcMore/>}>
					<ul className="c-nav vertical">
						<li className="c-nav-item"><a className="c-link" href="#" onClick={() => fileOps.renameFile(file.fileId)}><IcEdit/> {t('Rename...')}</a></li>
						<li className="c-nav-item"><a className="c-link" href="#" onClick={() => fileOps.doDeleteFile(file.fileId)}><IcDelete/>{t('Delete...')}</a></li>
					</ul>
				</Popper>
				{ auth?.idTag && file.variantId && <img src={`https://cl-o.${auth.idTag}/api/store/${file.variantId}`}/> }
			</div>
		</div>
		{ !!file.tags?.length && <div>
			<div><TagsCell fileId={file.fileId} tags={file.tags} setTags={setTags}/></div>
		</div> }
	</div>
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
	const api = useApi()
	const [auth] = useAuth()
	const dialog = useDialog()
	const [fileActions, setFileActions] = React.useState<ActionView[] | undefined>()

	const readPerms = React.useMemo(function readPerms() {
		return fileActions?.filter(a => a.type === 'FSHR' && a.subType === 'READ')
			.sort((a, b) => a.audience?.idTag.localeCompare(b.audience?.idTag ?? '') || 0)
	}, [fileActions])
	const writePerms = React.useMemo(function writePerms() {
		return fileActions?.filter(a => a.type === 'FSHR' && a.subType === 'WRITE')
			.sort((a, b) => a.audience?.idTag.localeCompare(b.audience?.idTag ?? '') || 0)
	}, [fileActions])
	console.log({ readPerms, writePerms })

	React.useEffect(function loadFileDetails() {
		(async function () {
			const res = await api.get(file.owner?.idTag || '', `/action?types=FSHR&subject=${file.fileId}`, { type: T.struct({ actions: T.array(tActionView) }) })
			console.log('loadFileDetails res', res)
			setFileActions(res.actions)
		})()
	}, [file])

	// Permissions //
	/////////////////
	async function listProfiles(q: string) {
		const res = !q ? { profiles: [] } : await api.get<{ profiles: Profile[] }>('', '/profile', {
			query: { type: 'person', q }
		})
		return res.profiles
	}

	async function addPerm(profile: Profile, perm: 'WRITE' | 'READ') {
		if (!file) return

		const action: NewAction = {
			type: 'FSHR',
			subType: perm,
			subject: file.fileId,
			content: {
				fileName: file.fileName,
				contentType: file.contentType
			},
			audienceTag: profile.idTag
		}

		const res = await api.post('', '/action', { data: action, type: tActionView })
		console.log('FSHR res', res)
		let found = false
		setFileActions(fileActions => (fileActions || []).map(fa => fa.audience?.idTag === profile.idTag ? (found = true, res) : fa).concat(found ? [] : [res]))
		//setPermissionList(pl => (pl || []).find(p => p.idTag === profile.idTag) ? pl : [...(pl || []), profile])
	}

	async function removePerm(idTag: string) {
		if (!file) return
		if (!await dialog.confirm(t('Confirmation'), t("Are you sure you want to remove this user's permission?"))) return

		const action: NewAction = {
			type: 'FSHR',
			subject: file.fileId,
			audienceTag: idTag
		}

		const res = await api.post('', '/action', { data: action, type: tActionView })
		setFileActions(fa => fa?.filter(fa => fa.audience?.idTag !== idTag))
		//setPermissionList(permissionList?.filter(p => p.idTag !== idTag))
	}

	return <div className="c-vbox g-2">
		<div className="c-panel mid">
			<div className="c-panel-header d-flex">
				<h3 className="c-panel-title d-flex flex-fill">
					{React.createElement<React.ComponentProps<typeof IcUnknown>>(icons[file.contentType] || IcUnknown, { className: 'me-1' })}
					{ renameFileName !== undefined && file.fileId === renameFileId ? <form onSubmit={evt => (evt.preventDefault(), renameFileName && fileOps.doRenameFile(file.fileId, renameFileName))} className="c-input-group">
						<input className="c-input" type="text" autoFocus value={renameFileName} onChange={e => fileOps.setRenameFileName(e.target.value)}/>
							<button className="c-button primary p-1" type="submit"><IcSave/></button>
							<button className="c-button secondary p-1" type="button" onClick={() => fileOps.setRenameFileName(undefined)}
							><IcCancel/></button>
					</form>
					: file.fileName}
				</h3>
				<div className="c-hbox justify-content-end g-2 me-4">
					<button className="c-link p-1" type="button" onClick={() => fileOps.openFile(file.fileId)}><IcEdit/></button>
					<Popper className='c-link' icon={<IcMore/>}>
						<ul className="c-nav">
							<li className="c-nav-item"><a href="#" onClick={() => fileOps.renameFile(file.fileId)}>{t('Rename...')}</a></li>
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
					{ auth?.idTag && file.variantId && <img src={`https://cl-o.${auth.idTag}/api/store/${file.variantId}`}/> }
				</div>
			</div>
			<div className="c-tag-list">
				<TagsCell fileId={file.fileId} tags={file.tags} editable/>
			</div>
		</div>

		{ file.owner?.idTag == auth?.idTag && <div className="c-panel mid">
			<div className="c-panel-header d-flex">
				<h3>{t('Permissions')}</h3>
			</div>
			<div>
				{ !!writePerms && <>
					<h4 className="py-2">{t('Write permissions')}</h4>
					<EditProfileList className="my-2" placeholder={t('Add profile')} profiles={writePerms.filter(rp => rp.audience).map(rp => rp.audience) as Profile[]} listProfiles={listProfiles} addProfile={p => addPerm(p, 'WRITE')} removeProfile={removePerm}/>
				</> }
				{/* FIXME: Read only permissions not supported yet
				{ !!readPerms && <>
					<h4 className="py-2">{t('Read only permissions')}</h4>
					<EditProfileList className="my-2" placeholder={t('Add profile')} profiles={readPerms.filter(rp => rp.audience).map(rp => rp.audience) as Profile[]} listProfiles={listProfiles} addProfile={p => addPerm(p, 'READ')} removeProfile={removePerm}/>
				</> }
				*/}
			</div>
		</div> }
	</div>
}

export function FilesApp() {
	const navigate = useNavigate()
	const location = useLocation()
	const { t } = useTranslation()
	const [appConfig] = useAppConfig()
	const api = useApi()
	const [auth] = useAuth()
	const dialog = useDialog()
	//const [files, setFiles] = React.useState<File[] | undefined>()
	const [columnConfig, setColumnConfig] = React.useState(fileColumnConfig)
	const fileListData = useFileListData()
	const [selectedFile, setSelectedFile] = React.useState<File | undefined>()
	// rename
	const [renameFileId, setRenameFileId] = React.useState<string | undefined>()
	const [renameFileName, setRenameFileName] = React.useState<string | undefined>()
	const [showFilter, setShowFilter] = React.useState<boolean>(false)

	React.useEffect(function onLocationEffect() {
		setShowFilter(false)
	}, [location])

	function selectFile(file?: File) {
		setSelectedFile(file)
	}

	const onClickFile = React.useCallback(function onClickFile(file: File) {
		setSelectedFile(selectedFile => selectedFile === file ? undefined : file)
	}, [])

	const fileOps = React.useMemo(() => ({
		setFile: function setFile(file: File) {
			fileListData.setFileData(file.fileId, file)
		},

		openFile: function openFile(fileId?: string) {
			const file = fileListData.getData()?.find(f => f.fileId === fileId)
			const app = file && appConfig?.mime[file?.contentType]

			console.log('openFile', appConfig, file?.contentType, app)
			if (app) {
				navigate(`${app}/${(file.owner?.idTag || auth?.idTag) + ':' }${file.fileId}`)
			}
		},

		renameFile: function renameFile(fileId?: string) {
			const file = fileListData.getData()?.find(f => f.fileId === fileId)
			console.log('rename file', file)
			setRenameFileId(fileId)
			setRenameFileName(file?.fileName || '')
		},

		setRenameFileName,

		doRenameFile: async function doRenameFile(fileId: string, fileName: string) {
			if (!api) return
			const file = fileListData.getData()?.find(f => f.fileId === fileId)
			await api.patch('', `/store/${fileId}`, {
				data: { fileName }
			})
			setRenameFileId(undefined)
			setRenameFileName(undefined)
			fileListData.refresh()
		},

		doDeleteFile: async function doDeleteFile(fileId: string) {
			if (!api) return
			const res = await dialog.confirm(t('Delete document'), t('Are you sure you want to delete this document'))
			if (!res) return

			await api.delete('', `/store/${fileId}`)
			fileListData.refresh()
		}
	}), [auth, api, appConfig, t, fileListData])

	if (!fileListData.getData()) return <h1>Loading...</h1>

	return <Fcb.Container className="g-1">
		<Fcb.Filter isVisible={showFilter} hide={() => setShowFilter(false)}>
			<FilterBar/>
		</Fcb.Filter>
		<Fcb.Content header={
			<div className="c-nav c-hbox md-hide lg-hide">
				<IcFilter onClick={() => setShowFilter(true)}/>
				<div className="c-tag-list">
					{ fileListData.filter?.filter == 'mut' && <div className="c-tag">{t('editable')}</div> }
					{ fileListData.filter?.filter == 'imm' && <div className="c-tag">{t('finalized')}</div> }
				</div>
			</div>}
		>
			{ fileListData.getData().map(file => <FileCard
				key={file.fileId}
				className={mergeClasses('mb-1', selectedFile?.fileId === file.fileId && 'accent')}
				file={file}
				onClick={onClickFile}
				renameFileId={renameFileId}
				renameFileName={renameFileName}
				fileOps={fileOps}
			/>) }
		</Fcb.Content>
		<Fcb.Details isVisible={!!selectedFile} hide={() => setSelectedFile(undefined)}>
			{ selectedFile && <FileDetails
				file={selectedFile}
				renameFileId={renameFileId}
				renameFileName={renameFileName}
				fileOps={fileOps}
			/> }
		</Fcb.Details>
	</Fcb.Container>
}

// vim: ts=4
