// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The frame list: every frame on the board, sorted by name. A row zooms to its frame; the
 * row's buttons rename it inline and copy a `frame:<id>` embed link.
 *
 * Not a `ToolPopover`: its items are single buttons, and a row here carries an input and two
 * actions. It borrows that component's chrome (class, edge clamp, Escape, outside click) instead.
 */

import { useEscapeKey } from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
	PiListBulletsBold as IcFrameList,
	PiLinkBold as IcLink,
	PiPencilSimpleBold as IcRename
} from 'react-icons/pi'

import type { FrameObject } from '../crdt/runtime-types.js'
import { useEdgeClamp } from '../hooks/useEdgeClamp.js'
import { frameTitle } from '../utils/hit-testing.js'
import { TOOL_ICONS } from './tool-icons.js'

const IcFrame = TOOL_ICONS.frame

export interface FramesPopoverProps {
	open: boolean
	onClose: () => void
	anchorRef: React.RefObject<HTMLElement | null>
	frames: FrameObject[]
	onZoomToFrame: (frame: FrameObject) => void
	onCopyFrameLink: (frame: FrameObject) => void
	onRenameFrame: (frame: FrameObject, name: string) => void
	/** Arms the Frame tool - the empty state's next step */
	onDrawFrame?: () => void
	/** Readers get zoom and copy only: no rename, no "Draw a frame" */
	readOnly?: boolean
}

const ICON_BTN_STYLE: React.CSSProperties = { width: 'auto', flex: 'none' }

export function FramesPopover({
	open,
	onClose,
	anchorRef,
	frames,
	onZoomToFrame,
	onCopyFrameLink,
	onRenameFrame,
	onDrawFrame,
	readOnly
}: FramesPopoverProps) {
	const { t } = useTranslation()
	const { ref, shift, maxHeight } = useEdgeClamp({ side: 'above', flip: false, gap: 8 })
	const [editingId, setEditingId] = React.useState<string | null>(null)

	useEscapeKey(onClose, open && !editingId)

	React.useEffect(() => {
		if (!open) setEditingId(null)
	}, [open])

	// Capture phase, as in ToolPopover: React's root listeners run after a bubbling document one
	React.useEffect(() => {
		if (!open) return
		const handleOutside = (evt: PointerEvent) => {
			const target = evt.target as Node | null
			if (!target) return
			if (ref.current?.contains(target)) return
			if (anchorRef.current?.contains(target)) return
			evt.stopPropagation()
			evt.preventDefault()
			onClose()
		}
		document.addEventListener('pointerdown', handleOutside, true)
		return () => document.removeEventListener('pointerdown', handleOutside, true)
	}, [open, onClose, ref, anchorRef])

	const sorted = React.useMemo(
		() =>
			[...frames].sort((a, b) =>
				frameTitle(a, t('Frame')).localeCompare(frameTitle(b, t('Frame')), undefined, {
					numeric: true
				})
			),
		[frames, t]
	)

	if (!open) return null

	function commitRename(frame: FrameObject, value: string) {
		setEditingId(null)
		const name = value.trim()
		if (name && name !== frame.name) onRenameFrame(frame, name)
	}

	return (
		<div
			ref={ref}
			className="ideallo-tool-popover menu"
			style={
				{
					'--popover-shift': `${shift}px`,
					maxHeight: maxHeight ?? undefined,
					overflowY: maxHeight != null ? 'auto' : undefined
				} as React.CSSProperties
			}
			role="dialog"
			aria-label={t('Frame list')}
		>
			{!sorted.length && !readOnly && onDrawFrame && (
				<button
					type="button"
					className="ideallo-tool-menu-item"
					onClick={() => {
						onDrawFrame()
						onClose()
					}}
				>
					<IcFrame size={16} />
					{t('Draw a frame (F)')}
				</button>
			)}
			{sorted.map((frame) => {
				const title = frameTitle(frame, t('Frame'))
				return (
					<div key={frame.id} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
						{editingId === frame.id ? (
							<input
								className="c-input"
								autoFocus
								defaultValue={frame.name ?? ''}
								placeholder={title}
								aria-label={t('Frame name')}
								onBlur={(evt) => commitRename(frame, evt.currentTarget.value)}
								onKeyDown={(evt) => {
									if (evt.key === 'Enter') evt.currentTarget.blur()
									else if (evt.key === 'Escape') {
										evt.stopPropagation()
										setEditingId(null)
									}
								}}
							/>
						) : (
							<button
								type="button"
								className="ideallo-tool-menu-item"
								title={t('Zoom to {{title}}', { title })}
								onClick={() => {
									onZoomToFrame(frame)
									onClose()
								}}
							>
								{title}
							</button>
						)}
						{!readOnly && (
							<button
								type="button"
								className="ideallo-tool-menu-item"
								style={ICON_BTN_STYLE}
								title={t('Rename')}
								aria-label={t('Rename {{title}}', { title })}
								onClick={() => setEditingId(frame.id)}
							>
								<IcRename size={16} />
							</button>
						)}
						<button
							type="button"
							className="ideallo-tool-menu-item"
							style={ICON_BTN_STYLE}
							title={t('Copy embed link')}
							aria-label={t('Copy embed link to {{title}}', { title })}
							onClick={() => onCopyFrameLink(frame)}
						>
							<IcLink size={16} />
						</button>
					</div>
				)
			})}
		</div>
	)
}

/**
 * The frame list for readers: the toolbar is hidden for them, so the trigger floats on its own.
 * Absent while the board has no frames - a reader cannot draw one.
 */
export function ReaderFrameList({
	frames,
	onZoomToFrame,
	onCopyFrameLink
}: Pick<FramesPopoverProps, 'frames' | 'onZoomToFrame' | 'onCopyFrameLink'>) {
	const { t } = useTranslation()
	const [open, setOpen] = React.useState(false)
	const triggerRef = React.useRef<HTMLButtonElement>(null)
	const close = React.useCallback(() => setOpen(false), [])

	if (!frames.length) return null

	return (
		<div className={`ideallo-toolbar${open ? ' menu-open' : ''}`}>
			<div className="ideallo-tool-group">
				<button
					type="button"
					ref={triggerRef}
					className="ideallo-tool-btn"
					aria-haspopup="dialog"
					aria-expanded={open}
					title={t('Frame list')}
					aria-label={t('Frame list')}
					onClick={() => setOpen((o) => !o)}
				>
					<IcFrameList size={22} />
				</button>
				<FramesPopover
					open={open}
					onClose={close}
					anchorRef={triggerRef}
					frames={frames}
					onZoomToFrame={onZoomToFrame}
					onCopyFrameLink={onCopyFrameLink}
					onRenameFrame={() => {}}
					readOnly
				/>
			</div>
		</div>
	)
}

// vim: ts=4
