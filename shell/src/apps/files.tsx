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
	LuPresentation as IcPrello,
	LuListTodo as IcFormillo
} from 'react-icons/lu'

import { Columns, ColumnConfig, DataTable, TableDataProvider } from '@symbion/ui-core'
import '@symbion/ui-core/datatable.css'
import '@symbion/ui-core/scroll.css'

import { NewAction, Profile } from '@cloudillo/types'
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
	openFile: (fileId: string) => void
	renameFile: (fileId?: string) => void
	renameFileId?: string
	renameFileName?: string
	setRenameFileName: (name?: string) => void
	doRenameFile: (fileId: string, fileName: string) => void
}
function fileColumns({ t, openFile, renameFile, renameFileId, renameFileName, setRenameFileName, doRenameFile }: FileColumnsArgs) {
	const fileColumns: Columns<File, FileView> = {
		fileName: {
			title: t('Name'),
			defaultWidth: 50,
			sort: true,
			format: (v, r) => r.fileId === renameFileId ? (<form onSubmit={evt => (evt.preventDefault(), renameFileName && doRenameFile(r.fileId, renameFileName))} className="input-group w-100">
				<input className="c-input" type="text" autoFocus value={renameFileName} onChange={e => setRenameFileName(e.target.value)}/>
					<button className="c-button primary" type="submit"><IcSave/></button>
					<button className="c-button secondary" type="button" onClick={() => renameFile()}
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
				<button className="c-link p-1" type="button" onClick={() => openFile(r.fileId)}><IcEdit/></button>
				<div className="dropdown">
					<details className="c-dropdown">
						<summary className="c-link p-1"><IcMore/></summary>
						<ul className="c-nav">
							<li className="c-nav-item"><a href="#" onClick={() => renameFile(r.fileId)}>{t('Rename...')}</a></li>
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

	return { getData, setFileData, filter, state: { sort, sortAsc }, setState, /* page, lastPage: 1, next, prev, */refresh }
}

function FilterBar({ className }: { className?: string }) {
	const { t } = useTranslation()
	const api = useApi()
	const location = useLocation()
	const navigate = useNavigate()
	const dialog = useDialog()
	const [dialogOpen, setDialogOpen] = React.useState(false)
	const docStat = { mutable: 0, immutable: 0, todo: 0, new: 0, delegated: 0, monitored: 0 }

	const qs = parseQS(location.search)

	async function createFile(contentType: string) {
		console.log('createFile', contentType)
		if (!contentType) return

		const fileName = await dialog.askText(t('Create document'), t('Provide a name for the new document'), {
			placeholder: t('Untitled document')
		}) || t('Untitled document')
		console.log('CONFIRM', fileName)

		const res = await api.post<File>('', '/store', {
			data: { contentType, fileName }
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
					<li><a className="c-nav-item" href="#" onClick={() => createFile('cloudillo/quillo')}>
						{React.createElement<React.ComponentProps<typeof IcUnknown>>(icons['cloudillo/quillo'], { className: 'me-1' })}
						{t('Quillo text document')}</a></li>
					<li><a className="c-nav-item" href="#" onClick={() => createFile('cloudillo/sheello')}>
						{React.createElement<React.ComponentProps<typeof IcUnknown>>(icons['cloudillo/sheello'], { className: 'me-1' })}
						{t('Sheello spreadsheet document')}</a></li>
					<li><a className="c-nav-item" href="#" onClick={() => createFile('cloudillo/prello')}>
						{React.createElement<React.ComponentProps<typeof IcUnknown>>(icons['cloudillo/prello'], { className: 'me-1' })}
						{t('Prello presentation document')}</a></li>
					{/*
					<li><a className="c-nav-item" href="#" onClick={() => createFile('cloudillo/formillo')}>
						{React.createElement<React.ComponentProps<typeof IcUnknown>>(icons['cloudillo/formillo'], { className: 'me-1' })}
						<IcFormillo/>
						{t('Formillo document')}</a></li>
					*/}
				</ul>
			</Popper>
			<Dialog open={dialogOpen}>
				<div className="c-panel">
					<p>Test</p>
					<Button onClick={() => setDialogOpen(false)}>Close</Button>
				</div>
			</Dialog>
		</li>
		<hr className="w-100"/>

		<li className="c-nav-item">
			<Link className={'c-nav-link ' + (!qs.filter ? 'active' : '')} to=""><IcAll/> {t('All')}
				{!!docStat.todo && <span className="badge rounded-pill bg-danger">{docStat.mutable}</span>}
			</Link>
		</li>
		<li className="c-nav-item">
			<Link className={'c-nav-link ' + (qs.filter === 'mut' ? 'active' : '')} to="?filter=mut"><IcMutable/> {t('Mutable')}
				{!!docStat.todo && <span className="badge rounded-pill bg-danger">{docStat.mutable}</span>}
			</Link>
		</li>
		<li className="c-nav-item">
			<Link className={'c-nav-link ' + (qs.filter === 'imm' ? 'active' : '')} to="?filter=imm"><IcImmutable/> {t('Immutable')}
				{!!docStat.todo && <span className="badge rounded-pill bg-danger">{docStat.todo}</span>}
			</Link>
		</li>
		<hr className="w-100"/>

		<li className="c-nav-item">
			<Link className="c-nav-link" to="?filter=new"><IcUploaded/> {t('New uploads')}
				{!!docStat.new && <span className="badge rounded-pill bg-danger">{docStat.new}</span>}
			</Link>
		</li>

		<div className="c-input-group">
			<input type="text" className="c-input" placeholder="Search" />
			<button className="c-button secondary" type="button"><IcSearch/></button>
		</div>
	</ul>
}

interface FileCardProps {
	className?: string
	file: File
	setFile?: (file: File) => void
	onClick?: () => void
	openFile: (fileId: string) => void
	renameFile: (fileId: string) => void
	renameFileId?: string
	renameFileName?: string
	setRenameFileName: (name?: string) => void
	doRenameFile: (fileId: string, fileName: string) => void
	doDeleteFile: (fileId: string) => void
}
function FileCard({ className, file, setFile, onClick, openFile, renameFile, renameFileId, renameFileName, setRenameFileName, doRenameFile, doDeleteFile }: FileCardProps) {
	const [auth] = useAuth()
	const { t } = useTranslation()

	function setTags(tags?: string[]) {
		setFile?.({ ...file, tags })
	}

	//return <div className={'c-panel ' + (className || '')} onClick={onClick}>
	return <div className={'c-panel ' + (className || '')} onClick={evt => (console.log('CLICK', evt), onClick && onClick())}>
		<div className="c-panel-header d-flex">
			<h3 className="c-panel-title d-flex flex-fill">
				{React.createElement<React.ComponentProps<typeof IcUnknown>>(icons[file.contentType] || IcUnknown, { className: 'me-1' })}
				{ renameFileName !== undefined && file.fileId === renameFileId ? <form onSubmit={evt => (evt.preventDefault(), renameFileName && doRenameFile(file.fileId, renameFileName))} className="c-input-group">
					<input className="c-input" type="text" autoFocus value={renameFileName} onChange={e => setRenameFileName(e.target.value)}/>
						<button className="c-button primary p-1" type="submit"><IcSave/></button>
						<button className="c-button secondary p-1" type="button" onClick={() => setRenameFileName(undefined)}
						><IcCancel/></button>
				</form>
				: file.fileName}
			</h3>
			{ !!file.owner?.profilePic && <ProfilePicture profile={file.owner} small/> }
			{/* file.ownerTag && <h4>{file.ownerTag}</h4> */}
			<div className="d-flex justify-content-end">
				<button className="c-link p-1" type="button" onClick={() => openFile(file.fileId)}><IcEdit/></button>
				<Popper className="dropdown" label={<IcMore/>}>
					<ul className="c-nav vertical">
						<li className="c-nav-item"><a className="c-link" href="#" onClick={() => renameFile(file.fileId)}><IcEdit/> {t('Rename...')}</a></li>
						<li className="c-nav-item"><a className="c-link" href="#" onClick={() => doDeleteFile(file.fileId)}><IcDelete/>{t('Delete...')}</a></li>
					</ul>
				</Popper>
				{/*
				<div className="dropdown">
					<details className="c-dropdown">
						<summary className="c-link p-1"><IcMore/></summary>
						<ul className="c-nav">
							<li className="c-nav-item"><a href="#" onClick={() => renameFile(file.fileId)}>{t('Rename...')}</a></li>
							<li className="c-nav-item"><a href="#" onClick={() => doDeleteFile(file.fileId)}>{t('Delete...')}</a></li>
						</ul>
					</details>
				</div>
				*/}
				{ auth?.idTag && file.variantId && <img src={`https://cl-o.${auth.idTag}/api/store/${file.variantId}`}/> }
			</div>
		</div>
		{ !!file.tags?.length && <div>
			<div><TagsCell fileId={file.fileId} tags={file.tags} setTags={setTags}/></div>
		</div> }
	</div>
}

interface FileDetailsProps {
	className?: string
	file: File
	setFile?: (file: File) => void
	openFile: (fileId: string) => void
	renameFile: (fileId: string) => void
	renameFileId?: string
	renameFileName?: string
	setRenameFileName: (name?: string) => void
	doRenameFile: (fileId: string, fileName: string) => void
}
function FileDetails({ className, file, setFile, openFile, renameFile, renameFileId, renameFileName, setRenameFileName, doRenameFile }: FileDetailsProps) {
	const { t } = useTranslation()
	const api = useApi()
	const [auth] = useAuth()
	const [permissionList, setPermissionList] = React.useState<Profile[]>()

	React.useEffect(function loadFileDetails() {
		setPermissionList([])
	}, [file])

	// Permissions //
	/////////////////
	async function listProfiles(q: string) {
		const res = !q ? { profiles: [] } : await api.get<{ profiles: Profile[] }>('', '/profile', {
			query: { type: 'U', q }
		})
		return res.profiles
	}

	async function addPerm(profile: Profile) {
		if (!file) return

		const action: NewAction = {
			type: 'FSHR',
			subType: 'WRITE',
			subject: file.fileId,
			content: {
				fileName: file.fileName,
				contentType: file.contentType
			},
			audienceTag: profile.idTag
		}

		const res = await api.post<{ actionId: string }>('', '/action', { data: action })
		setPermissionList(pl => (pl || []).find(p => p.idTag === profile.idTag) ? pl : [...(pl || []), profile])
	}

	async function removePerm(idTag: string) {
		if (!file) return

		const action: NewAction = {
			type: 'FSHR',
			subject: file.fileId,
			audienceTag: idTag
		}

		const res = await api.post<{ actionId: string }>('', '/action', { data: action })
		setPermissionList(permissionList?.filter(p => p.idTag !== idTag))
	}

	return <div className="c-panel h-min-100">
		<div className="c-panel-header d-flex">
			<h3 className="c-panel-title d-flex flex-fill">
				{React.createElement<React.ComponentProps<typeof IcUnknown>>(icons[file.contentType] || IcUnknown, { className: 'me-1' })}
				{ renameFileName !== undefined && file.fileId === renameFileId ? <form onSubmit={evt => (evt.preventDefault(), renameFileName && doRenameFile(file.fileId, renameFileName))} className="c-input-group">
					<input className="c-input" type="text" autoFocus value={renameFileName} onChange={e => setRenameFileName(e.target.value)}/>
						<button className="c-button primary p-1" type="submit"><IcSave/></button>
						<button className="c-button secondary p-1" type="button" onClick={() => setRenameFileName(undefined)}
						><IcCancel/></button>
				</form>
				: file.fileName}
			</h3>
			<div className="d-flex justify-content-end">
				<button className="c-link p-1" type="button" onClick={() => openFile(file.fileId)}><IcEdit/></button>
				<div className="dropdown">
					<details className="c-dropdown">
						<summary className="c-link p-1"><IcMore/></summary>
						<ul className="c-nav">
							<li className="c-nav-item"><a href="#" onClick={() => renameFile(file.fileId)}>{t('Rename...')}</a></li>
						</ul>
					</details>
				</div>
				{ auth?.idTag && file.variantId && <img src={`https://cl-o.${auth.idTag}/api/store/${file.variantId}`}/> }
			</div>
		</div>
		<div className="c-tag-list">
			<TagsCell fileId={file.fileId} tags={file.tags} editable/>
		</div>

		{ file.owner?.idTag == auth?.idTag && <>
			<h4>{t('Permissions')}</h4>
			<EditProfileList profiles={permissionList} listProfiles={listProfiles} addProfile={addPerm} removeProfile={removePerm}/>
		</> }
	</div>
}

export function FilesApp() {
	const navigate = useNavigate()
	const location = useLocation()
	const { t } = useTranslation()
	const [appConfig] = useAppConfig()
	const api = useApi()
	const [auth] = useAuth()
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

	function openFile(fileId?: string) {
		const file = fileListData.getData()?.find(f => f.fileId === fileId)
		const app = file && appConfig?.mime[file?.contentType]

		console.log('openFile', appConfig, file?.contentType, app)
		if (app) {
			navigate(`${app}/${(file.owner?.idTag || auth?.idTag) + ':' }${file.fileId}`)
		}
	}

	function renameFile(fileId?: string) {
		const file = fileListData.getData()?.find(f => f.fileId === fileId)
		console.log('rename file', file)
		setRenameFileId(fileId)
		setRenameFileName(file?.fileName || '')
	}

	async function doRenameFile(fileId: string, fileName: string) {
		if (!api) return
		const file = fileListData.getData()?.find(f => f.fileId === fileId)
		await api.patch('', `/store/${fileId}`, {
			data: { fileName }
		})
		setRenameFileId(undefined)
		setRenameFileName(undefined)
		fileListData.refresh()
	}

	async function doDeleteFile(fileId: string) {
		if (!api) return
		await api.delete('', `/store/${fileId}`)
		fileListData.refresh()
	}

	if (!fileListData.getData()) return <h1>Loading...</h1>

	return <Fcb.Container className="g-1">
		<Fcb.Filter isVisible={showFilter} hide={() => setShowFilter(false)}>
			<FilterBar/>
		</Fcb.Filter>
		<Fcb.Content>
			<div className="c-nav c-hbox md-hide lg-hide">
				<IcFilter onClick={() => setShowFilter(true)}/>
				<div className="c-tag-list">
					{ fileListData.filter?.filter == 'mut' && <div className="c-tag">{t('mutable')}</div> }
					{ fileListData.filter?.filter == 'imm' && <div className="c-tag">{t('immutable')}</div> }
				</div>
			</div>
			{ fileListData.getData().map(file => <FileCard
				key={file.fileId}
				className={mergeClasses('mb-1', selectedFile?.fileId === file.fileId && 'accent')}
				file={file}
				setFile={file => fileListData.setFileData(file.fileId, file)}
				onClick={() => selectedFile === file ? setSelectedFile(undefined) : setSelectedFile(file)}
				openFile={openFile}
				renameFile={renameFile}
				renameFileId={renameFileId}
				renameFileName={renameFileName}
				setRenameFileName={setRenameFileName}
				doRenameFile={doRenameFile}
				doDeleteFile={doDeleteFile}
			/>) }
		</Fcb.Content>
		<Fcb.Details isVisible={!!selectedFile} hide={() => setSelectedFile(undefined)}>
			{ selectedFile && <FileDetails
				file={selectedFile}
				setFile={file => fileListData.setFileData(file.fileId, file)}
				openFile={openFile}
				renameFile={renameFile}
				renameFileId={renameFileId}
				renameFileName={renameFileName}
				setRenameFileName={setRenameFileName}
				doRenameFile={doRenameFile}
			/> }
			{/* selectedFile && <div className="c-panel h-min-100">
				<h3 className="c-panel-title">
					{React.createElement<React.ComponentProps<typeof IcUnknown>>(icons[selectedFile.contentType] || IcUnknown, { className: 'me-1' })}
					{selectedFile.fileName}
				</h3>
				<div className="c-tag-list">
					<TagsCell fileId={selectedFile.fileId} tags={selectedFile.tags} editable/>
				</div>
				<h4>{t('Permissions')}</h4>
				<EditProfileList profiles={permissionList} listProfiles={listProfiles} addProfile={addPerm} removeProfile={removePerm}/>
			</div> */}
		</Fcb.Details>
	</Fcb.Container>
}

// vim: ts=4
