// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import {
	Button,
	Dialog,
	Field,
	Input,
	ProfileMultiSelect,
	TextArea,
	Toggle,
	useApi,
	useAuth,
	VBox
} from '@cloudillo/react'
import type { Profile } from '@cloudillo/types'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuPlus as IcNew } from 'react-icons/lu'

export function CreateGroupDialog({
	open,
	onClose,
	onCreated
}: {
	open: boolean
	onClose: () => void
	onCreated: (convId: string) => void
}) {
	const { t } = useTranslation()
	const { api } = useApi()
	const [auth] = useAuth()

	const [groupName, setGroupName] = React.useState('')
	const [groupDescription, setGroupDescription] = React.useState('')
	const [groupIsOpen, setGroupIsOpen] = React.useState(false)
	const [selectedMembers, setSelectedMembers] = React.useState<Profile[]>([])
	const [isCreatingGroup, setIsCreatingGroup] = React.useState(false)

	// Server-side typeahead source for ProfileSelect (connected people, self
	// excluded). The Select component debounces the query internally.
	async function listProfiles(q: string): Promise<Profile[] | undefined> {
		if (!api || !q) return []
		const profiles = await api.profiles.list({ q, connected: true, type: 'person' })
		return profiles?.filter((p) => p.idTag !== auth?.idTag)
	}

	async function handleCreateGroup() {
		if (!api || !auth || !groupName.trim()) return

		setIsCreatingGroup(true)
		try {
			const convAction = await api.actions.create({
				type: 'CONV',
				// 'O' flag marks the group as open (joinable without invitation);
				// closed groups omit flags (backend default_flags keeps them closed).
				flags: groupIsOpen ? 'O' : undefined,
				content: {
					name: groupName.trim(),
					description: groupDescription.trim() || undefined
				}
			})

			// Fire the invite POSTs in parallel; the per-invite try/catch keeps one
			// failure from aborting the rest.
			await Promise.all(
				selectedMembers.map(async (member) => {
					try {
						await api.actions.create({
							type: 'INVT',
							audienceTag: member.idTag,
							subject: convAction.actionId,
							content: {
								role: 'member',
								groupName: groupName.trim()
							}
						})
					} catch (err) {
						console.error('Failed to invite', member.idTag, err)
					}
				})
			)

			setGroupName('')
			setGroupDescription('')
			setGroupIsOpen(false)
			setSelectedMembers([])

			onCreated(convAction.actionId)
		} catch (err) {
			console.error('Failed to create group', err)
		} finally {
			setIsCreatingGroup(false)
		}
	}

	return (
		<Dialog
			open={open}
			onClose={onClose}
			size="sm"
			title={t('Create Group')}
			footer={
				<>
					<Button onClick={onClose}>{t('Cancel')}</Button>
					<Button
						color="primary"
						icon={<IcNew />}
						disabled={!groupName.trim()}
						loading={isCreatingGroup}
						onClick={handleCreateGroup}
					>
						{t('Create Group')}
					</Button>
				</>
			}
		>
			<VBox gap={3}>
				<Field label={t('Group Name')} required>
					<Input
						placeholder={t('Enter group name...')}
						value={groupName}
						onChange={(e) => setGroupName(e.target.value)}
						autoFocus
					/>
				</Field>

				<Field label={t('Description')}>
					<TextArea
						placeholder={t('Optional description...')}
						value={groupDescription}
						onChange={(e) => setGroupDescription(e.target.value)}
						rows={2}
					/>
				</Field>

				<Toggle
					checked={groupIsOpen}
					onChange={(e) => setGroupIsOpen(e.target.checked)}
					label={groupIsOpen ? t('Open group') : t('Closed group')}
					description={
						groupIsOpen
							? t('Anyone can join without invitation')
							: t('Members must be invited')
					}
				/>

				<Field label={t('Add Members')}>
					<ProfileMultiSelect
						placeholder={t('Search contacts...')}
						emptyText={t('Search for connections to add')}
						listProfiles={listProfiles}
						value={selectedMembers}
						onAdd={(p) => setSelectedMembers((prev) => [...prev, p])}
						onRemove={(p) =>
							setSelectedMembers((prev) => prev.filter((m) => m.idTag !== p.idTag))
						}
					/>
				</Field>
			</VBox>
		</Dialog>
	)
}

// vim: ts=4
