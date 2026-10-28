// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import {
	Alert,
	Button,
	EmptyState,
	HBox,
	Highlight,
	IcClose,
	IcSearch,
	List,
	ListItem,
	LoadingSpinner,
	SearchInput,
	Text,
	TimeFormat,
	useApi,
	VBox
} from '@cloudillo/react'
import type { SearchHit } from '@cloudillo/types'
import { atom, useAtom } from 'jotai'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

/**
 * In-conversation search. The header field (`ConversationView`) and these
 * results (`DetailsPanel`) are siblings under `MessagesApp`, so they share this atom:
 * set = search mode for that conversation, unset = the normal header.
 */
export const convSearchAtom = atom<{ convId: string; q: string } | undefined>(undefined)

/** Search state of one conversation: `open` starts search mode, `close` restores the header */
export function useConvSearch(convId: string | undefined) {
	const [search, setSearch] = useAtom(convSearchAtom)
	const active = !!convId && search?.convId === convId
	return {
		active,
		q: active ? (search?.q ?? '') : '',
		open: React.useCallback(() => {
			if (convId) setSearch((s) => (s?.convId === convId ? s : { convId, q: '' }))
		}, [convId, setSearch]),
		setQ: React.useCallback(
			(q: string) => {
				if (convId) setSearch({ convId, q })
			},
			[convId, setSearch]
		),
		close: React.useCallback(() => setSearch(undefined), [setSearch])
	}
}

/** The search field, shared by the header and the results panel; Esc closes search mode */
export function ConvSearchField({ convId, autoFocus }: { convId: string; autoFocus?: boolean }) {
	const { t } = useTranslation()
	const { q, setQ, close } = useConvSearch(convId)
	return (
		<HBox gap={1} align="center" className="flex-fill">
			<SearchInput
				className="flex-fill"
				value={q}
				autoFocus={autoFocus}
				placeholder={t('Search in this conversation')}
				aria-label={t('Search in this conversation')}
				onChange={(e) => setQ(e.target.value)}
				onKeyDown={(e) => {
					if (e.key === 'Escape') close()
				}}
			/>
			<Button
				variant="ghost"
				icon={<IcClose />}
				aria-label={t('Close search')}
				onClick={close}
			/>
		</HBox>
	)
}

export interface SearchResultsProps {
	convId: string
	/** Jump to the hit's message (search hits carry no createdAt) */
	onJump: (actionId: string) => void
}

const SEARCH_DEBOUNCE_MS = 300

/** Message hits of `GET /api/search?conv=`, the term highlighted */
export function SearchResults({ convId, onJump }: SearchResultsProps) {
	const { t } = useTranslation()
	const { api } = useApi()
	const { q } = useConvSearch(convId)
	const query = q.trim()
	const [hits, setHits] = React.useState<SearchHit[]>()
	const [error, setError] = React.useState(false)

	// Deps: re-run on every edit, debounced; the previous request is aborted
	React.useEffect(() => {
		setHits(undefined)
		setError(false)
		if (!api || !query) return
		const ctrl = new AbortController()
		const timer = setTimeout(() => {
			api.search
				.query({ q: query, conv: convId, type: 'action' }, { signal: ctrl.signal })
				.then(setHits)
				.catch((err) => {
					if (ctrl.signal.aborted) return
					console.error('Conversation search failed', err)
					setError(true)
				})
		}, SEARCH_DEBOUNCE_MS)
		return () => {
			clearTimeout(timer)
			ctrl.abort()
		}
	}, [api, convId, query])

	return (
		<VBox gap={2} className="p-2">
			<ConvSearchField convId={convId} />
			{!query ? (
				<EmptyState
					icon={<IcSearch />}
					title={t('Search messages')}
					description={t('Type to find messages in this conversation.')}
				/>
			) : error ? (
				<Alert color="error">{t('Search failed. Try again.')}</Alert>
			) : hits === undefined ? (
				<LoadingSpinner />
			) : hits.length === 0 ? (
				<EmptyState
					icon={<IcSearch />}
					title={t('No messages found')}
					description={t('Nothing in this conversation matches “{{q}}”.', { q: query })}
				/>
			) : (
				<List variant="divided">
					{hits.map((hit) => (
						<ListItem
							key={hit.objId}
							title={
								<Text size="sm">
									<Highlight
										text={hit.snippet || hit.title || ''}
										matches={hit.snippet ? hit.snippetMatches : undefined}
									/>
								</Text>
							}
							subtitle={<TimeFormat time={hit.updatedAt} />}
							onClick={() => onJump(hit.objId)}
						/>
					))}
				</List>
			)}
		</VBox>
	)
}

// vim: ts=4
