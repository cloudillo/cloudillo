// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { useInfiniteScroll } from '@cloudillo/react'
import type { ContactListItem, AddressBookOutput } from '@cloudillo/core'
import { useContextAwareApi } from '../../../context/index.js'
import type { AddressBookSelection } from '../types.js'

const PAGE_SIZE = 50

export interface UseContactListOptions {
	selection: AddressBookSelection
	addressBooks: AddressBookOutput[]
	searchQuery?: string
}

export interface ListedContact extends ContactListItem {
	/** Source address-book name (set in 'all' mode for grouping/labels). */
	bookName?: string
}

export function useContactList(options: UseContactListOptions) {
	const { api } = useContextAwareApi()
	const { selection, addressBooks, searchQuery } = options
	const trimmedSearch = searchQuery?.trim() || undefined
	const [refreshCounter, setRefreshCounter] = React.useState(0)

	const fetchPage = React.useCallback(
		async function fetchPage(cursor: string | null, limit: number) {
			if (!api) {
				return { items: [] as ListedContact[], nextCursor: null, hasMore: false }
			}

			if (selection === 'all') {
				const result = await api.contacts.listAllContacts({
					cursor: cursor ?? undefined,
					q: trimmedSearch,
					limit
				})
				const bookMap = new Map(addressBooks.map((b) => [b.abId, b.name]))
				return {
					items: result.data.map((c) => ({
						...c,
						bookName: bookMap.get(c.abId)
					})) as ListedContact[],
					nextCursor: result.meta.cursorPagination?.nextCursor ?? null,
					hasMore: result.meta.cursorPagination?.hasMore ?? false
				}
			}

			const result = await api.contacts.listContacts(selection, {
				cursor: cursor ?? undefined,
				q: trimmedSearch,
				limit
			})
			return {
				items: result.data as ListedContact[],
				nextCursor: result.meta.cursorPagination?.nextCursor ?? null,
				hasMore: result.meta.cursorPagination?.hasMore ?? false
			}
		},
		[api, selection, addressBooks, trimmedSearch]
	)

	const { items, isLoading, isLoadingMore, error, hasMore, loadMore, reset, sentinelRef } =
		useInfiniteScroll<ListedContact>({
			fetchPage,
			pageSize: PAGE_SIZE,
			deps: [selection, trimmedSearch, refreshCounter],
			enabled: !!api && (selection !== 'all' || addressBooks.length > 0)
		})

	const refresh = React.useCallback(function refresh() {
		setRefreshCounter((c) => c + 1)
	}, [])

	return {
		contacts: items,
		isLoading,
		isLoadingMore,
		error,
		hasMore,
		loadMore,
		reset,
		refresh,
		sentinelRef
	}
}

// vim: ts=4
