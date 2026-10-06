// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import {
	AppIcon,
	type AppId,
	Button,
	FAB,
	Menu,
	MenuDivider,
	MenuItem,
	useAuth,
	useDialog,
	useFilePicker,
	useToast
} from '@cloudillo/react'
import * as React from 'react'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { LuPlus as IcAdd, LuFolderPlus as IcNewFolder, LuUpload as IcUpload } from 'react-icons/lu'
import { useNavigate } from 'react-router-dom'

import { useContextAwareApi, useCtx } from '../../../context/index.js'
import { appPath } from '../../../routes.js'

const createItems = (t: TFunction): { app: AppId; db?: boolean; label: string }[] => [
	{ app: 'quillo', label: t('Quillo text document') },
	{ app: 'calcillo', label: t('Calcillo spreadsheet document') },
	{ app: 'ideallo', label: t('Ideallo whiteboard document') },
	{ app: 'prezillo', label: t('Prezillo presentation document') },
	{ app: 'taskillo', db: true, label: t('Taskillo task list') },
	{ app: 'notillo', db: true, label: t('Notillo wiki') },
	{ app: 'scanillo', db: true, label: t('Scanillo document scanner') }
]

interface CreateMenuProps {
	contextIdTag?: string
	currentFolderId?: string | null
	/** Absolute `@tenant~name` room of the current drive; sent only at its root (folders inherit) */
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
						<Button color="primary" icon={<IcAdd />} data-tour="files-create">
							{t('New')}
						</Button>
					)
				}
			>
				{onCreateFolder && (
					<MenuItem
						icon={<IcNewFolder />}
						label={t('New folder')}
						onClick={onCreateFolder}
					/>
				)}
				{onUpload && (
					<MenuItem icon={<IcUpload />} label={t('Upload files')} onClick={picker.open} />
				)}
				{(onCreateFolder || onUpload) && <MenuDivider />}
				{createItems(t).map(({ app, db, label }) => (
					<MenuItem
						key={app}
						icon={<AppIcon app={app} size="sm" tile={false} />}
						label={label}
						onClick={() => create(app, db)}
					/>
				))}
			</Menu>
		</>
	)
}

// vim: ts=4
