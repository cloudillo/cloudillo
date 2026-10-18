// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { type ApiClient, FetchError, type PorchEntry } from '@cloudillo/core'
import { Button, Panel, Text, useDialog, useToast, VBox } from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import { type CtxBase, filesPath, roomsPath } from '../routes.js'
import { RoomForm } from '../settings/room-form.js'

interface RoomSettingsTabProps {
	/** The room tenant's admin client (`useRoomsClient`) */
	client: ApiClient
	tenant: string
	/** The admin's porch entry (carries `visibility`, `minRole`, `closed`) */
	room: PorchEntry
	base: CtxBase
	/** After a save: reload the porch */
	onChanged: () => void
}

/** The room home's Settings tab (admins only): edit the room; delete it at the bottom. */
export function RoomSettingsTab({ client, tenant, room, base, onChanged }: RoomSettingsTabProps) {
	const { t } = useTranslation()
	const navigate = useNavigate()
	const dialog = useDialog()
	const toast = useToast()

	async function handleDelete() {
		const confirmed = await dialog.confirm(
			t('Delete room'),
			t('Content stays but becomes readable only by {{tenant}}.', { tenant }),
			{ color: 'error', confirmLabel: t('Delete') }
		)
		if (!confirmed) return
		try {
			await client.channels.delete(room.name)
			navigate(roomsPath(base))
		} catch (err) {
			const fileCount =
				err instanceof FetchError && err.apiErrorCode === 'E-CORE-CONFLICT'
					? (err.details as { fileCount?: number } | undefined)?.fileCount
					: undefined
			if (fileCount === undefined) {
				console.error('Failed to delete room:', err)
				toast.error(t('Failed to delete room'))
				return
			}
			const name = room.name
			toast.error(
				t('~{{room}} still has {{count}} files. Move or delete them first.', {
					room: name,
					count: fileCount
				}),
				{
					actions: (
						<Button
							size="sm"
							onClick={() => navigate(filesPath(base, { drive: name }))}
						>
							{t('Open files')}
						</Button>
					)
				}
			)
		}
	}

	return (
		<VBox gap={3}>
			<Panel padding={3}>
				<RoomForm
					key={room.name}
					client={client}
					room={room}
					onCancel={() => navigate(roomsPath(base, room.name))}
					onSaved={() => {
						toast.success(t('Room saved'))
						onChanged()
					}}
				/>
			</Panel>

			<Panel
				padding={3}
				color="error"
				title={t('Delete room')}
				headingLevel={4}
				className="mt-4"
			>
				<Text as="p" emphasis="muted" className="mb-2">
					{t('Content stays but becomes readable only by {{tenant}}.', { tenant })}
				</Text>
				<Button color="error" onClick={handleDelete}>
					{t('Delete room')}
				</Button>
			</Panel>
		</VBox>
	)
}

// vim: ts=4
