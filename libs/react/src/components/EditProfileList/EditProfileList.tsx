// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { useLibTranslation } from '../../i18n.js'

import { LuTrash as IcDelete } from 'react-icons/lu'

import type { Profile } from '@cloudillo/types'

import { Select } from '../Select/index.js'
import { ProfileCard } from '../Profile/index.js'

export interface EditProfileListProps {
	className?: string
	placeholder?: string
	profiles?: Profile[]
	listProfiles: (q: string) => Promise<Profile[] | undefined>
	addProfile?: (profile: Profile) => Promise<void>
	removeProfile?: (idTag: string) => Promise<void>
	confirmingRemove?: string | null
	onRequestRemove?: (idTag: string) => void
	onCancelRemove?: () => void
	onConfirmRemove?: (idTag: string) => void
	removeConfirmText?: string
}

export function EditProfileList({
	className,
	placeholder,
	profiles,
	listProfiles,
	addProfile,
	removeProfile,
	confirmingRemove,
	onRequestRemove,
	onCancelRemove,
	onConfirmRemove,
	removeConfirmText
}: EditProfileListProps) {
	const [_add, _setAdd] = React.useState(false)
	const { t } = useLibTranslation()

	// Use inline confirmation if the confirmation props are provided
	const useInlineConfirmation = onRequestRemove !== undefined

	async function getData(q: string): Promise<Profile[] | undefined> {
		console.log('getData', q)
		if (!q) return []

		const list = await listProfiles(q)
		return list
	}

	function renderItem(profile: Profile) {
		return <ProfileCard profile={profile} />
	}

	function onAdd(profile?: Profile) {
		return profile && addProfile?.(profile)
	}

	function onRemove(profile: Profile) {
		if (useInlineConfirmation) {
			onRequestRemove?.(profile.idTag)
		} else {
			removeProfile?.(profile.idTag)
		}
	}

	return (
		<div className={className}>
			<Select
				placeholder={placeholder ?? t('Search user')}
				getData={getData}
				itemToId={(i) => i.idTag}
				itemToString={(i) => i?.idTag || ''}
				renderItem={renderItem}
				onSelectItem={onAdd}
			/>
			<div>
				{(profiles || []).map((profile) =>
					confirmingRemove === profile.idTag ? (
						<div key={profile.idTag} className="c-hbox g-2 align-items-center p-1 ps-2">
							<span className="flex-fill text-small">
								{removeConfirmText ?? t('Remove access?')}
							</span>
							<button
								type="button"
								className="c-button small"
								onClick={onCancelRemove}
							>
								{t('Cancel')}
							</button>
							<button
								type="button"
								className="c-button small primary"
								onClick={() => onConfirmRemove?.(profile.idTag)}
							>
								{t('Remove')}
							</button>
						</div>
					) : (
						<button
							key={profile.idTag}
							type="button"
							className="c-link w-100 p-0 ps-1"
							onClick={() => onRemove(profile)}
						>
							<ProfileCard className="w-100" profile={profile} />
							<IcDelete />
						</button>
					)
				)}
			</div>
		</div>
	)
}

// vim: ts=4
