// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import {
	Button,
	Field,
	HBox,
	NativeSelect,
	Panel,
	Text,
	useAuth,
	useDialog,
	VBox
} from '@cloudillo/react'
import { useAtomValue } from 'jotai'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { activeContextAtom, isContextLeader, useContextAwareApi, useCtx } from '../context/index.js'
import { roomsPath } from '../routes.js'

const CREATE_ROLE_KEY = 'room.create_role'

/**
 * `settings/rooms`: the room policy ("who can create rooms") and a link to the rooms section.
 * The setting is `PermissionLevel::User` (owner / leader+), so moderators — who may open this
 * page — see the link only. Read and written through `useContextAwareApi()` like
 * `files.tsx`'s `search.store_text`, so both stay on the active context's tenant.
 */
export function RoomsSettings() {
	const { t } = useTranslation()
	const base = useCtx().base
	const [auth] = useAuth()
	const activeContext = useAtomValue(activeContextAtom)
	const { api: contextApi } = useContextAwareApi()
	const dialog = useDialog()
	const canEdit = isContextLeader(activeContext, auth?.idTag)
	const [createRole, setCreateRole] = React.useState<string>()

	React.useEffect(
		function loadCreateRole() {
			setCreateRole(undefined)
			if (!contextApi || !canEdit) return
			let cancelled = false
			contextApi.settings
				.get(CREATE_ROLE_KEY)
				.then((res) => {
					if (!cancelled) setCreateRole(String(res.value ?? 'moderator'))
				})
				.catch((err) => {
					console.error(`Failed to load ${CREATE_ROLE_KEY}:`, err)
					// The backend default; a save still goes through
					if (!cancelled) setCreateRole('moderator')
				})
			return () => {
				cancelled = true
			}
		},
		[contextApi, canEdit]
	)

	async function onChange(evt: React.ChangeEvent<HTMLSelectElement>) {
		const next = evt.target.value
		const prev = createRole
		if (!contextApi) return
		setCreateRole(next)
		try {
			await contextApi.settings.update(CREATE_ROLE_KEY, { value: next })
		} catch (err: unknown) {
			setCreateRole(prev)
			if (err instanceof Error) await dialog.tell(t('Error'), err.message)
		}
	}

	return (
		<Panel padding={3}>
			<VBox gap={3}>
				{canEdit ? (
					<Field orientation="horizontal" label={t('Who can create rooms')}>
						<NativeSelect
							name={CREATE_ROLE_KEY}
							value={createRole ?? 'moderator'}
							disabled={createRole === undefined}
							onChange={onChange}
						>
							{/* `supporter` is the lowest role the backend accepts here */}
							<option value="moderator">{t('Moderators')}</option>
							<option value="supporter">{t('Any member')}</option>
						</NativeSelect>
					</Field>
				) : (
					<Text as="p" emphasis="muted">
						{t('Only leaders can change who can create rooms.')}
					</Text>
				)}
				{canEdit ? (
					<Link to={roomsPath(base)}>{t('Manage rooms →')}</Link>
				) : (
					<HBox>
						<Button color="primary" href={roomsPath(base)}>
							{t('Create or manage rooms')}
						</Button>
					</HBox>
				)}
			</VBox>
		</Panel>
	)
}

// vim: ts=4
