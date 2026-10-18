// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { PorchEntry } from '@cloudillo/core'
import { Nav, Text, useAuth, VBox } from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { useContextAwareApi, useCtx } from '../../../context/index.js'
import { IcBrowse, IcManaged, IcPinned, IcPost, IcRoom, IcTrash } from '../../../icons.js'
import { feedPath, filesPath, roomsPath } from '../../../routes.js'
import type { ViewMode } from '../types.js'

interface SidebarProps {
	className?: string
	viewMode: ViewMode
	/** Re-clicking the current view must clear the filters (the caller handles it) */
	onViewModeChange: (mode: ViewMode) => void
	/** Main drive label (the context's name) */
	contextName: string
	/** Current room (bare name); null = main drive */
	drive: string | null
	/** Channel of the current drive (`''`/undefined = main drive); scopes the pinned folders */
	driveChannel?: string
	/** Current folder (null = drive root); marks the active pinned folder */
	currentFolderId: string | null
	/** Rooms the viewer is `in`; empty hides the Rooms group */
	rooms: PorchEntry[]
	/** Re-clicking the current drive must clear the filters (the caller handles it) */
	onDriveChange: (name: string | null) => void
	/** Bumped by the caller on every pin toggle, to refetch the pinned folders */
	pinVersion?: number
}

// Navigation only: every item opens an unfiltered place.
export const Sidebar = React.memo(function Sidebar({
	className,
	viewMode,
	onViewModeChange,
	contextName,
	drive,
	driveChannel,
	currentFolderId,
	rooms,
	onDriveChange,
	pinVersion
}: SidebarProps) {
	const { t } = useTranslation()
	const base = useCtx().base
	const sortedRooms = React.useMemo(
		() => [...rooms].sort((a, b) => a.name.localeCompare(b.name)),
		[rooms]
	)
	const hasRooms = sortedRooms.length > 0
	// `authenticated` is a dep of the pinned-load effect below: the api client's
	// identity is stable per idTag, so this flag (not `api`, and not `auth`,
	// which tracks the home session) is what changes when a context token lands.
	const { api, authenticated } = useContextAwareApi()
	const [auth] = useAuth()

	// Pinned folders of the current drive (pins are per user)
	const [pinned, setPinned] = React.useState<{ entryId: string; fileName: string }[]>([])
	React.useEffect(
		function loadPinned() {
			if (!api || !auth) return
			let cancelled = false
			;(async function () {
				try {
					const res = await api.files.list({
						pinned: true,
						fileTp: 'FLDR',
						channel: driveChannel ?? ''
					})
					if (!cancelled) setPinned(res)
				} catch {
					if (!cancelled) setPinned([])
				}
			})()
			return () => {
				cancelled = true
			}
		},
		[api, authenticated, auth, driveChannel, pinVersion]
	)

	const browsing = viewMode === 'browse'

	return (
		<VBox gap={2} padding={2} className={className}>
			<Nav aria-label={t('Files')}>
				{/* Main drive; with no rooms it stays the plain "Browse" entry */}
				<Nav.Item
					icon={<IcBrowse />}
					label={hasRooms ? contextName : t('Browse')}
					active={browsing && !drive && !currentFolderId}
					onClick={() => onDriveChange(null)}
				/>
				{pinned.length > 0 && (
					<Nav.Section label={t('Pinned')}>
						{pinned.map((folder) => (
							<Nav.Item
								key={folder.entryId}
								icon={<IcPinned />}
								label={folder.fileName}
								active={browsing && currentFolderId === folder.entryId}
								href={filesPath(base, { drive, parentId: folder.entryId })}
							/>
						))}
					</Nav.Section>
				)}
				{hasRooms && (
					<Nav.Section label={t('Rooms')}>
						{sortedRooms.map((room) => {
							const isActive = browsing && drive === room.name
							return (
								<React.Fragment key={room.name}>
									<Nav.Item
										icon={<IcRoom />}
										label={
											<>
												~{room.name}
												{room.title && (
													<Text color="secondary"> {room.title}</Text>
												)}
											</>
										}
										active={isActive && !currentFolderId}
										onClick={() => onDriveChange(room.name)}
									/>
									{isActive && (
										<>
											<Nav.Item
												depth={1}
												icon={<IcRoom />}
												label={t('Room home')}
												active={false}
												href={roomsPath(base, room.name)}
											/>
											<Nav.Item
												depth={1}
												icon={<IcPost />}
												label={t('Posts')}
												active={false}
												href={feedPath(base, undefined, {
													room: room.name
												})}
											/>
										</>
									)}
								</React.Fragment>
							)
						})}
						<Nav.Item
							label={<Text color="secondary">{t('All rooms →')}</Text>}
							href={roomsPath(base)}
						/>
					</Nav.Section>
				)}
				<Nav.Divider />
				<Nav.Item
					icon={<IcManaged />}
					label={t('Managed')}
					active={viewMode === 'managed'}
					onClick={() => onViewModeChange('managed')}
				/>
				<Nav.Item
					icon={<IcTrash />}
					label={t('Trash')}
					active={viewMode === 'trash'}
					onClick={() => onViewModeChange('trash')}
				/>
			</Nav>
		</VBox>
	)
})

// vim: ts=4
