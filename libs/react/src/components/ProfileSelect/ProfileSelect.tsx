// This file is part of the Cloudillo Platform.
// Copyright (C) 2024  Szilárd Hajba
//
// Cloudillo is free software: you can redistribute it and/or modify
// it under the terms of the GNU Lesser General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Lesser General Public License for more details.
//
// You should have received a copy of the GNU Lesser General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

import * as React from 'react'
import { useLibTranslation } from '../../i18n.js'

import { LuX as IcClear } from 'react-icons/lu'

import { Profile } from '@cloudillo/types'

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
