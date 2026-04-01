// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { useLibTranslation } from '../../i18n.js'

import { LuX as IcClear } from 'react-icons/lu'

import type { Profile } from '@cloudillo/types'

import { Select } from '../Select/index.js'
import { ProfileCard } from '../Profile/index.js'

export interface ProfileSelectProps {
	className?: string
	placeholder?: string
	listProfiles: (q: string) => Promise<Profile[] | undefined>
	value?: Profile
	onChange?: (profile: Profile | undefined) => void
}

export function ProfileSelect({
	className,
	placeholder,
	listProfiles,
	value,
	onChange
}: ProfileSelectProps) {
	const { t } = useLibTranslation()

	async function getData(q: string): Promise<Profile[] | undefined> {
		if (!q) return []
		return listProfiles(q)
	}

	function renderItem(profile: Profile) {
		return <ProfileCard profile={profile} />
	}

	if (value) {
		return (
			<div className={className}>
				<div className="c-hbox g-2 align-items-center c-input">
					<ProfileCard className="flex-fill" profile={value} />
					<button
						type="button"
						className="c-link p-1"
						onClick={() => onChange?.(undefined)}
						aria-label={t('Clear')}
					>
						<IcClear />
					</button>
				</div>
			</div>
		)
	}

	return (
		<Select
			className={className}
			placeholder={placeholder ?? t('Search user')}
			getData={getData}
			itemToId={(i) => i.idTag}
			itemToString={(i) => i?.idTag || ''}
			renderItem={renderItem}
			onSelectItem={(profile) => profile && onChange?.(profile)}
		/>
	)
}

// vim: ts=4
