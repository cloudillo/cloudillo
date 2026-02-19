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
	LuFolder as IcFolder,
	LuFolderOpen as IcFolderOpen,
	LuChevronRight as IcChevronRight,
	LuChevronDown as IcChevronDown,
	LuCloud as IcRoot,
	LuX as IcClose
} from 'react-icons/lu'

import { Button, mergeClasses } from '@cloudillo/react'
import { useContextAwareApi } from '../../../context/index.js'

export interface FolderPickerProps {
	title: string
	excludeFileIds?: string[]
	onSelect: (folderId: string | null) => void
	onClose: () => void
}

interface FolderInfo {
	fileId: string
	fileName: string
	fileTp?: string
}

interface FolderNode {
	file: FolderInfo | null // null for root
	children?: FolderNode[]
	expanded: boolean
	loading: boolean
}

export function FolderPicker({ title, excludeFileIds, onSelect, onClose }: FolderPickerProps) {
	const excludeSet = React.useMemo(() => new Set(excludeFileIds || []), [excludeFileIds])
	const { t } = useTranslation()
	const { api } = useContextAwareApi()
	const [selectedId, setSelectedId] = React.useState<string | null>(null)
	const [rootFolders, setRootFolders] = React.useState<FolderNode[]>([])
	const [expandedFolders, setExpandedFolders] = React.useState<Map<string | null, FolderNode[]>>(
		new Map()
	)
	const [loadingFolders, setLoadingFolders] = React.useState<Set<string | null>>(new Set([null]))

	// Load root folders initially
	React.useEffect(
		function loadRootFolders() {
			if (!api) return

			;(async function () {
				try {
					const files = await api.files.list({ parentId: undefined })
					const folders = files.filter(
						(f) => f.fileTp === 'FLDR' && !excludeSet.has(f.fileId)
					)
					setRootFolders(
						folders.map((f) => ({
							file: f,
							expanded: false,
							loading: false
						}))
					)
				} finally {
					setLoadingFolders((prev) => {
						const next = new Set(prev)
						next.delete(null)
						return next
					})
				}
			})()
		},
		[api, excludeSet]
	)

	async function loadChildren(folderId: string) {
		if (!api || expandedFolders.has(folderId)) return

		setLoadingFolders((prev) => new Set(prev).add(folderId))

		try {
			const files = await api.files.list({ parentId: folderId })
			const folders = files.filter((f) => f.fileTp === 'FLDR' && !excludeSet.has(f.fileId))
			setExpandedFolders((prev) => {
				const next = new Map(prev)
				next.set(
					folderId,
					folders.map((f) => ({
						file: f,
						expanded: false,
						loading: false
					}))
				)
				return next
			})
		} finally {
			setLoadingFolders((prev) => {
				const next = new Set(prev)
				next.delete(folderId)
				return next
			})
		}
	}

	function toggleExpand(folderId: string) {
		if (!expandedFolders.has(folderId)) {
			loadChildren(folderId)
		}
		setExpandedFolders((prev) => {
			const next = new Map(prev)
			if (next.has(folderId)) {
				next.delete(folderId)
			} else {
				// Keep the entry to indicate it's been loaded
				next.set(folderId, prev.get(folderId) || [])
			}
			return next
		})
	}

	function renderFolderItem(node: FolderNode, depth: number = 0) {
		const folderId = node.file?.fileId
		const isExpanded = folderId ? expandedFolders.has(folderId) : false
		const isLoading = folderId ? loadingFolders.has(folderId) : false
		const isSelected = selectedId === (folderId || null)
		const children = folderId ? expandedFolders.get(folderId) : undefined
		const itemKey = folderId || 'root'

		return (
			<div key={itemKey}>
				<div
					className={mergeClasses('c-folder-picker-item', isSelected && 'selected')}
					style={{ paddingLeft: `${depth * 1.25 + 0.5}rem` }}
					onClick={() => setSelectedId(folderId || null)}
					onDoubleClick={() => folderId && toggleExpand(folderId)}
				>
					{folderId && (
						<button
							type="button"
							className="c-folder-picker-expand"
							onClick={(e) => {
								e.stopPropagation()
								toggleExpand(folderId)
							}}
						>
							{isLoading ? (
								<span className="c-spin">⟳</span>
							) : isExpanded ? (
								<IcChevronDown />
							) : (
								<IcChevronRight />
							)}
						</button>
					)}
					<span className="c-folder-picker-icon">
						{folderId ? isExpanded ? <IcFolderOpen /> : <IcFolder /> : <IcRoot />}
					</span>
					<span className="c-folder-picker-name">
						{node.file?.fileName || t('My Files')}
					</span>
				</div>
				{isExpanded && children && (
					<div className="c-folder-picker-children">
						{children.length === 0 ? (
							<div
								className="c-folder-picker-empty"
								style={{ paddingLeft: `${(depth + 1) * 1.25 + 0.5}rem` }}
							>
								{t('Empty folder')}
							</div>
						) : (
							children.map((child) => renderFolderItem(child, depth + 1))
						)}
					</div>
				)}
			</div>
		)
	}

	return (
		<div className="c-folder-picker-overlay" onClick={onClose}>
			<div className="c-folder-picker-dialog" onClick={(e) => e.stopPropagation()}>
				<div className="c-folder-picker-header">
					<h3>{title}</h3>
					<button type="button" className="c-folder-picker-close" onClick={onClose}>
						<IcClose />
					</button>
				</div>
				<div className="c-folder-picker-content">
					{loadingFolders.has(null) ? (
						<div className="c-folder-picker-loading">{t('Loading folders...')}</div>
					) : (
						<>
							{renderFolderItem({ file: null, expanded: true, loading: false })}
							{rootFolders.map((node) => renderFolderItem(node, 1))}
						</>
					)}
				</div>
				<div className="c-folder-picker-footer">
					<Button variant="secondary" onClick={onClose}>
						{t('Cancel')}
					</Button>
					<Button variant="primary" onClick={() => onSelect(selectedId)}>
						{t('Move here')}
					</Button>
				</div>
			</div>
		</div>
	)
}

// vim: ts=4
