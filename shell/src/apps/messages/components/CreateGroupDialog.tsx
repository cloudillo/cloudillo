// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import {
	Button,
	LoadingSpinner,
	Modal,
	ProfileMultiSelect,
	Toggle,
	useApi,
	useAuth
} from '@cloudillo/react'
import type { Profile } from '@cloudillo/types'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuX as IcClose, LuPlus as IcNew } from 'react-icons/lu'

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
		<Modal open={open} onClose={onClose} className="p-0">
			<div className="c-dialog c-panel emph p-4" style={{ maxWidth: '480px', width: '90vw' }}>
				<div className="c-hbox align-items-center mb-3">
					<h2 className="fill m-0">{t('Create Group')}</h2>
					<Button kind="link" onClick={onClose}>
						<IcClose />
					</Button>
				</div>

				<div className="c-vbox g-3">
					<div className="c-vbox g-1">
						<label className="fw-medium">{t('Group Name')} *</label>
						<input
							type="text"
							className="c-input"
							placeholder={t('Enter group name...')}
							value={groupName}
							onChange={(e) => setGroupName(e.target.value)}
							autoFocus
						/>
					</div>

					<div className="c-vbox g-1">
						<label className="fw-medium">{t('Description')}</label>
						<textarea
							className="c-input"
							placeholder={t('Optional description...')}
							value={groupDescription}
							onChange={(e) => setGroupDescription(e.target.value)}
							rows={2}
						/>
					</div>

					<div className="c-hbox align-items-center g-2">
						<Toggle
							checked={groupIsOpen}
							onChange={(e) => setGroupIsOpen(e.target.checked)}
						/>
						<div className="c-vbox">
							<span className="fw-medium">
								{groupIsOpen ? t('Open group') : t('Closed group')}
							</span>
							<span className="text-muted text-small">
								{groupIsOpen
									? t('Anyone can join without invitation')
									: t('Members must be invited')}
							</span>
						</div>
					</div>

					<div className="c-vbox g-1">
						<label className="fw-medium">{t('Add Members')}</label>
						<ProfileMultiSelect
							placeholder={t('Search contacts...')}
							emptyText={t('Search for connections to add')}
							listProfiles={listProfiles}
							value={selectedMembers}
							onAdd={(p) => setSelectedMembers((prev) => [...prev, p])}
							onRemove={(p) =>
								setSelectedMembers((prev) =>
									prev.filter((m) => m.idTag !== p.idTag)
								)
							}
						/>
					</div>
				</div>

				<div className="c-hbox justify-content-end g-2 mt-4">
					<Button onClick={onClose}>{t('Cancel')}</Button>
					<Button
						variant="primary"
						disabled={!groupName.trim() || isCreatingGroup}
						onClick={handleCreateGroup}
					>
						{isCreatingGroup ? (
							<LoadingSpinner size="sm" />
						) : (
							<>
								<IcNew className="me-1" />
								{t('Create Group')}
							</>
						)}
					</Button>
				</div>
			</div>
		</Modal>
	)
}

// vim: ts=4
