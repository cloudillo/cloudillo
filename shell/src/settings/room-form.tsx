// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { ApiClient, PorchEntry } from '@cloudillo/core'
import {
	ActionBar,
	Button,
	Field,
	Form,
	Input,
	NativeSelect,
	Text,
	TextArea,
	Toggle,
	useToast,
	VBox
} from '@cloudillo/react'
import { type CommunityRole, type Profile, ROLE_LEVELS, roleLevel } from '@cloudillo/types'
import type { TFunction } from 'i18next'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { useActiveCommunity } from '../context/index.js'
import { roleFloorLabels } from '../profile/role-labels.js'

/** The room settings `describeRoom` reads — a porch entry as moderators receive it. */
export type RoomSettings = Pick<PorchEntry, 'minRole' | 'visibility' | 'closed'>

const ROOM_NAME_RE = /^[a-z0-9][a-z0-9-]{0,63}$/

/** A room name from its title: lowercase ASCII, dashes, at most 64 characters. */
function slugify(title: string): string {
	return title
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+/, '')
		.slice(0, 64)
		.replace(/-+$/, '')
}

function seenText(t: TFunction, visibility: string | null | undefined): string {
	switch (visibility) {
		case 'P':
			return t('visible to everyone')
		case 'V':
			return t('visible to signed-in people')
		case 'F':
			return t('visible to followers')
		default:
			return t('hidden from people who cannot enter')
	}
}

function reachText(t: TFunction, minRole: string, count: number): string {
	switch (minRole) {
		case 'follower':
			return t('{{count}} people are followers or above', { count })
		case 'supporter':
			return t('{{count}} people are supporters or above', { count })
		case 'contributor':
			return t('{{count}} people are contributors or above', { count })
		case 'moderator':
			return t('{{count}} people are moderators or above', { count })
		default:
			return t('{{count}} people are leaders', { count })
	}
}

/**
 * A person tenant's followers and connections with the role they hold there — what the
 * "N people are …s or above" line counts. Undefined in a community context or while loading.
 */
function usePersonAudience(client: ApiClient): Profile[] | undefined {
	const community = useActiveCommunity()?.idTag
	const [people, setPeople] = React.useState<Profile[]>()

	React.useEffect(
		function loadAudience() {
			if (community) return
			let cancelled = false
			client.profiles
				.list({ type: 'person' })
				.then((ps) => {
					if (!cancelled)
						setPeople(
							(ps as Profile[]).filter((p) => p.connected === true || p.follower)
						)
				})
				.catch((err) => console.error('Failed to load connections', err))
			return () => {
				cancelled = true
			}
		},
		[client, community]
	)

	return community ? undefined : people
}

/** One-line summary of who can enter a room and who can see it exists. */
export function describeRoom(room: RoomSettings, t: TFunction): string {
	return [
		roleFloorLabels(t)[room.minRole as CommunityRole] ?? t('Anyone can enter'),
		room.closed ? t('invitation only') : undefined,
		seenText(t, room.visibility)
	]
		.filter(Boolean)
		.join(' · ')
}

interface RoomFormProps {
	/** The tenant's API client (the community's, or home for a person's own rooms) */
	client: ApiClient
	/** The room being edited; absent when creating one */
	room?: PorchEntry
	onSaved: (name: string) => void
	onCancel?: () => void
}

/** Create or edit a room. The name is chosen once, at create, and read-only afterwards. */
export function RoomForm({ client, room, onSaved, onCancel }: RoomFormProps) {
	const { t } = useTranslation()
	const toast = useToast()
	const [title, setTitle] = React.useState(room?.title ?? '')
	const [name, setName] = React.useState(room?.name ?? '')
	const [nameTouched, setNameTouched] = React.useState(!!room)
	const [descr, setDescr] = React.useState(room?.descr ?? '')
	const [minRole, setMinRole] = React.useState(room ? (room.minRole ?? '') : 'follower')
	const [closed, setClosed] = React.useState(room?.closed ?? false)
	const [visibility, setVisibility] = React.useState(room ? (room.visibility ?? '') : 'P')
	const [saving, setSaving] = React.useState(false)
	const audience = usePersonAudience(client)
	const reachCount =
		audience && minRole
			? audience.filter(
					(p) =>
						roleLevel(p.roles, ROLE_LEVELS.follower) >=
						ROLE_LEVELS[minRole as CommunityRole]
				).length
			: undefined

	const effectiveName = nameTouched ? name : slugify(title)
	const nameValid = ROOM_NAME_RE.test(effectiveName)
	const canSave = !!title.trim() && nameValid && !saving

	async function handleSubmit(evt: React.FormEvent) {
		evt.preventDefault()
		if (!canSave) return
		setSaving(true)
		const fields = {
			title: title.trim(),
			descr: descr.trim() || null,
			minRole: minRole || null,
			visibility: visibility || null,
			closed
		}
		try {
			if (room) {
				await client.channels.update(room.name, fields)
			} else {
				await client.channels.create({
					...fields,
					descr: fields.descr ?? undefined,
					name: effectiveName
				})
			}
			onSaved(effectiveName)
		} catch (err) {
			console.error('Failed to save room:', err)
			toast.error(t('Failed to save room'))
		} finally {
			setSaving(false)
		}
	}

	return (
		<Form onSubmit={handleSubmit}>
			<VBox gap={3}>
				<Field label={t('Title')} required>
					<Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
				</Field>

				<Field
					label={t('Name')}
					hint={
						room
							? t("Can't be changed later")
							: t('Lowercase letters, digits and dashes')
					}
					error={
						!room && (effectiveName || title.trim()) && !nameValid
							? t('Invalid room name')
							: undefined
					}
				>
					<Input
						value={`~${effectiveName}`}
						readOnly={!!room}
						onChange={(e) => {
							setNameTouched(true)
							setName(e.target.value.replace(/^~/, ''))
						}}
					/>
				</Field>

				<Field label={t('Description')}>
					<TextArea rows={2} value={descr} onChange={(e) => setDescr(e.target.value)} />
				</Field>

				<Field label={t('Who can enter')}>
					<NativeSelect value={minRole} onChange={(e) => setMinRole(e.target.value)}>
						<option value="">{t('Anyone')}</option>
						{Object.entries(roleFloorLabels(t)).map(([role, label]) => (
							<option key={role} value={role}>
								{label}
							</option>
						))}
					</NativeSelect>
				</Field>
				{reachCount !== undefined && (
					<Text as="p" emphasis="muted">
						{reachText(t, minRole, reachCount)}
					</Text>
				)}

				<Toggle
					color="primary"
					checked={closed}
					onChange={(e) => setClosed(e.target.checked)}
					label={t('Invitation only')}
					description={t('People must be invited or have their request approved.')}
				/>

				<Field label={t('Who can see this room exists')}>
					<NativeSelect
						value={visibility}
						onChange={(e) => setVisibility(e.target.value)}
					>
						<option value="P">{t('Everyone')}</option>
						<option value="V">{t('Signed-in people')}</option>
						<option value="F">{t('Followers')}</option>
						<option value="">{t('Only people who can enter')}</option>
					</NativeSelect>
				</Field>

				<Text as="p" emphasis="muted">
					{describeRoom(
						{ minRole: minRole || null, visibility: visibility || null, closed },
						t
					)}
				</Text>

				<ActionBar>
					{onCancel && <Button onClick={onCancel}>{t('Cancel')}</Button>}
					<Button type="submit" color="primary" disabled={!canSave}>
						{room ? t('Save') : t('Create room')}
					</Button>
				</ActionBar>
			</VBox>
		</Form>
	)
}

// vim: ts=4
