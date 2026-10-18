// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { ApiClient, PorchEntry } from '@cloudillo/core'
import {
	Button,
	Dialog,
	DocBar,
	Fcd,
	IcAdd,
	Nav,
	Text,
	useApi,
	useAuth,
	useIsMobile,
	useToast
} from '@cloudillo/react'
import { ROLE_LEVELS, roleLevel } from '@cloudillo/types'
import { useAtom } from 'jotai'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { Outlet, useLocation, useNavigate, useOutletContext, useParams } from 'react-router-dom'

import {
	activeContextAtom,
	canAdminContext,
	useActiveCommunity,
	useApiContext,
	useContextRolesFor,
	useCtx
} from '../context/index.js'
import { IcFeed, IcFiles, IcRoom } from '../icons.js'
import { usePorch } from '../lib/porch.js'
import { type CtxBase, ctxBase, feedPath, filesPath, roomsPath } from '../routes.js'
import { RoomForm } from '../settings/room-form.js'
import { DrawerToggle } from '../ui/DrawerToggle.js'

export interface RoomsOutlet {
	idTag: string | undefined
	base: CtxBase
	rooms: PorchEntry[] | undefined
	error: boolean
	reload: () => void
	communityRoles: string[] | undefined
	/** Opens the "New room" dialog; `undefined` when the viewer may not create rooms here. */
	create: (() => void) | undefined
}

/** The porch and context `RoomsLayout` loaded once for the directory and each room home. */
export function useRoomsOutlet() {
	return useOutletContext<RoomsOutlet>()
}

/**
 * The API client of the tenant whose rooms are administered: the active community's (through
 * its context token), or the home client for a person's own rooms. Null while no token exists,
 * or when the user may not administer the community's rooms.
 */
export function useRoomsClient(): ApiClient | null {
	const { api } = useApi()
	const [auth] = useAuth()
	const community = useActiveCommunity()
	const { getClientFor } = useApiContext()
	const communityIdTag = community?.idTag
	const allowed = !community || canAdminContext(community, auth?.idTag, 'rooms')

	return React.useMemo(() => {
		if (!allowed) return null
		if (!communityIdTag) return api ?? null
		return getClientFor(communityIdTag, { explicit: true })
	}, [allowed, communityIdTag, api, getClientFor])
}

/** The idTag of the tenant whose rooms are administered: the active community, or the user. */
export function useRoomsTenant(): string | undefined {
	const [auth] = useAuth()
	return useActiveCommunity()?.idTag ?? auth?.idTag
}

/** Whether the viewer may create rooms on `idTag`: their own tenant, or a community they moderate. */
export function useCanCreateRooms(idTag: string | undefined, communityRoles?: string[]): boolean {
	const [auth] = useAuth()
	const [activeContext] = useAtom(activeContextAtom)
	if (!auth?.idTag || !idTag) return false
	if (auth.idTag === idTag) return true
	if (activeContext?.idTag === idTag) return canAdminContext(activeContext, auth.idTag, 'rooms')
	return roleLevel(communityRoles) >= ROLE_LEVELS.moderator
}

/** `/<ctx>/rooms/*`: a rail of the rooms I'm in beside the directory or a room home. */
export function RoomsLayout() {
	const { t } = useTranslation()
	const [auth] = useAuth()
	const ctx = useCtx()
	const location = useLocation()
	const { name } = useParams()
	const me = auth?.idTag
	// `/~` carries no idTag: the home context is the user's own tenant
	const idTag = ctx.idTag ?? me
	const communityRoles = useContextRolesFor(ctx.idTag)
	const { rooms, error, reload } = usePorch(idTag, communityRoles)
	const base = idTag ? ctxBase(idTag, me) : ctx.base
	const mine = React.useMemo(
		() => rooms?.filter((r) => r.status === 'in').sort((a, b) => a.name.localeCompare(b.name)),
		[rooms]
	)
	const viewing = name && rooms?.find((r) => r.name === name && r.status !== 'in')
	const room = name ? rooms?.find((r) => r.name === name) : undefined
	const toast = useToast()
	const navigate = useNavigate()
	const isMobile = useIsMobile()
	const canCreate = useCanCreateRooms(idTag, communityRoles)
	const roomsClient = useRoomsClient()
	const tenant = useRoomsTenant()
	// `useRoomsClient` follows the active context, which can lag behind the URL's tenant
	const client = idTag && tenant === idTag ? roomsClient : null
	const [creating, setCreating] = React.useState(false)
	// A room just created: open its home once the reloaded porch lists it
	const [created, setCreated] = React.useState<string>()
	const [showFilter, setShowFilter] = React.useState(false)
	// Close the mobile rail drawer once a room is picked
	const [filterPath, setFilterPath] = React.useState(location.pathname)
	if (filterPath !== location.pathname) {
		setFilterPath(location.pathname)
		setShowFilter(false)
	}

	React.useEffect(
		function openCreatedRoom() {
			const room = created ? rooms?.find((r) => r.name === created) : undefined
			if (!room) return
			setCreated(undefined)
			navigate(roomsPath(base, room.name))
		},
		[created, rooms, base, navigate]
	)

	function roomItem(room: PorchEntry) {
		const active = room.name === name
		return (
			<React.Fragment key={room.name}>
				<Nav.Item
					icon={<IcRoom />}
					label={
						<>
							~{room.name}
							{room.title && <Text color="secondary"> {room.title}</Text>}
						</>
					}
					active={active}
					href={roomsPath(base, room.name)}
				/>
				{active && room.status === 'in' && (
					<>
						<Nav.Item
							depth={1}
							icon={<IcFeed />}
							label={t('Posts')}
							active={false}
							href={feedPath(base, undefined, { room: room.name })}
						/>
						<Nav.Item
							depth={1}
							icon={<IcFiles />}
							label={t('Files')}
							active={false}
							href={filesPath(base, { drive: room.name })}
						/>
					</>
				)}
			</React.Fragment>
		)
	}

	const create = canCreate && client ? () => setCreating(true) : undefined
	const outlet: RoomsOutlet = { idTag, base, rooms, error, reload, communityRoles, create }

	let actions: React.ReactNode
	if (name && room?.status === 'in') {
		actions = (
			<>
				<Button
					variant="ghost"
					icon={<IcFeed />}
					aria-label={isMobile ? t('Posts') : undefined}
					href={feedPath(base, undefined, { room: name })}
				>
					{!isMobile && t('Posts')}
				</Button>
				<Button
					variant="ghost"
					icon={<IcFiles />}
					aria-label={isMobile ? t('Files') : undefined}
					href={filesPath(base, { drive: name })}
				>
					{!isMobile && t('Files')}
				</Button>
			</>
		)
	} else if (!name && create) {
		actions = (
			<Button
				color="primary"
				icon={<IcAdd />}
				aria-label={isMobile ? t('Create a room') : undefined}
				onClick={create}
			>
				{!isMobile && t('Create a room')}
			</Button>
		)
	}

	return (
		<Fcd.Container
			className="g-1"
			bar={
				<DocBar
					title={t('Rooms')}
					state="ready"
					start={<DrawerToggle nav onClick={() => setShowFilter(true)} />}
					sub={name ? { label: room?.title || `~${name}`, icon: <IcRoom /> } : undefined}
				>
					{actions}
				</DocBar>
			}
		>
			<Fcd.Filter isVisible={showFilter} hide={() => setShowFilter(false)}>
				<Nav aria-label={t('Rooms')}>
					<Nav.Item
						icon={<IcRoom />}
						label={t('All rooms')}
						active={!name}
						href={roomsPath(base)}
					/>
					{!!mine?.length && (
						<Nav.Section label={t('Your rooms')}>{mine.map(roomItem)}</Nav.Section>
					)}
					{viewing && <Nav.Section label={t('Viewing')}>{roomItem(viewing)}</Nav.Section>}
				</Nav>
			</Fcd.Filter>
			<Outlet context={outlet} />
			{client && (
				<Dialog
					open={creating}
					onClose={() => setCreating(false)}
					size="sm"
					title={t('New room')}
				>
					{creating && (
						<RoomForm
							client={client}
							onCancel={() => setCreating(false)}
							onSaved={(name) => {
								setCreating(false)
								setCreated(name)
								reload()
								toast.success(t('Room created'))
							}}
						/>
					)}
				</Dialog>
			)}
		</Fcd.Container>
	)
}

// vim: ts=4
