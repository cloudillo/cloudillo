// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import {
	AppIcon,
	type AppId,
	Button,
	FAB,
	IcAdd,
	IcCreateFolder,
	IcUpload,
	Menu,
	MenuDivider,
	MenuHeader,
	MenuItem,
	useAuth,
	useDialog,
	useFilePicker,
	useToast
} from '@cloudillo/react'
import type { TFunction } from 'i18next'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import { useContextAwareApi, useCtx } from '../../../context/index.js'
import { appPath } from '../../../routes.js'

/** `label` is the document type; `name` is the app, a brand name, so it is not translated */
const createItems = (t: TFunction): { app: AppId; db?: boolean; label: string; name: string }[] => [
	{ app: 'quillo', label: t('Text document'), name: 'Quillo' },
	{ app: 'calcillo', label: t('Spreadsheet'), name: 'Calcillo' },
	{ app: 'ideallo', label: t('Whiteboard'), name: 'Ideallo' },
	{ app: 'prezillo', label: t('Presentation'), name: 'Prezillo' },
	{ app: 'pagillo', label: t('Publication'), name: 'Pagillo' },
	{ app: 'notillo', db: true, label: t('Wiki'), name: 'Notillo' },
	{ app: 'scanillo', db: true, label: t('Document scanner'), name: 'Scanillo' }
]

interface CreateMenuProps {
	contextIdTag?: string
	currentFolderId?: string | null
	/** Absolute `@tenant~name` channel of the current room; sent only at its root (folders inherit) */
	channel?: string
	onCreateFolder?: () => void
	onUpload?: (files: globalThis.File[]) => void
	/** Render the trigger as a floating action button (mobile) */
	fab?: boolean
}

/** Create menu — folder, upload, documents; the Files page's primary action. */
export function CreateMenu({
	contextIdTag,
	currentFolderId,
	channel,
	onCreateFolder,
	onUpload,
	fab
}: CreateMenuProps) {
	const { t } = useTranslation()
	const { api } = useContextAwareApi()
	const [auth] = useAuth()
	// URL form of the context (`~` at home); the resId below carries the real owner.
	const urlCtx = useCtx().base
	const navigate = useNavigate()
	const dialog = useDialog()
	const toast = useToast()
	const picker = useFilePicker({ multiple: true, onFiles: onUpload })

	async function create(app: AppId, db: boolean | undefined) {
		if (!api) return
		const contentType = `cloudillo/${app}`

		const fileName = await dialog.askText(
			db ? t('Create database') : t('Create document'),
			db
				? t('Provide a name for the new database')
				: t('Provide a name for the new document'),
			{ placeholder: db ? t('Untitled database') : t('Untitled document') }
		)
		if (fileName === undefined) return

		try {
			const res = await api.files.create({
				fileTp: db ? 'RTDB' : 'CRDT',
				contentType,
				parentId: currentFolderId || undefined,
				channel: currentFolderId ? undefined : channel
			})
			if (res?.fileId) {
				await api.files.update(res.entryId, {
					fileName: (fileName ||
						(db ? t('Untitled database') : t('Untitled document'))) as string
				})

				// Real idTag: belongs in the resId's owner half, never the context segment.
				const ownerTag = contextIdTag || auth?.idTag
				navigate(appPath(urlCtx, app, `${ownerTag}:${res.fileId}`))
			}
		} catch (err) {
			console.error('[Files] create failed', err)
			toast.error(t('Failed to create document'))
		}
	}

	if (!auth) return null

	return (
		<>
			{/* Outside the Menu, so the input survives the menu closing */}
			{picker.input}
			<Menu
				trigger={
					fab ? (
						<FAB
							icon={<IcAdd />}
							aria-label={t('Create or upload')}
							data-tour="files-create"
						/>
					) : (
						<Button color="primary" size="sm" icon={<IcAdd />} data-tour="files-create">
							{t('New')}
						</Button>
					)
				}
			>
				{onCreateFolder && (
					<MenuItem
						icon={<IcCreateFolder size={16} />}
						label={t('New folder')}
						onClick={onCreateFolder}
					/>
				)}
				{onUpload && (
					<MenuItem
						icon={<IcUpload size={16} />}
						label={t('Upload files')}
						onClick={picker.open}
					/>
				)}
				{(onCreateFolder || onUpload) && <MenuDivider />}
				<MenuHeader>{t('New document')}</MenuHeader>
				{createItems(t).map(({ app, db, label, name }) => (
					<MenuItem
						key={app}
						icon={<AppIcon app={app} width={16} height={16} />}
						label={label}
						trailing={name}
						onClick={() => create(app, db)}
					/>
				))}
			</Menu>
		</>
	)
}

// vim: ts=4
