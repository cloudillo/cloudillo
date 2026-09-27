// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { createPortal } from 'react-dom'
import { LuUpload as IcUpload } from 'react-icons/lu'

import { useLibTranslation } from '../../i18n.js'
import { Icon } from '../Icon/Icon.js'
import { createComponent, mergeClasses } from '../utils.js'

/** Filters `list` by an `accept` string (`.ext`, `type/*`, exact MIME) and caps it to one unless `multiple`. */
export function pickFiles(
	list: FileList | null | undefined,
	accept?: string,
	multiple = true
): File[] {
	let files = Array.from(list ?? [])
	if (accept) {
		const patterns = accept.split(',').map((s) => s.trim().toLowerCase())
		files = files.filter((f) => {
			const name = f.name.toLowerCase()
			const type = f.type.toLowerCase()
			return patterns.some((p) => {
				if (p.startsWith('.')) return name.endsWith(p)
				if (p.endsWith('/*')) return type.startsWith(p.slice(0, -1))
				return type === p
			})
		})
	}
	return multiple ? files : files.slice(0, 1)
}

export interface FilePickerOptions {
	accept?: string
	multiple?: boolean
	/** Native `capture` hint: open the camera instead of the file browser on mobile. */
	capture?: 'user' | 'environment'
	disabled?: boolean
	onFiles?: (files: File[]) => void
}

/**
 * Shared hidden `<input type="file">`: render `input` anywhere (outside any clickable
 * parent) and call `open()` from a user gesture.
 */
export function useFilePicker({
	accept,
	multiple = true,
	capture,
	disabled,
	onFiles
}: FilePickerOptions) {
	const inputRef = React.useRef<HTMLInputElement>(null)
	const open = React.useCallback(() => {
		if (!disabled) inputRef.current?.click()
	}, [disabled])
	const input = (
		<input
			ref={inputRef}
			type="file"
			hidden
			tabIndex={-1}
			accept={accept}
			multiple={multiple}
			capture={capture}
			onChange={(e) => {
				const files = pickFiles(e.target.files, accept, multiple)
				e.target.value = ''
				if (files.length > 0) onFiles?.(files)
			}}
		/>
	)
	return { open, input }
}

export type DropZoneVariant = 'area' | 'overlay'

export interface DropZoneProps
	extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onDrop' | 'title'> {
	/** Called with the dropped or picked files (filtered by `accept`, one unless `multiple`). */
	onFiles?: (files: File[]) => void
	/** @deprecated Use `onFiles`. */
	onFilesDropped?: (files: File[]) => void
	accept?: string
	multiple?: boolean
	disabled?: boolean
	/**
	 * `area` (default): visible dashed box, click / Enter / Space opens the file picker.
	 * `overlay`: invisible until files are dragged over the parent (or the viewport).
	 */
	variant?: DropZoneVariant
	/** @deprecated Use `variant="overlay"`. */
	overlay?: boolean
	/** Overlay only: `viewport` catches drops anywhere on the page. */
	target?: 'parent' | 'viewport'
	/** Area only: leading glyph (default: upload icon). */
	icon?: React.ReactNode
	/** Area only: main line (default: "Drop files here or click to browse"). */
	title?: React.ReactNode
	/** Area only: muted second line (e.g. accepted types, size limit). */
	hint?: React.ReactNode
	/** @deprecated Area content when not dragging; replaces `icon`/`title`/`hint`. */
	idle?: React.ReactNode
	/** Content shown while files are being dragged over. */
	hover?: React.ReactNode
	children?: React.ReactNode
}

type AnyDragEvent = DragEvent | React.DragEvent

export const DropZone = createComponent<HTMLDivElement, DropZoneProps>(
	'DropZone',
	(
		{
			onFiles,
			onFilesDropped,
			accept,
			multiple = true,
			disabled,
			variant,
			overlay,
			target = 'parent',
			icon,
			title,
			hint,
			idle,
			hover,
			className,
			children,
			onClick,
			onKeyDown,
			...props
		},
		ref
	) => {
		const { t } = useLibTranslation()
		const [isDragging, setIsDragging] = React.useState(false)
		const dragCounterRef = React.useRef(0)
		const emit = onFiles ?? onFilesDropped
		const isOverlay = (variant ?? (overlay ? 'overlay' : 'area')) === 'overlay'
		const viewport = isOverlay && target === 'viewport'
		const picker = useFilePicker({ accept, multiple, disabled, onFiles: emit })

		function handleDragEnter(e: AnyDragEvent) {
			if (disabled) return
			e.preventDefault()
			e.stopPropagation()
			dragCounterRef.current += 1
			if (e.dataTransfer?.types.includes('Files')) {
				setIsDragging(true)
			}
		}

		function handleDragLeave(e: AnyDragEvent) {
			if (disabled) return
			e.preventDefault()
			e.stopPropagation()
			dragCounterRef.current -= 1
			if (dragCounterRef.current <= 0) {
				dragCounterRef.current = 0
				setIsDragging(false)
			}
		}

		function handleDragOver(e: AnyDragEvent) {
			if (disabled) return
			e.preventDefault()
			e.stopPropagation()
			if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
		}

		function handleDrop(e: AnyDragEvent) {
			if (disabled) return
			e.preventDefault()
			e.stopPropagation()
			dragCounterRef.current = 0
			setIsDragging(false)
			const files = pickFiles(e.dataTransfer?.files, accept, multiple)
			if (files.length > 0) emit?.(files)
		}

		// Viewport target: listen on window; latest handlers through a ref so we subscribe once.
		const handlersRef = React.useRef({
			handleDragEnter,
			handleDragLeave,
			handleDragOver,
			handleDrop
		})
		handlersRef.current = { handleDragEnter, handleDragLeave, handleDragOver, handleDrop }
		React.useEffect(() => {
			if (!viewport) return
			const enter = (e: DragEvent) => handlersRef.current.handleDragEnter(e)
			const leave = (e: DragEvent) => handlersRef.current.handleDragLeave(e)
			const over = (e: DragEvent) => handlersRef.current.handleDragOver(e)
			const drop = (e: DragEvent) => handlersRef.current.handleDrop(e)
			window.addEventListener('dragenter', enter)
			window.addEventListener('dragleave', leave)
			window.addEventListener('dragover', over)
			window.addEventListener('drop', drop)
			return () => {
				window.removeEventListener('dragenter', enter)
				window.removeEventListener('dragleave', leave)
				window.removeEventListener('dragover', over)
				window.removeEventListener('drop', drop)
			}
		}, [viewport])

		const dragProps = viewport
			? {}
			: {
					onDragEnter: handleDragEnter,
					onDragLeave: handleDragLeave,
					onDragOver: handleDragOver,
					onDrop: handleDrop
				}

		if (isOverlay) {
			const layer = isDragging && (
				<div className={mergeClasses('c-drop-zone-overlay', viewport && 'viewport')}>
					{hover ?? <DropZoneHint />}
				</div>
			)
			return (
				<div
					ref={ref}
					className={mergeClasses(
						'c-drop-zone overlay',
						isDragging && 'dragging',
						disabled && 'disabled',
						className
					)}
					onClick={onClick}
					onKeyDown={onKeyDown}
					{...dragProps}
					{...props}
				>
					{children}
					{viewport && layer ? createPortal(layer, document.body) : layer}
				</div>
			)
		}

		return (
			<>
				<div
					ref={ref}
					role="button"
					tabIndex={disabled ? -1 : 0}
					aria-disabled={disabled || undefined}
					className={mergeClasses(
						'c-drop-zone area',
						isDragging && 'dragging',
						disabled && 'disabled',
						className
					)}
					onClick={(e) => {
						onClick?.(e)
						if (!e.defaultPrevented) picker.open()
					}}
					onKeyDown={(e) => {
						onKeyDown?.(e)
						if (e.defaultPrevented || e.target !== e.currentTarget) return
						if (e.key === 'Enter' || e.key === ' ') {
							e.preventDefault()
							picker.open()
						}
					}}
					{...dragProps}
					{...props}
				>
					{children}
					{isDragging
						? (hover ?? <DropZoneHint />)
						: (idle ?? (
								<>
									<span className="c-drop-zone-icon">
										{icon ?? <Icon as={IcUpload} size="lg" />}
									</span>
									<span className="c-drop-zone-title">
										{title ?? t('Drop files here or click to browse')}
									</span>
									{hint && <span className="c-drop-zone-hint-text">{hint}</span>}
								</>
							))}
				</div>
				{picker.input}
			</>
		)
	}
)

function DropZoneHint() {
	const { t } = useLibTranslation()
	return (
		<div className="c-drop-zone-hint">
			<span>{t('Drop files here')}</span>
		</div>
	)
}

// vim: ts=4
