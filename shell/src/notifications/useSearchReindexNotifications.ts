// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { useToast } from '@cloudillo/react'
import { useTranslation } from 'react-i18next'

import { useWsBus, type WsBusMsg } from '../ws-bus.js'

interface ReindexDoneData {
	ok?: boolean
	willRetry?: boolean
	files?: number
	documents?: number
	profiles?: number
	actions?: number
}

// Module-level, not a ref: `useWsBus` replays `lastMsg` to every subscriber on mount,
// so a remount of Layout would re-toast a rebuild that finished before it.
let lastHandled: WsBusMsg | undefined

/**
 * Toast the outcome of a user-triggered search index rebuild.
 *
 * Global rather than local to the settings page: a sweep takes minutes and the user
 * will have navigated away long before it lands. Call once, in Layout.
 */
export function useSearchReindexNotifications() {
	const { t } = useTranslation()
	const { toast } = useToast()

	useWsBus({ cmds: ['SEARCH_REINDEX_DONE'] }, (msg) => {
		if (msg === lastHandled) return
		lastHandled = msg
		const data = (msg.data ?? {}) as ReindexDoneData
		if (data.ok) {
			const count =
				(data.files ?? 0) +
				(data.documents ?? 0) +
				(data.profiles ?? 0) +
				(data.actions ?? 0)
			toast({
				variant: 'success',
				title: t('Search index rebuilt'),
				message: t('{{count}} items re-indexed', { count })
			})
		} else {
			toast({
				variant: 'error',
				title: t('Search index rebuild failed'),
				message: data.willRetry
					? t('It will be retried automatically in the background.')
					: t('The rebuild could not be completed.'),
				duration: 8000
			})
		}
	})
}

// vim: ts=4
