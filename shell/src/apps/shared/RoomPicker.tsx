// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import type { PorchEntry } from '@cloudillo/core'
import { Button, IcDropdown, Menu, MenuItem, makeChannel, Text, VBox } from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { useContextRolesFor } from '../../context/index.js'
import { IcRoom } from '../../icons.js'
import { usePorch } from '../../lib/porch.js'
import { floorText } from '../../profile/role-labels.js'

/** Rooms of `tenant` the viewer is already in — the only ones new content may go into. */
export function useEnterableRooms(tenant: string | undefined): PorchEntry[] {
	// The roles re-run the load once a context token lands.
	const { rooms } = usePorch(tenant, useContextRolesFor(tenant))
	return React.useMemo(() => (rooms ?? []).filter((r) => r.status === 'in'), [rooms])
}

export interface RoomPickerProps {
	tenant: string
	/** Absolute `@tenant~name`; undefined = open floor. */
	value?: string
	onChange: (channel: string | undefined) => void
	/** Pre-loaded `useEnterableRooms(tenant)`, when the caller needs the list too. */
	rooms?: PorchEntry[]
}

/** "~ Open floor ▾" picker plus a reach line; renders nothing when the tenant has no rooms for us. */
export function RoomPicker({ tenant, value, onChange, rooms: roomsProp }: RoomPickerProps) {
	const { t } = useTranslation()
	const loaded = useEnterableRooms(roomsProp ? undefined : tenant)
	const rooms = roomsProp ?? loaded
	if (!rooms.length) return null

	const current = rooms.find((r) => makeChannel(tenant, r.name) === value)
	const reach = current?.closed
		? t('Invited members only')
		: current?.minRole
			? floorText(t, current.minRole)
			: undefined

	return (
		<VBox gap={0}>
			<Menu
				trigger={
					<Button variant="link" aria-label={t('Room')}>
						<IcRoom />
						{current ? `~${current.title || current.name}` : t('~ Open floor')}
						<IcDropdown />
					</Button>
				}
			>
				<MenuItem label={t('~ Open floor')} onClick={() => onChange(undefined)} />
				{rooms.map((r) => (
					<MenuItem
						key={r.name}
						label={`~${r.title || r.name}`}
						onClick={() => onChange(makeChannel(tenant, r.name))}
					/>
				))}
			</Menu>
			{reach && (
				<Text size="sm" emphasis="muted">
					{reach}
				</Text>
			)}
		</VBox>
	)
}

// vim: ts=4
