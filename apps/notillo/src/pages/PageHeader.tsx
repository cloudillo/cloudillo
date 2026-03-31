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
import {
	LuPanelLeft as IcSidebar,
	LuLink as IcLink,
	LuMessageCircle as IcComment
} from 'react-icons/lu'
import { PiDotsThreeVerticalBold as IcMore } from 'react-icons/pi'

import { Button } from '@cloudillo/react'
import type { RtdbClient } from '@cloudillo/rtdb'
import type { PageRecord } from '../rtdb/types.js'
import { updatePage } from '../rtdb/page-ops.js'

interface PageHeaderProps {
	client: RtdbClient
	page: PageRecord & { id: string }
	readOnly: boolean
	onToggleSidebar?: () => void
	onToggleComments?: () => void
	commentCount?: number
	onSharePage?: () => void
	onShareDocument?: () => void
	onExportMarkdown?: () => void
	onExportPdf?: () => void
	onExportDocx?: () => void
	onExportOdt?: () => void
	onImportMarkdown?: () => void
	onImportMarkdownAsChild?: () => void
}

export function PageHeader({
	client,
	page,
	readOnly,
	onToggleSidebar,
	onToggleComments,
	commentCount,
	onSharePage,
	onShareDocument,
	onExportMarkdown,
	onExportPdf,
	onExportDocx,
	onExportOdt,
	onImportMarkdown,
	onImportMarkdownAsChild
}: PageHeaderProps) {
	const { t } = useTranslation()
	const [editing, setEditing] = React.useState(false)
	const [title, setTitle] = React.useState(page.title)
	const inputRef = React.useRef<HTMLInputElement>(null)
	const [menuOpen, setMenuOpen] = React.useState(false)
	const menuRef = React.useRef<HTMLDivElement>(null)

	React.useEffect(() => {
		setTitle(page.title)
	}, [page.title])

	React.useEffect(() => {
		if (editing && inputRef.current) {
			inputRef.current.focus()
			inputRef.current.select()
		}
	}, [editing])

	// Close menu on click outside
	React.useEffect(() => {
		if (!menuOpen) return
		function handleClickOutside(e: MouseEvent) {
			if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
				setMenuOpen(false)
			}
		}
		document.addEventListener('click', handleClickOutside, true)
		return () => document.removeEventListener('click', handleClickOutside, true)
	}, [menuOpen])

	const handleSave = React.useCallback(async () => {
		setEditing(false)
		const trimmed = title.trim()
		if (trimmed && trimmed !== page.title) {
			await updatePage(client, page.id, { title: trimmed })
		} else {
			setTitle(page.title)
		}
	}, [client, page.id, page.title, title])

	const handleKeyDown = React.useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === 'Enter') {
				handleSave()
			} else if (e.key === 'Escape') {
				setTitle(page.title)
				setEditing(false)
			}
		},
		[handleSave, page.title]
	)

	return (
		<nav
			className="c-nav px-3 py-2 g-2"
			style={{ borderBottom: '1px solid var(--col-outline)' }}
		>
			{onToggleSidebar && (
				<Button
					link
					mode="icon"
					size="small"
					className="md-hide lg-hide"
					onClick={onToggleSidebar}
					title={t('Toggle sidebar')}
				>
					<IcSidebar />
				</Button>
			)}
			{page.icon && <span className="text-2xl">{page.icon}</span>}
			{editing && !readOnly ? (
				<input
					ref={inputRef}
					className="page-header-title-input"
					value={title}
					onChange={(e) => setTitle(e.target.value)}
					onBlur={handleSave}
					onKeyDown={handleKeyDown}
				/>
			) : (
				<h1
					className="text-2xl font-semibold flex-fill m-0 cursor-text"
					style={{ lineHeight: 1.3 }}
					onClick={() => !readOnly && setEditing(true)}
					title={readOnly ? undefined : t('Click to edit title')}
				>
					{page.title || t('Untitled')}
				</h1>
			)}
			{onToggleComments && (
				<div style={{ position: 'relative' }}>
					<Button
						link
						mode="icon"
						size="small"
						onClick={onToggleComments}
						title={t('Comments')}
					>
						<IcComment size={20} />
						{(commentCount ?? 0) > 0 && (
							<span className="comment-badge">{commentCount}</span>
						)}
					</Button>
				</div>
			)}
			<div ref={menuRef} style={{ position: 'relative' }}>
				<Button
					link
					mode="icon"
					size="small"
					onClick={() => setMenuOpen(!menuOpen)}
					title={t('More actions')}
				>
					<IcMore size={20} />
				</Button>
				{menuOpen && (
					<div className="c-menu" style={{ position: 'absolute', top: '100%', right: 0 }}>
						{!readOnly && (
							<>
								<div className="c-menu-header">{t('Share')}</div>
								<button
									className="c-menu-item"
									onClick={() => {
										setMenuOpen(false)
										onSharePage?.()
									}}
								>
									<IcLink /> {t('Share this page')}
								</button>
								<button
									className="c-menu-item"
									onClick={() => {
										setMenuOpen(false)
										onShareDocument?.()
									}}
								>
									<IcLink /> {t('Share document')}
								</button>
								<div className="c-menu-divider" />
							</>
						)}
						<div className="c-menu-header">{t('Export')}</div>
						<button
							className="c-menu-item"
							onClick={() => {
								setMenuOpen(false)
								onExportMarkdown?.()
							}}
						>
							{t('Markdown (.md)')}
						</button>
						<button
							className="c-menu-item"
							onClick={() => {
								setMenuOpen(false)
								onExportPdf?.()
							}}
						>
							{t('PDF (.pdf)')}
						</button>
						<button
							className="c-menu-item"
							onClick={() => {
								setMenuOpen(false)
								onExportDocx?.()
							}}
						>
							{t('Word (.docx)')}
						</button>
						<button
							className="c-menu-item"
							onClick={() => {
								setMenuOpen(false)
								onExportOdt?.()
							}}
						>
							{t('OpenDocument (.odt)')}
						</button>
						{!readOnly && (
							<>
								<div className="c-menu-divider" />
								<div className="c-menu-header">{t('Import Markdown')}</div>
								<button
									className="c-menu-item"
									onClick={() => {
										setMenuOpen(false)
										onImportMarkdown?.()
									}}
								>
									{t('Overwrite this page')}
								</button>
								<button
									className="c-menu-item"
									onClick={() => {
										setMenuOpen(false)
										onImportMarkdownAsChild?.()
									}}
								>
									{t('As child page')}
								</button>
							</>
						)}
					</div>
				)}
			</div>
		</nav>
	)
}

// vim: ts=4
