// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { Profile } from '@cloudillo/types'
import * as React from 'react'
import { LuX as IcClear } from 'react-icons/lu'

import { useLibTranslation } from '../../i18n.js'
import { Button } from '../Button/index.js'
import { Combobox } from '../Combobox/index.js'
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
				<div className="c-input">
					<div className="c-hbox g-2 align-items-center">
						<ProfileCard className="flex-fill" profile={value} />
						<Button
							variant="ghost"
							size="sm"
							icon={<IcClear />}
							aria-label={t('Clear')}
							onClick={() => onChange?.(undefined)}
						/>
					</div>
				</div>
			</div>
		)
	}

	return (
		<Combobox
			className={className}
			placeholder={placeholder ?? t('Search user')}
			getData={getData}
			itemToId={(i) => i.idTag}
			itemToString={(i) => i?.idTag || ''}
			renderItem={renderItem}
			onSelect={(profile) => onChange?.(profile)}
		/>
	)
}

// vim: ts=4
