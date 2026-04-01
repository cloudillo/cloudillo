// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

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
