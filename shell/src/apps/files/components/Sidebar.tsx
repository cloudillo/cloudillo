// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { PorchEntry } from '@cloudillo/core'
import { Nav, roomTitleHint, Text, useAuth, VBox } from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { useContextAwareApi, useCtx, useCurrentContextIdTag } from '../../../context/index.js'
import {
	IcBrowse,
	IcFilesApp,
	IcManaged,
	IcPost,
	IcRoom,
	IcTrash,
	IcUnstar
} from '../../../icons.js'
import { ctxBase, feedPath, filesPath, roomsPath } from '../../../routes.js'
import { channelTarget } from '../audience.js'
import type { ViewMode } from '../types.js'

interface SidebarProps {
	className?: string
	viewMode: ViewMode
	/** Re-clicking the current view must clear the filters (the caller handles it) */
	onViewModeChange: (mode: ViewMode) => void
	/** Main room label (the context's name) */
	contextName: string
	/** Current room (bare name); null = main room */
	room: string | null
	/** Listing every room (`scope=all`); marks the All rooms item */
	allRooms: boolean
	/** Current folder (null = room root); a starred one takes the highlight from its room */
	currentFolderId: string | null
	/** Rooms the viewer is `in`; empty hides the Rooms group */
	rooms: PorchEntry[]
	/** Re-clicking the current room must clear the filters (the caller handles it) */
	onRoomChange: (name: string | null) => void
	/** Bumped by the caller on every star toggle, to refetch the starred folders */
	starVersion?: number
}

// Navigation only: every item opens an unfiltered place.
export const Sidebar = React.memo(function Sidebar({
	className,
	viewMode,
	onViewModeChange,
	contextName,
	room,
	allRooms,
	currentFolderId,
	rooms,
	onRoomChange,
	starVersion
}: SidebarProps) {
	const { t } = useTranslation()
	const base = useCtx().base
	const sortedRooms = React.useMemo(
		() => [...rooms].sort((a, b) => a.name.localeCompare(b.name)),
		[rooms]
	)
	const hasRooms = sortedRooms.length > 0
	// `authenticated` is a dep of the starred-load effect below: the api client's
	// identity is stable per idTag, so this flag (not `api`, and not `auth`,
	// which tracks the home session) is what changes when a context token lands.
	const { api, authenticated } = useContextAwareApi()
	const [auth] = useAuth()

	// Starred folders across every room of the context (stars are per user); no `channel`
	// in the query means all rooms
	const [starred, setStarred] = React.useState<
		{ entryId: string; fileName: string; channel?: string }[]
	>([])
	React.useEffect(
		function loadStarred() {
			if (!api || !auth) return
			let cancelled = false
			;(async function () {
				try {
					const res = await api.files.list({ starred: true, fileTp: 'FLDR' })
					if (!cancelled) {
						setStarred(res.sort((a, b) => a.fileName.localeCompare(b.fileName)))
					}
				} catch {
					if (!cancelled) setStarred([])
				}
			})()
			return () => {
				cancelled = true
			}
		},
		[api, authenticated, auth, starVersion]
	)

	// Each starred folder linked into its own room and context; folders of local rooms the
	// viewer is not `in` are left out (the room would not open), the Starred filter still has them
	const contextIdTag = useCurrentContextIdTag()
	const starredLinks = React.useMemo(() => {
		const roomNames = new Set(rooms.map((r) => r.name))
		return starred.flatMap((folder) => {
			const { tenant, room: folderRoom } = channelTarget(folder.channel, contextIdTag)
			if (!tenant && folderRoom && !roomNames.has(folderRoom)) return []
			// The hint tells apart same-named folders of different rooms
			const hint = tenant
				? `@${tenant}${folderRoom ? `~${folderRoom}` : ''}`
				: folderRoom && `~${folderRoom}`
			const href = tenant
				? filesPath(ctxBase(tenant, auth?.idTag), {
						...(folderRoom && { room: folderRoom }),
						parentId: folder.entryId
					})
				: filesPath(base, { room: folderRoom, parentId: folder.entryId })
			return [
				{
					entryId: folder.entryId,
					label: hint ? `${folder.fileName} · ${hint}` : folder.fileName,
					href
				}
			]
		})
	}, [starred, rooms, contextIdTag, auth?.idTag, base])

	const browsing = viewMode === 'browse'
	// A starred current folder owns the highlight, so its room item stays inactive
	const starredActive = browsing && starredLinks.some((f) => f.entryId === currentFolderId)

	return (
		<VBox gap={2} padding={2} className={className}>
			<Nav aria-label={t('Files')}>
				{/* Main room; with no rooms it stays the plain "Browse" entry */}
				<Nav.Item
					icon={<IcBrowse />}
					label={hasRooms ? contextName : t('Browse')}
					active={browsing && !room && !allRooms && !starredActive}
					onClick={() => onRoomChange(null)}
				/>
				{starredLinks.length > 0 && (
					<Nav.Section label={t('Starred')}>
						{starredLinks.map((link) => (
							<Nav.Item
								key={link.entryId}
								icon={<IcUnstar />}
								label={link.label}
								active={browsing && currentFolderId === link.entryId}
								href={link.href}
							/>
						))}
					</Nav.Section>
				)}
				{hasRooms && (
					<Nav.Section label={t('Rooms')}>
						<Nav.Item
							icon={<IcFilesApp />}
							label={t('All rooms')}
							active={browsing && allRooms}
							href={filesPath(base, { scope: 'all' })}
						/>
						{sortedRooms.map((r) => {
							const isActive = browsing && room === r.name
							const hint = roomTitleHint(r)
							return (
								<React.Fragment key={r.name}>
									<Nav.Item
										icon={<IcRoom />}
										label={
											<>
												~{r.name}
												{hint && <Text color="secondary"> {hint}</Text>}
											</>
										}
										active={isActive && !starredActive}
										onClick={() => onRoomChange(r.name)}
									/>
									{isActive && (
										<>
											<Nav.Item
												depth={1}
												icon={<IcRoom />}
												label={t('Room home')}
												active={false}
												href={roomsPath(base, r.name)}
											/>
											<Nav.Item
												depth={1}
												icon={<IcPost />}
												label={t('Posts')}
												active={false}
												href={feedPath(base, undefined, {
													room: r.name
												})}
											/>
										</>
									)}
								</React.Fragment>
							)
						})}
						<Nav.Item
							label={<Text color="secondary">{t('Room directory →')}</Text>}
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
