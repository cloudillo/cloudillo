// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { mergeClasses, createComponent } from '../utils.js'

export interface DropZoneProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onDrop'> {
	onFilesDropped: (files: File[]) => void
	accept?: string
	multiple?: boolean
	disabled?: boolean
	/** Render as a full-area overlay that appears only while dragging over the parent. */
	overlay?: boolean
	/** Visible even when not dragging (for a permanent upload area). Ignored when `overlay`. */
	idle?: React.ReactNode
	/** Content shown while files are being dragged over. */
	hover?: React.ReactNode
	children?: React.ReactNode
}

export const DropZone = createComponent<HTMLDivElement, DropZoneProps>(
	'DropZone',
	(
		{
			onFilesDropped,
			accept,
			multiple = true,
			disabled,
			overlay,
			idle,
			hover,
			className,
			children,
			...props
		},
		ref
	) => {
		const [isDragging, setIsDragging] = React.useState(false)
		const dragCounterRef = React.useRef(0)

		function filterFiles(list: FileList): File[] {
			const files = Array.from(list)
			if (!accept) return files
			const patterns = accept.split(',').map((s) => s.trim().toLowerCase())
			return files.filter((f) => {
				const name = f.name.toLowerCase()
				const type = f.type.toLowerCase()
				return patterns.some((p) => {
					if (p.startsWith('.')) return name.endsWith(p)
					if (p.endsWith('/*')) return type.startsWith(p.slice(0, -1))
					return type === p
				})
			})
		}

		function handleDragEnter(e: React.DragEvent) {
			if (disabled) return
			e.preventDefault()
			e.stopPropagation()
			dragCounterRef.current += 1
			if (e.dataTransfer.types.includes('Files')) {
				setIsDragging(true)
			}
		}

		function handleDragLeave(e: React.DragEvent) {
			if (disabled) return
			e.preventDefault()
			e.stopPropagation()
			dragCounterRef.current -= 1
			if (dragCounterRef.current <= 0) {
				dragCounterRef.current = 0
				setIsDragging(false)
			}
		}

		function handleDragOver(e: React.DragEvent) {
			if (disabled) return
			e.preventDefault()
			e.stopPropagation()
			e.dataTransfer.dropEffect = 'copy'
		}

		function handleDrop(e: React.DragEvent) {
			if (disabled) return
			e.preventDefault()
			e.stopPropagation()
			dragCounterRef.current = 0
			setIsDragging(false)
			const files = filterFiles(e.dataTransfer.files)
			if (!multiple && files.length > 1) {
				onFilesDropped([files[0]])
			} else if (files.length > 0) {
				onFilesDropped(files)
			}
		}

		return (
			<div
				ref={ref}
				className={mergeClasses(
					'c-drop-zone',
					overlay && 'overlay',
					isDragging && 'dragging',
					disabled && 'disabled',
					className
				)}
				onDragEnter={handleDragEnter}
				onDragLeave={handleDragLeave}
				onDragOver={handleDragOver}
				onDrop={handleDrop}
				{...props}
			>
				{children}
				{overlay
					? isDragging && (
							<div className="c-drop-zone-overlay">{hover ?? <DropZoneHint />}</div>
						)
					: isDragging
						? (hover ?? <DropZoneHint />)
						: idle}
			</div>
		)
	}
)

function DropZoneHint() {
	return (
		<div className="c-drop-zone-hint">
			<span>Drop files here</span>
		</div>
	)
}

// vim: ts=4
