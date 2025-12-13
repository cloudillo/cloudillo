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
import type { File, FileOps } from '../types.js'

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
				if (isRenaming) return
				const target = e.target as HTMLElement
				if (
					target.tagName === 'INPUT' ||
					target.tagName === 'TEXTAREA' ||
					target.isContentEditable
				) {
					return
				}

				const currentIndex = selectedFile
					? files.findIndex((f) => f.fileId === selectedFile.fileId)
					: -1

				function scrollToFile(fileId: string) {
					// Find the element and scroll it into view
					setTimeout(() => {
						const element = document.querySelector(`[data-file-id="${fileId}"]`)
						element?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
					}, 0)
				}

				switch (e.key) {
					case 'ArrowUp':
						e.preventDefault()
						if (currentIndex > 0) {
							const file = files[currentIndex - 1]
							onSelectFile(file)
							scrollToFile(file.fileId)
						} else if (files.length > 0 && currentIndex === -1) {
							const file = files[files.length - 1]
							onSelectFile(file)
							scrollToFile(file.fileId)
						}
						break

					case 'ArrowDown':
						e.preventDefault()
						if (currentIndex < files.length - 1) {
							const file = files[currentIndex + 1]
							onSelectFile(file)
							scrollToFile(file.fileId)
						} else if (files.length > 0 && currentIndex === -1) {
							const file = files[0]
							onSelectFile(file)
							scrollToFile(file.fileId)
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
									selectedFile.fileId,
									selectedFile.accessLevel === 'none'
										? 'read'
										: selectedFile.accessLevel
								)
							}
						}
						break

					case 'Delete':
						if (selectedFile && !e.shiftKey) {
							e.preventDefault()
							fileOps.doDeleteFile(selectedFile.fileId)
						}
						break

					case 'F2':
						if (selectedFile) {
							e.preventDefault()
							fileOps.renameFile(selectedFile.fileId)
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
