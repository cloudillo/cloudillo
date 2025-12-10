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
import { LuUpload as IcUpload } from 'react-icons/lu'
import { mergeClasses } from '@cloudillo/react'

export interface DropZoneProps {
	onFilesDropped: (files: globalThis.File[]) => void
	children: React.ReactNode
	className?: string
	disabled?: boolean
}

export function DropZone({ onFilesDropped, children, className, disabled }: DropZoneProps) {
	const { t } = useTranslation()
	const [isDragOver, setIsDragOver] = React.useState(false)
	const dragCounterRef = React.useRef(0)

	const handleDragEnter = React.useCallback(
		function handleDragEnter(e: React.DragEvent) {
			e.preventDefault()
			e.stopPropagation()

			if (disabled) return

			dragCounterRef.current++
			if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
				setIsDragOver(true)
			}
		},
		[disabled]
	)

	const handleDragLeave = React.useCallback(
		function handleDragLeave(e: React.DragEvent) {
			e.preventDefault()
			e.stopPropagation()

			if (disabled) return

			dragCounterRef.current--
			if (dragCounterRef.current === 0) {
				setIsDragOver(false)
			}
		},
		[disabled]
	)

	const handleDragOver = React.useCallback(
		function handleDragOver(e: React.DragEvent) {
			e.preventDefault()
			e.stopPropagation()

			if (disabled) return

			e.dataTransfer.dropEffect = 'copy'
		},
		[disabled]
	)

	const handleDrop = React.useCallback(
		function handleDrop(e: React.DragEvent) {
			e.preventDefault()
			e.stopPropagation()

			setIsDragOver(false)
			dragCounterRef.current = 0

			if (disabled) return

			const files = Array.from(e.dataTransfer.files)
			if (files.length > 0) {
				onFilesDropped(files)
			}
		},
		[disabled, onFilesDropped]
	)

	return (
		<div
			className={mergeClasses('c-drop-zone', isDragOver && 'drag-over', className)}
			onDragEnter={handleDragEnter}
			onDragLeave={handleDragLeave}
			onDragOver={handleDragOver}
			onDrop={handleDrop}
		>
			{children}
			{isDragOver && (
				<div className="c-drop-zone-overlay">
					<div className="c-drop-zone-indicator">
						<IcUpload style={{ fontSize: '3rem' }} />
						<div className="mt-2">{t('Drop files here to upload')}</div>
					</div>
				</div>
			)}
		</div>
	)
}

// vim: ts=4
