// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import type { AddressBookOutput, AddressBookCreate, AddressBookPatch } from '@cloudillo/core'
import { useContextAwareApi } from '../../../context/index.js'

export interface UseAddressBooksResult {
	addressBooks: AddressBookOutput[]
	isLoading: boolean
	error: Error | null
	refresh: () => void
	create: (data: AddressBookCreate) => Promise<AddressBookOutput | undefined>
	update: (abId: number, data: AddressBookPatch) => Promise<AddressBookOutput | undefined>
	remove: (abId: number) => Promise<void>
}

export function useAddressBooks(): UseAddressBooksResult {
	const { api } = useContextAwareApi()
	const [addressBooks, setAddressBooks] = React.useState<AddressBookOutput[]>([])
	const [isLoading, setIsLoading] = React.useState(false)
	const [error, setError] = React.useState<Error | null>(null)
	const [refreshCounter, setRefreshCounter] = React.useState(0)

	React.useEffect(
		function loadAddressBooks() {
			if (!api) return
			let cancelled = false
			setIsLoading(true)
			setError(null)
			api.contacts
				.listAddressBooks()
				.then((list) => {
					if (cancelled) return
					setAddressBooks(list)
				})
				.catch((err) => {
					if (cancelled) return
					setError(err instanceof Error ? err : new Error(String(err)))
				})
				.finally(() => {
					if (!cancelled) setIsLoading(false)
				})
			return () => {
				cancelled = true
			}
		},
		[api, refreshCounter]
	)

	const refresh = React.useCallback(function refresh() {
		setRefreshCounter((c) => c + 1)
	}, [])

	const create = React.useCallback(
		async function create(data: AddressBookCreate) {
			if (!api) return undefined
			const created = await api.contacts.createAddressBook(data)
			refresh()
			return created
		},
		[api, refresh]
	)

	const update = React.useCallback(
		async function update(abId: number, data: AddressBookPatch) {
			if (!api) return undefined
			const updated = await api.contacts.updateAddressBook(abId, data)
			refresh()
			return updated
		},
		[api, refresh]
	)

	const remove = React.useCallback(
		async function remove(abId: number) {
			if (!api) return
			await api.contacts.deleteAddressBook(abId)
			refresh()
		},
		[api, refresh]
	)

	return { addressBooks, isLoading, error, refresh, create, remove, update }
}

// vim: ts=4
