// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { isInDialog } from '@cloudillo/react'
import * as React from 'react'

import type { File, FileOps } from '../types.js'
import { toAppAccess } from '../utils.js'

export interface UseKeyboardShortcutsOptions {
	files: File[]
	selectedFile?: File
	onSelectFile: (file: File | undefined) => void
	onEnterFolder: (file: File) => void
	onGoToParent: () => void
	fileOps: FileOps
	isRenaming?: boolean
	onSelectAll?: () => void
}

export function useKeyboardShortcuts({
	files,
	selectedFile,
	onSelectFile,
	onEnterFolder,
	onGoToParent,
	fileOps,
	isRenaming = false,
	onSelectAll
}: UseKeyboardShortcutsOptions) {
	React.useEffect(
		function setupKeyboardShortcuts() {
			function handleKeyDown(e: KeyboardEvent) {
				// Skip if renaming or if in an input/textarea
				if (isRenaming || isInDialog(e.target)) return
				const target = e.target as HTMLElement
				if (
					target.tagName === 'INPUT' ||
					target.tagName === 'TEXTAREA' ||
					target.isContentEditable
				) {
					return
				}

				const currentIndex = selectedFile
					? files.findIndex((f) => f.entryId === selectedFile.entryId)
					: -1

				function scrollToFile(entryId: string) {
					// Find the element and scroll it into view
					setTimeout(() => {
						const element = document.querySelector(`[data-file-id="${entryId}"]`)
						element?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
					}, 0)
				}

				function getPageSize(entryId?: string): number {
					const DEFAULT_PAGE_SIZE = 10
					const id = entryId || files[0]?.entryId
					if (!id) return DEFAULT_PAGE_SIZE

					const el = document.querySelector(
						`[data-file-id="${id}"]`
					) as HTMLElement | null
					if (!el) return DEFAULT_PAGE_SIZE

					// Find the scrollable container
					const container = el.closest('[data-file-grid]') as HTMLElement | null
					if (!container) return DEFAULT_PAGE_SIZE

					const itemHeight = el.offsetHeight
					const itemWidth = el.offsetWidth
					if (!itemHeight || !itemWidth) return DEFAULT_PAGE_SIZE

					const visibleRows = Math.max(1, Math.floor(container.clientHeight / itemHeight))
					const itemsPerRow = Math.max(1, Math.floor(container.clientWidth / itemWidth))
					return visibleRows * itemsPerRow
				}

				switch (e.key) {
					case 'ArrowUp':
						e.preventDefault()
						if (currentIndex > 0) {
							const file = files[currentIndex - 1]
							onSelectFile(file)
							scrollToFile(file.entryId)
						} else if (files.length > 0 && currentIndex === -1) {
							const file = files[files.length - 1]
							onSelectFile(file)
							scrollToFile(file.entryId)
						}
						break

					case 'ArrowDown':
						e.preventDefault()
						if (currentIndex < files.length - 1) {
							const file = files[currentIndex + 1]
							onSelectFile(file)
							scrollToFile(file.entryId)
						} else if (files.length > 0 && currentIndex === -1) {
							const file = files[0]
							onSelectFile(file)
							scrollToFile(file.entryId)
						}
						break

					case 'Home':
						e.preventDefault()
						if (files.length > 0) {
							const file = files[0]
							onSelectFile(file)
							scrollToFile(file.entryId)
						}
						break

					case 'End':
						e.preventDefault()
						if (files.length > 0) {
							const file = files[files.length - 1]
							onSelectFile(file)
							scrollToFile(file.entryId)
						}
						break

					case 'PageDown':
						e.preventDefault()
						if (files.length > 0) {
							if (currentIndex === -1) {
								const file = files[0]
								onSelectFile(file)
								scrollToFile(file.entryId)
							} else {
								const pageSize = getPageSize(selectedFile?.entryId)
								const newIndex = Math.min(currentIndex + pageSize, files.length - 1)
								const file = files[newIndex]
								onSelectFile(file)
								scrollToFile(file.entryId)
							}
						}
						break

					case 'PageUp':
						e.preventDefault()
						if (files.length > 0) {
							if (currentIndex === -1) {
								const file = files[files.length - 1]
								onSelectFile(file)
								scrollToFile(file.entryId)
							} else {
								const pageSize = getPageSize(selectedFile?.entryId)
								const newIndex = Math.max(currentIndex - pageSize, 0)
								const file = files[newIndex]
								onSelectFile(file)
								scrollToFile(file.entryId)
							}
						}
						break

					case 'ArrowLeft':
					case 'Backspace':
						if (!e.ctrlKey && !e.metaKey) {
							e.preventDefault()
							onGoToParent()
						}
						break

					case 'ArrowRight':
					case 'Enter':
						if (selectedFile) {
							e.preventDefault()
							if (selectedFile.fileTp === 'FLDR') {
								onEnterFolder(selectedFile)
							} else {
								fileOps.openFile(
									selectedFile.entryId,
									toAppAccess(selectedFile.accessLevel)
								)
							}
						}
						break

					case 'Delete':
						if (selectedFile && !e.shiftKey) {
							e.preventDefault()
							fileOps.doDeleteFile(selectedFile.entryId)
						}
						break

					case 'F2':
						if (selectedFile) {
							e.preventDefault()
							fileOps.renameFile(selectedFile.entryId)
						}
						break

					case 'Escape':
						e.preventDefault()
						onSelectFile(undefined)
						break

					case 'a':
						if (e.ctrlKey || e.metaKey) {
							e.preventDefault()
							onSelectAll?.()
						}
						break
				}
			}

			document.addEventListener('keydown', handleKeyDown)

			return () => {
				document.removeEventListener('keydown', handleKeyDown)
			}
		},
		[
			files,
			selectedFile,
			onSelectFile,
			onEnterFolder,
			onGoToParent,
			fileOps,
			isRenaming,
			onSelectAll
		]
	)
}

// vim: ts=4
