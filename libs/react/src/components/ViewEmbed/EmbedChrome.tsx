// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Overlay for an embedded view: source chip, view-drift actions, interact / done, sizing
 * and an overflow menu. Every menu item and button appears only when its callback is provided.
 * Render it as the `children` of `ViewEmbedFrame`.
 */

import type { EmbedViewKind } from '@cloudillo/core'
import * as React from 'react'
import {
	LuAlignCenter as IcAlignCenter,
	LuAlignLeft as IcAlignLeft,
	LuAlignRight as IcAlignRight,
	LuFocus as IcChangeView,
	LuCheck as IcDone,
	LuPencil as IcEdit,
	LuMousePointerClick as IcInteract,
	LuLink as IcLink,
	LuEllipsis as IcMore,
	LuExternalLink as IcOpen,
	LuTrash2 as IcRemove,
	LuRotateCcw as IcReset,
	LuScaling as IcSizing,
	LuUnlink as IcUnlink,
	LuCrosshair as IcUseView
} from 'react-icons/lu'

import { useLibTranslation } from '../../i18n.js'
import { AppIcon, isAppId } from '../AppIcon/index.js'
import { Button } from '../Button/index.js'
import { Menu, MenuDivider, MenuItem } from '../Menu/index.js'
import { Popover } from '../Popover/index.js'
import { mergeClasses } from '../utils.js'
import { EmbedSizingControls } from './EmbedSizingControls.js'
import type { EmbedViewSettings } from './sizing.js'

export interface EmbedActions {
	onOpenSource?: () => void
	onCopyLink?: () => void
	onRemove?: () => void
	onSizing?: (settings: EmbedViewSettings) => void
	/** Persist the view the source drifted to */
	onUseCurrentView?: (nav: string) => void
	onResetView?: () => void
	onUnlink?: () => void
	onChangeView?: () => void
	/** Shows the "Allow editing" toggle; `editable` is its current state */
	onEditableChange?: (editable: boolean) => unknown
	editable?: boolean
	/** Host-controlled interact mode (canvas hosts): asked to enter / leave it */
	onActivate?: () => void
	onDeactivate?: () => void
}

export interface EmbedChromeProps {
	title: string
	appId?: string
	owner?: string
	/** Always show the bar; inside `ViewEmbedFrame` visibility follows the frame's selection */
	selected?: boolean
	/** The source reported a view other than the stored one */
	drifted?: boolean
	/** `nav` of the drifted view, for `onUseCurrentView` */
	currentNav?: string
	actions: EmbedActions
	/** Needed with `actions.onSizing` to show the sizing controls */
	kind?: EmbedViewKind
	settings?: EmbedViewSettings
	/** Interact mode is on: shows "Done" instead of "Interact" */
	active?: boolean
	onInteract?: () => void
	onDone?: () => void
	/** Extra host controls, rendered at the end of the bar */
	children?: React.ReactNode
}

const ALIGNS = [
	['left', 'Align left', IcAlignLeft],
	['center', 'Align center', IcAlignCenter],
	['right', 'Align right', IcAlignRight]
] as const

export function EmbedChrome({
	title,
	appId,
	owner,
	selected,
	drifted,
	currentNav,
	actions,
	kind,
	settings,
	active,
	onInteract,
	onDone,
	children
}: EmbedChromeProps) {
	const { t } = useLibTranslation()
	// The grant round-trip (a confirm dialog) is in flight: a second click must not race it
	const [pending, setPending] = React.useState(false)
	const {
		onOpenSource,
		onCopyLink,
		onRemove,
		onSizing,
		onUseCurrentView,
		onResetView,
		onUnlink,
		onChangeView,
		onEditableChange,
		editable = false
	} = actions
	const hasOther = !!(onOpenSource || onCopyLink || onChangeView || onUnlink || onEditableChange)
	const hasMenu = hasOther || !!onRemove

	return (
		<div
			className={mergeClasses('cl-embed-chrome', selected && 'pinned')}
			// Clicks on the bar must not count as "double-click to interact"
			onDoubleClick={(evt) => evt.stopPropagation()}
		>
			<span className="cl-embed-chrome-chip">
				{isAppId(appId) && <AppIcon app={appId} size="sm" tile={false} />}
				<span className="cl-embed-chrome-title">{title}</span>
				{owner && <span className="cl-embed-chrome-owner">{owner}</span>}
			</span>
			{drifted && (
				<>
					{onResetView && (
						<Button size="sm" variant="ghost" icon={<IcReset />} onClick={onResetView}>
							{t('Reset view')}
						</Button>
					)}
					{onUseCurrentView && currentNav && (
						<Button
							size="sm"
							variant="ghost"
							icon={<IcUseView />}
							onClick={() => onUseCurrentView(currentNav)}
						>
							{t('Use current view')}
						</Button>
					)}
				</>
			)}
			<span className="cl-embed-chrome-spacer" />
			{active
				? onDone && (
						<Button size="sm" icon={<IcDone />} onClick={onDone}>
							{t('Done')}
						</Button>
					)
				: onInteract && (
						<Button
							size="sm"
							variant="ghost"
							icon={<IcInteract />}
							onClick={onInteract}
						>
							{t('Interact')}
						</Button>
					)}
			{onSizing && settings && settings.sizing !== 'box' && (
				<span className="cl-embed-chrome-align">
					{ALIGNS.map(([align, label, Icon]) => (
						<Button
							key={align}
							size="sm"
							variant="ghost"
							icon={<Icon />}
							aria-label={t(label)}
							pressed={(settings.align ?? 'left') === align}
							onClick={() => onSizing({ ...settings, align })}
						/>
					))}
				</span>
			)}
			{onSizing && settings && kind && (
				<Popover
					trigger={
						<Button
							size="sm"
							variant="ghost"
							icon={<IcSizing />}
							aria-label={t('Embed size')}
						/>
					}
					placement="bottom-end"
				>
					<EmbedSizingControls kind={kind} settings={settings} onChange={onSizing} />
				</Popover>
			)}
			{hasMenu && (
				<Menu
					placement="bottom-end"
					trigger={
						<Button
							size="sm"
							variant="ghost"
							icon={<IcMore />}
							aria-label={t('Embed options')}
						/>
					}
				>
					{onOpenSource && (
						<MenuItem
							icon={<IcOpen />}
							label={t('Open source')}
							onClick={onOpenSource}
						/>
					)}
					{onCopyLink && (
						<MenuItem
							icon={<IcLink />}
							label={t('Copy embed link')}
							onClick={onCopyLink}
						/>
					)}
					{onChangeView && (
						<MenuItem
							icon={<IcChangeView />}
							label={t('Change view')}
							onClick={onChangeView}
						/>
					)}
					{onUnlink && (
						<MenuItem icon={<IcUnlink />} label={t('Unlink')} onClick={onUnlink} />
					)}
					{onEditableChange && (
						<MenuItem
							icon={<IcEdit />}
							label={t('Allow editing')}
							checked={editable}
							disabled={pending}
							onClick={() => {
								if (pending) return
								setPending(true)
								Promise.resolve(onEditableChange(!editable)).finally(() =>
									setPending(false)
								)
							}}
						/>
					)}
					{onRemove && (
						<>
							{hasOther && <MenuDivider />}
							<MenuItem
								icon={<IcRemove />}
								label={t('Remove')}
								color="error"
								onClick={onRemove}
							/>
						</>
					)}
				</Menu>
			)}
			{children}
		</div>
	)
}

// vim: ts=4
