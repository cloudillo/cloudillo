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
import { Routes, Route, Navigate, Link, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { atom, useAtom } from 'jotai'

import { Button } from '@cloudillo/react'

import { LuSearch as IcSearch } from 'react-icons/lu'

export interface SearchState {
	query?: string
}

const searchAtom = atom<SearchState>({})

export function useSearch() {
	return useAtom(searchAtom)
}

export function SearchIcon () {
	const [search, setSearch] = useSearch()

	return <IcSearch onClick={() => setSearch({ query: '' })}/>
}

export function SearchBar () {
	const { t } = useTranslation()
	const navigate = useNavigate()
	const [search, setSearch] = useSearch()

	async function onSubmit(evt: React.FormEvent) {
		evt.preventDefault()
		evt.stopPropagation()
		console.log('SEARCH', search)
		if (!search.query) {
			return
		} else if (search.query.match(/^\S+(\.\S+)+$/)) {
			setSearch({})
			navigate('/profile/' + search.query)
		}
	}

	return <form className="c-input-group" onSubmit={onSubmit}>
		<input className="c-input" type="text" autoFocus placeholder={t('Search')} value={search.query || ''} onChange={e => setSearch({ query: e.target.value })} />
		<Button className="c-button secondary" onClick={onSubmit}><SearchIcon/></Button>
	</form>
}

// vim: ts=4
