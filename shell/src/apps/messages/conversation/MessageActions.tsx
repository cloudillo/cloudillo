// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import {
	Button,
	HBox,
	IcComment,
	IcCopy,
	IcDelete,
	IcEdit,
	IcMore,
	Menu,
	MenuItem,
	type MenuPosition,
	Panel,
	Popover,
	VBox
} from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { IcEmoji } from '../../../icons.js'
import { getReactionLabel, reactionTypes } from '../../feed/reactions.js'
import type { ActionEvt } from '../types.js'

/** Per-message `⋯` menu items supplied by the conversation view (each returns a `MenuItem`, or nothing) */
export interface MessageMenuSlots {
	pin?: (action: ActionEvt) => React.ReactNode
	seenBy?: (action: ActionEvt) => React.ReactNode
}

/** The six reactions as a row of toggle buttons (toolbar picker and the touch sheet) */
export function ReactionRow({
	ownReaction,
	onReact
}: {
	ownReaction?: string
	onReact: (key: string) => void
}) {
	const { t } = useTranslation()
	return (
		<HBox gap={1} align="center" justify="center">
			{reactionTypes.map((r) => (
				<Button
					key={r.key}
					variant={ownReaction === r.key ? 'soft' : 'ghost'}
					color={ownReaction === r.key ? 'accent' : undefined}
					aria-label={getReactionLabel(t, r.key)}
					aria-pressed={ownReaction === r.key}
					icon={r.emoji}
					onClick={() => onReact(r.key)}
				/>
			))}
		</HBox>
	)
}

export interface MessageActionsProps {
	action: ActionEvt
	/** Hover/focus toolbar shown (it stays while its picker or menu is open) */
	visible: boolean
	/** Which side the bubble is on: the toolbar sits on the inner edge */
	side: 'start' | 'end'
	/** Long-press / right-click point: the full menu opens there (a sheet on touch) */
	menuAt: MenuPosition | undefined
	onMenuClose: () => void
	canEdit: boolean
	canDelete: boolean
	onReact: (key: string) => void
	onReply: () => void
	onEdit: () => void
	onDelete: () => void
	/** Pin / Unpin item */
	pinItem?: React.ReactNode
	/** "Seen by" item */
	seenByItem?: React.ReactNode
}

export function MessageActions({
	action,
	visible,
	side,
	menuAt,
	onMenuClose,
	canEdit,
	canDelete,
	onReact,
	onReply,
	onEdit,
	onDelete,
	pinItem,
	seenByItem
}: MessageActionsProps) {
	const { t } = useTranslation()
	const [pickerOpen, setPickerOpen] = React.useState(false)
	const [moreOpen, setMoreOpen] = React.useState(false)
	// An open picker or menu holds the toolbar after hover/focus leave the bubble.
	const busy = pickerOpen || moreOpen

	const content = action.content
	const ownReaction = action.stat?.ownReaction

	function menuItems() {
		return (
			<>
				<MenuItem icon={<IcComment />} label={t('Reply')} onClick={onReply} />
				{canEdit && <MenuItem icon={<IcEdit />} label={t('Edit')} onClick={onEdit} />}
				{content && (
					<MenuItem
						icon={<IcCopy />}
						label={t('Copy text')}
						onClick={() => {
							navigator.clipboard?.writeText(content).catch(() => {})
						}}
					/>
				)}
				{pinItem}
				{seenByItem}
				{canDelete && (
					<MenuItem
						icon={<IcDelete />}
						label={t('Delete')}
						color="error"
						onClick={onDelete}
					/>
				)}
			</>
		)
	}

	return (
		<>
			{(visible || busy) && (
				<Panel
					padding={1}
					elevation="high"
					style={{
						position: 'absolute',
						top: '-1.25rem',
						zIndex: 1,
						...(side === 'end' ? { left: 0 } : { right: 0 })
					}}
				>
					<HBox role="toolbar" aria-label={t('Message actions')} gap={1}>
						<Popover
							placement="top"
							open={pickerOpen}
							onOpenChange={setPickerOpen}
							aria-label={t('React')}
							trigger={
								<Button
									variant="ghost"
									size="sm"
									icon={<IcEmoji />}
									aria-label={t('React')}
								/>
							}
						>
							<ReactionRow
								ownReaction={ownReaction}
								onReact={(key) => {
									setPickerOpen(false)
									onReact(key)
								}}
							/>
						</Popover>
						<Button
							variant="ghost"
							size="sm"
							icon={<IcComment />}
							aria-label={t('Reply')}
							onClick={onReply}
						/>
						<Menu
							placement="bottom-end"
							open={moreOpen}
							onOpenChange={setMoreOpen}
							trigger={
								<Button
									variant="ghost"
									size="sm"
									icon={<IcMore />}
									aria-label={t('More actions')}
								/>
							}
						>
							{menuItems()}
						</Menu>
					</HBox>
				</Panel>
			)}
			{menuAt && (
				<Menu position={menuAt} onClose={onMenuClose} aria-label={t('Message actions')}>
					<VBox className="p-2">
						<ReactionRow
							ownReaction={ownReaction}
							onReact={(key) => {
								onMenuClose()
								onReact(key)
							}}
						/>
					</VBox>
					{menuItems()}
				</Menu>
			)}
		</>
	)
}

// vim: ts=4
