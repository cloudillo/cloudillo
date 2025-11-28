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
import { useTranslation } from 'react-i18next'

import {
	LuTrash as IcDelete
} from 'react-icons/lu'

import { Profile } from '@cloudillo/types'

import { Select } from '../Select/index.js'
import { ProfileCard } from '../Profile/index.js'

export interface EditProfileListProps {
	className?: string
	placeholder?: string
	profiles?: Profile[]
	listProfiles: (q: string) => Promise<Profile[] | undefined>
	addProfile?: (profile: Profile) => Promise<void>
	removeProfile?: (idTag: string) => Promise<void>
}

export function EditProfileList({ className, placeholder, profiles, listProfiles, addProfile, removeProfile }: EditProfileListProps) {
	const [add, setAdd] = React.useState(false)
	const { t } = useTranslation()

	async function getData(q: string): Promise<Profile[] | undefined> {
		console.log('getData', q)
		if (!q) return []

		const list = await listProfiles(q)
		return list
	}

	function renderItem(profile: Profile) {
		return <ProfileCard profile={profile}/>
	}

	function onAdd(profile?: Profile) {
		return profile && addProfile?.(profile)
	}

	function onRemove(profile: Profile) {
		return profile && removeProfile?.(profile.idTag)
	}

	return <div className={className}>
		<Select placeholder={placeholder ?? t('Search user')} getData={getData} itemToId={i => i.idTag} itemToString={i => i?.idTag || ''} renderItem={renderItem} onSelectItem={onAdd}/>
		<div>
			{(profiles || []).map((profile, i) => (
				<button key={profile.idTag} className="c-link w-100 p-0 ps-1" onClick={() => onRemove(profile)}>
					<ProfileCard className="w-100" profile={profile}/>
					<IcDelete/>
				</button>
			))}
		</div>
	</div>
}

// vim: ts=4
