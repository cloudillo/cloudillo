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
import { LuPanelLeft as IcSidebar } from 'react-icons/lu'

import { Button } from '@cloudillo/react'
import type { RtdbClient } from '@cloudillo/rtdb'
import type { PageRecord } from '../rtdb/types.js'
import { updatePage } from '../rtdb/page-ops.js'

interface PageHeaderProps {
	client: RtdbClient
	page: PageRecord & { id: string }
	readOnly: boolean
	onToggleSidebar?: () => void
}

export function PageHeader({ client, page, readOnly, onToggleSidebar }: PageHeaderProps) {
	const [editing, setEditing] = React.useState(false)
	const [title, setTitle] = React.useState(page.title)
	const inputRef = React.useRef<HTMLInputElement>(null)

	React.useEffect(() => {
		setTitle(page.title)
	}, [page.title])

	React.useEffect(() => {
		if (editing && inputRef.current) {
			inputRef.current.focus()
			inputRef.current.select()
		}
	}, [editing])

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
			className="c-nav px-4 py-2 g-2"
			style={{ borderBottom: '1px solid var(--col-outline)' }}
		>
			{onToggleSidebar && (
				<Button
					link
					mode="icon"
					size="small"
					className="md-hide lg-hide"
					onClick={onToggleSidebar}
					title="Toggle sidebar"
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
					title={readOnly ? undefined : 'Click to edit title'}
				>
					{page.title || 'Untitled'}
				</h1>
			)}
		</nav>
	)
}

// vim: ts=4
