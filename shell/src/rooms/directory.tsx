// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { PorchEntry } from '@cloudillo/core'
import {
	Button,
	EmptyState,
	Fcd,
	HBox,
	IcAdd,
	List,
	ListItem,
	LoadingSpinner,
	roomTitleHint
} from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { IcRoom } from '../icons.js'
import { feedPath, filesPath, roomsPath } from '../routes.js'
import { useRoomsOutlet } from './layout.js'
import { useRoomActions } from './room-home.js'

/** `/<ctx>/rooms`: the context's porch, with open / mute / leave / ask-to-join per row. */
export function RoomsDirectory() {
	const { t } = useTranslation()
	const { idTag, base, rooms, error, reload, create } = useRoomsOutlet()
	const membershipActions = useRoomActions(idTag, rooms, reload)

	function rowActions(room: PorchEntry) {
		return (
			<HBox gap={1}>
				{room.status === 'in' && (
					<>
						<Button size="sm" href={feedPath(base, undefined, { room: room.name })}>
							{t('Open')}
						</Button>
						<Button
							size="sm"
							variant="ghost"
							href={filesPath(base, { room: room.name })}
						>
							{t('Files')}
						</Button>
					</>
				)}
				{membershipActions(room)}
			</HBox>
		)
	}

	let body: React.ReactNode
	if (!rooms && error) {
		body = (
			<EmptyState
				icon={<IcRoom />}
				title={t('Could not load rooms')}
				actions={<Button onClick={reload}>{t('Retry')}</Button>}
			/>
		)
	} else if (!rooms) {
		body = <LoadingSpinner />
	} else if (rooms.length === 0) {
		body = (
			<EmptyState
				icon={<IcRoom />}
				title={t('No rooms yet')}
				description={t('Rooms group posts and files for a subset of people.')}
				actions={
					create && (
						<Button color="primary" icon={<IcAdd />} onClick={create}>
							{t('Create a room')}
						</Button>
					)
				}
			/>
		)
	} else {
		body = (
			<List>
				{rooms.map((room) => {
					const hint = roomTitleHint(room)
					return (
						<ListItem
							key={room.name}
							leading={<IcRoom />}
							title={
								<Link to={roomsPath(base, room.name)}>
									{hint ?? `~${room.name}`}
								</Link>
							}
							subtitle={
								[hint && `~${room.name}`, room.descr].filter(Boolean).join(' · ') ||
								undefined
							}
							trailing={rowActions(room)}
						/>
					)
				})}
			</List>
		)
	}

	return <Fcd.Content width="wide">{body}</Fcd.Content>
}

// vim: ts=4
