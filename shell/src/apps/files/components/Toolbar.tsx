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
	LuUpload as IcUpload,
	LuFolderPlus as IcNewFolder,
	LuLayoutGrid as IcGrid,
	LuList as IcList,
	LuTrash2 as IcEmptyTrash
} from 'react-icons/lu'
import {
	mergeClasses,
	Toolbar as ToolbarContainer,
	ToolbarSpacer,
	ToolbarGroup,
	ToolbarDivider
} from '@cloudillo/react'

export type DisplayMode = 'grid' | 'list'

export interface ToolbarProps {
	displayMode: DisplayMode
	onDisplayModeChange: (mode: DisplayMode) => void
	onFilesSelected: (files: globalThis.File[]) => void
	onCreateFolder?: () => void
	onEmptyTrash?: () => void
	isTrashView?: boolean
	className?: string
}

export function Toolbar({
	displayMode,
	onDisplayModeChange,
	onFilesSelected,
	onCreateFolder,
	onEmptyTrash,
	isTrashView,
	className
}: ToolbarProps) {
	const { t } = useTranslation()
	const fileInputRef = React.useRef<HTMLInputElement>(null)

	const handleUploadClick = React.useCallback(function handleUploadClick() {
		fileInputRef.current?.click()
	}, [])

	const handleFileChange = React.useCallback(
		function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
			const fileList = e.target.files
			if (fileList && fileList.length > 0) {
				onFilesSelected(Array.from(fileList))
			}
			// Reset input so the same file can be selected again
			e.target.value = ''
		},
		[onFilesSelected]
	)

	return (
		<ToolbarContainer className={className}>
			{!isTrashView && (
				<>
					<button
						type="button"
						className="c-button icon primary"
						onClick={handleUploadClick}
						title={t('Upload files')}
					>
						<IcUpload />
					</button>
					<input
						ref={fileInputRef}
						type="file"
						multiple
						style={{ display: 'none' }}
						onChange={handleFileChange}
					/>

					{onCreateFolder && (
						<button
							type="button"
							className="c-button icon"
							onClick={onCreateFolder}
							title={t('New folder')}
						>
							<IcNewFolder />
						</button>
					)}
				</>
			)}

			{isTrashView && onEmptyTrash && (
				<button
					type="button"
					className="c-button icon container-error"
					onClick={onEmptyTrash}
					title={t('Empty trash')}
				>
					<IcEmptyTrash />
				</button>
			)}

			<ToolbarSpacer />

			<ToolbarDivider />
			<ToolbarGroup>
				<button
					type="button"
					className={mergeClasses('c-button icon', displayMode === 'list' && 'active')}
					onClick={() => onDisplayModeChange('list')}
					title={t('List view')}
				>
					<IcList />
				</button>
				<button
					type="button"
					className={mergeClasses('c-button icon', displayMode === 'grid' && 'active')}
					onClick={() => onDisplayModeChange('grid')}
					title={t('Grid view')}
				>
					<IcGrid />
				</button>
			</ToolbarGroup>
		</ToolbarContainer>
	)
}

// vim: ts=4
