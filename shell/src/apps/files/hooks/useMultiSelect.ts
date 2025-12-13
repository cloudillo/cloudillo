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
import type { File } from '../types.js'

export interface UseMultiSelectOptions {
	files: File[]
}

export interface UseMultiSelectResult {
	selectedIds: Set<string>
	anchorId: string | undefined
	isSelected: (fileId: string) => boolean
	handleClick: (file: File, event: React.MouseEvent) => void
	selectAll: () => void
	clearSelection: () => void
	toggleSelection: (fileId: string) => void
	getFirstSelected: () => File | undefined
	getSelectedFiles: () => File[]
}

export function useMultiSelect({ files }: UseMultiSelectOptions): UseMultiSelectResult {
	const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())
	const [anchorId, setAnchorId] = React.useState<string | undefined>()

	// Create a stable key based on file IDs to detect actual file list changes
	// This avoids infinite loops when the files array reference changes but content is the same
	const filesKey = React.useMemo(() => files.map((f) => f.fileId).join(','), [files])

	// Clear selection when files actually change (based on IDs, not reference)
	React.useEffect(
		function clearOnFilesChange() {
			setSelectedIds(new Set())
			setAnchorId(undefined)
		},
		[filesKey]
	)

	const isSelected = React.useCallback(
		function isSelected(fileId: string) {
			return selectedIds.has(fileId)
		},
		[selectedIds]
	)

	const handleClick = React.useCallback(
		function handleClick(file: File, event: React.MouseEvent) {
			const fileId = file.fileId

			if (event.shiftKey && anchorId) {
				// Range selection: select all items between anchor and clicked item
				const anchorIndex = files.findIndex((f) => f.fileId === anchorId)
				const clickIndex = files.findIndex((f) => f.fileId === fileId)

				if (anchorIndex !== -1 && clickIndex !== -1) {
					const start = Math.min(anchorIndex, clickIndex)
					const end = Math.max(anchorIndex, clickIndex)

					setSelectedIds((prev) => {
						const next = new Set(prev)
						for (let i = start; i <= end; i++) {
							next.add(files[i].fileId)
						}
						return next
					})
				}
			} else if (event.ctrlKey || event.metaKey) {
				// Toggle selection: add or remove from current selection
				setSelectedIds((prev) => {
					const next = new Set(prev)
					if (next.has(fileId)) {
						next.delete(fileId)
					} else {
						next.add(fileId)
					}
					return next
				})
				setAnchorId(fileId)
			} else {
				// Single selection: replace current selection
				setSelectedIds(new Set([fileId]))
				setAnchorId(fileId)
			}
		},
		[files, anchorId]
	)

	const selectAll = React.useCallback(
		function selectAll() {
			setSelectedIds(new Set(files.map((f) => f.fileId)))
		},
		[files]
	)

	const clearSelection = React.useCallback(function clearSelection() {
		setSelectedIds(new Set())
		setAnchorId(undefined)
	}, [])

	const toggleSelection = React.useCallback(function toggleSelection(fileId: string) {
		setSelectedIds((prev) => {
			const next = new Set(prev)
			if (next.has(fileId)) {
				next.delete(fileId)
			} else {
				next.add(fileId)
			}
			return next
		})
	}, [])

	const getFirstSelected = React.useCallback(
		function getFirstSelected() {
			if (selectedIds.size === 0) return undefined
			// Return the first file in the list that is selected
			return files.find((f) => selectedIds.has(f.fileId))
		},
		[files, selectedIds]
	)

	const getSelectedFiles = React.useCallback(
		function getSelectedFiles() {
			return files.filter((f) => selectedIds.has(f.fileId))
		},
		[files, selectedIds]
	)

	return {
		selectedIds,
		anchorId,
		isSelected,
		handleClick,
		selectAll,
		clearSelection,
		toggleSelection,
		getFirstSelected,
		getSelectedFiles
	}
}

// vim: ts=4
