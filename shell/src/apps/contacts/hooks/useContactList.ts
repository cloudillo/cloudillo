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

/** Hard ceiling for 'all' mode drain — protects the UI if a book is huge.
 *
 *  Caveat: 'all' mode iterates books in listAddressBooks order and sorts the
 *  drained buffer client-side by `fn`. Once the ceiling is hit, any names
 *  that would have sorted earlier but live in a later, not-yet-iterated book
 *  are silently omitted (we only surface a "truncated" banner). If contact
 *  counts outgrow 2000, switch to a server-side aggregated endpoint or a
 *  progressive per-book cursor strategy that yields pages through
 *  useInfiniteScroll rather than draining in one fetchPage call.
 *
 *  TODO(contacts): the banner tells users to pick a specific book but doesn't
 *  indicate *which* book holds the missing rows — replace with a real paging
 *  strategy once tested against a user with >2000 contacts. */
const ALL_MODE_MAX_ITEMS = 2000

/**
 * Cursor-paginated contact list. In 'all' mode this drains every address
 * book up to ALL_MODE_MAX_ITEMS total *within a single fetchPage invocation*,
 * then reports hasMore=false — so the useInfiniteScroll sentinel never fires.
 * Beyond the cap, switch to a specific book. See ALL_MODE_MAX_ITEMS above.
 */
export function useContactList(options: UseContactListOptions) {
	const { api } = useContextAwareApi()
	const { selection, addressBooks, searchQuery } = options
	const trimmedSearch = searchQuery?.trim() || undefined
	const [refreshCounter, setRefreshCounter] = React.useState(0)
	const [truncated, setTruncated] = React.useState(false)

	const fetchPage = React.useCallback(
		async function fetchPage(cursor: string | null, limit: number) {
			if (!api) {
				setTruncated(false)
				return { items: [] as ListedContact[], nextCursor: null, hasMore: false }
			}

			if (selection === 'all') {
				const items: ListedContact[] = []
				let wasTruncated = false
				outer: for (const book of addressBooks) {
					let bookCursor: string | undefined
					do {
						const result = await api.contacts.listContacts(book.abId, {
							q: trimmedSearch,
							limit,
							cursor: bookCursor
						})
						for (const item of result.data) {
							items.push({ ...item, bookName: book.name })
							if (items.length >= ALL_MODE_MAX_ITEMS) {
								wasTruncated = true
								break outer
							}
						}
						bookCursor = result.meta.cursorPagination?.hasMore
							? (result.meta.cursorPagination.nextCursor ?? undefined)
							: undefined
					} while (bookCursor)
				}
				items.sort((a, b) => (a.fn || '').localeCompare(b.fn || ''))
				setTruncated(wasTruncated)
				return { items, nextCursor: null, hasMore: false }
			}

			setTruncated(false)

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

	const addressBooksKey = addressBooks.map((b) => b.abId).join(',')

	const { items, isLoading, isLoadingMore, error, hasMore, loadMore, reset, sentinelRef } =
		useInfiniteScroll<ListedContact>({
			fetchPage,
			pageSize: PAGE_SIZE,
			deps: [selection, trimmedSearch, addressBooksKey, refreshCounter],
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
		sentinelRef,
		/** True when 'all' mode hit the drain ceiling and some contacts were omitted. */
		truncated,
		/** The ceiling applied in 'all' mode — exposed so the UI can show the number. */
		truncationLimit: ALL_MODE_MAX_ITEMS
	}
}

// vim: ts=4
