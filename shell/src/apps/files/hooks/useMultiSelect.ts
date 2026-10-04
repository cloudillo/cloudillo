// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

import type { File } from '../types.js'

export interface UseMultiSelectOptions {
	files: File[]
	/** Identity of the list being shown — view, folder, node, search and tags. Changing it
	 *  clears the selection outright, which id-pruning cannot do while the new list is
	 *  still empty. */
	resetKey?: string
}

export interface UseMultiSelectResult {
	selectedIds: Set<string>
	anchorId: string | undefined
	isSelected: (entryId: string) => boolean
	handleClick: (file: File, event: React.MouseEvent) => void
	selectAll: () => void
	clearSelection: () => void
	toggleSelection: (entryId: string) => void
	getFirstSelected: () => File | undefined
	getSelectedFiles: () => File[]
}

export function useMultiSelect({ files, resetKey }: UseMultiSelectOptions): UseMultiSelectResult {
	const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())
	const [anchorId, setAnchorId] = React.useState<string | undefined>()

	// Create a stable key based on file IDs to detect actual file list changes
	// This avoids infinite loops when the files array reference changes but content is the same
	const filesKey = React.useMemo(() => files.map((f) => f.entryId).join(','), [files])

	// Drop only the ids that left the list - a mutation refetch must not lose the selection.
	// While the list is empty (the blank tick refresh() causes) keep everything: nothing with
	// no row renders anyway, since every accessor derives from `files`.
	React.useEffect(
		function pruneOnFilesChange() {
			if (files.length === 0) return
			const ids = new Set(files.map((f) => f.entryId))
			setSelectedIds((prev) => {
				const next = new Set([...prev].filter((id) => ids.has(id)))
				return next.size === prev.size ? prev : next
			})
			setAnchorId((prev) => (prev !== undefined && !ids.has(prev) ? undefined : prev))
		},
		[filesKey]
	)

	// Navigating somewhere else drops the selection outright — the prune above cannot,
	// since the new list may still be empty. Fires once on mount, harmlessly.
	React.useEffect(
		function clearOnListChange() {
			setSelectedIds(new Set())
			setAnchorId(undefined)
		},
		[resetKey]
	)

	const isSelected = React.useCallback(
		function isSelected(entryId: string) {
			return selectedIds.has(entryId)
		},
		[selectedIds]
	)

	const handleClick = React.useCallback(
		function handleClick(file: File, event: React.MouseEvent) {
			const entryId = file.entryId

			if (event.shiftKey && anchorId) {
				// Range selection: select all items between anchor and clicked item
				const anchorIndex = files.findIndex((f) => f.entryId === anchorId)
				const clickIndex = files.findIndex((f) => f.entryId === entryId)

				if (anchorIndex !== -1 && clickIndex !== -1) {
					const start = Math.min(anchorIndex, clickIndex)
					const end = Math.max(anchorIndex, clickIndex)

					setSelectedIds((prev) => {
						const next = new Set(prev)
						for (let i = start; i <= end; i++) {
							next.add(files[i].entryId)
						}
						return next
					})
				}
			} else if (event.ctrlKey || event.metaKey) {
				// Toggle selection: add or remove from current selection
				setSelectedIds((prev) => {
					const next = new Set(prev)
					if (next.has(entryId)) {
						next.delete(entryId)
					} else {
						next.add(entryId)
					}
					return next
				})
				setAnchorId(entryId)
			} else {
				// Single selection: replace current selection
				setSelectedIds(new Set([entryId]))
				setAnchorId(entryId)
			}
		},
		[files, anchorId]
	)

	const selectAll = React.useCallback(
		function selectAll() {
			setSelectedIds(new Set(files.map((f) => f.entryId)))
		},
		[files]
	)

	const clearSelection = React.useCallback(function clearSelection() {
		setSelectedIds(new Set())
		setAnchorId(undefined)
	}, [])

	const toggleSelection = React.useCallback(function toggleSelection(entryId: string) {
		setSelectedIds((prev) => {
			const next = new Set(prev)
			if (next.has(entryId)) {
				next.delete(entryId)
			} else {
				next.add(entryId)
			}
			return next
		})
	}, [])

	const getFirstSelected = React.useCallback(
		function getFirstSelected() {
			if (selectedIds.size === 0) return undefined
			// Return the first file in the list that is selected
			return files.find((f) => selectedIds.has(f.entryId))
		},
		[files, selectedIds]
	)

	const getSelectedFiles = React.useCallback(
		function getSelectedFiles() {
			return files.filter((f) => selectedIds.has(f.entryId))
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
