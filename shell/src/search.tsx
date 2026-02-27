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

import { Button, mergeClasses, useAuth } from '@cloudillo/react'

import { useCurrentContextIdTag } from './context/index.js'

import { LuSearch as IcSearch, LuX as IcCancel } from 'react-icons/lu'

export interface SearchState {
	query?: string
}

const searchAtom = atom<SearchState>({})

export function useSearch() {
	return useAtom(searchAtom)
}

export function SearchIcon() {
	const [search, setSearch] = useSearch()

	return <IcSearch onClick={() => setSearch({ query: '' })} />
}

export function SearchBar({ className }: { className?: string }) {
	const { t } = useTranslation()
	const navigate = useNavigate()
	const [auth] = useAuth()
	const [search, setSearch] = useSearch()
	const contextIdTag = useCurrentContextIdTag()
	const [validationError, setValidationError] = React.useState<string | null>(null)

	const isValidIdTag = (query: string) => /^\S+(\.\S+)+$/.test(query)

	async function onSubmit(evt: React.FormEvent) {
		evt.preventDefault()
		evt.stopPropagation()
		if (!search.query) {
			return
		} else if (isValidIdTag(search.query)) {
			const idTag = (
				search.query.startsWith('@') ? search.query.slice(1) : search.query
			).toLowerCase()
			setValidationError(null)
			setSearch({})
			navigate(`/profile/${contextIdTag || auth?.idTag}/${idTag}`)
		} else {
			setValidationError(t('Enter an Identity Tag (e.g. user.example.com)'))
		}
	}

	function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
		setSearch({ query: e.target.value })
		if (validationError) setValidationError(null)
	}

	return (
		<div className={mergeClasses('c-vbox', className)}>
			<form className="c-input-group" onSubmit={onSubmit}>
				<input
					className="c-input"
					type="text"
					autoFocus
					aria-label={t('Search for users by Identity Tag')}
					aria-invalid={!!validationError}
					aria-describedby={validationError ? 'search-error' : undefined}
					placeholder={t('Type an Identity Tag (e.g. user.example.com)')}
					value={search.query || ''}
					onChange={handleChange}
				/>
				<Button
					className="icon"
					onClick={() => setSearch({})}
					aria-label={t('Close search')}
				>
					<IcCancel />
				</Button>
				<Button className="icon primary" onClick={onSubmit} aria-label={t('Search')}>
					<IcSearch />
				</Button>
			</form>
			{validationError && (
				<span id="search-error" className="small text-error mt-1" role="alert">
					{validationError}
				</span>
			)}
		</div>
	)
}

// vim: ts=4
