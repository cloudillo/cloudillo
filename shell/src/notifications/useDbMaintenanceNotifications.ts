// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { useToast } from '@cloudillo/react'
import { useTranslation } from 'react-i18next'

import { useWsBus, type WsBusMsg } from '../ws-bus.js'

interface DbMaintenanceDoneData {
	ok?: boolean
	vacuumed?: boolean
	pageSize?: number
	pageCount?: number
	freelistCount?: number
}

// Module-level, not a ref: `useWsBus` replays `lastMsg` to every subscriber on mount,
// so a remount of Layout would re-toast a run that finished before it.
let lastHandled: WsBusMsg | undefined

function formatSize(bytes: number): string {
	const units = ['B', 'kB', 'MB', 'GB', 'TB']
	let value = bytes
	let unit = 0
	while (value >= 1024 && unit < units.length - 1) {
		value /= 1024
		unit++
	}
	return `${value.toFixed(value < 10 && unit > 0 ? 1 : 0)} ${units[unit]}`
}

/**
 * Toast the outcome of an admin-triggered database optimization.
 *
 * Global rather than local to the settings page, like `useSearchReindexNotifications`:
 * the sweep takes minutes and the admin will have navigated away long before it lands.
 * Call once, in Layout.
 */
export function useDbMaintenanceNotifications() {
	const { t } = useTranslation()
	const { toast } = useToast()

	useWsBus({ cmds: ['DB_MAINTENANCE_DONE'] }, (msg) => {
		if (msg === lastHandled) return
		lastHandled = msg
		const data = (msg.data ?? {}) as DbMaintenanceDoneData
		if (!data.ok) {
			toast({
				variant: 'error',
				title: t('Database optimization failed'),
				message: t('The optimization could not be completed.'),
				duration: 8000
			})
			return
		}
		const size = (data.pageSize ?? 0) * (data.pageCount ?? 0)
		toast({
			variant: 'success',
			title: t('Database optimized'),
			message: data.vacuumed
				? t('The database was rewritten and is now {{size}}.', {
						size: formatSize(size)
					})
				: t(
						'Search index compacted; the file had too little free space to be worth rewriting.'
					)
		})
	})
}

// vim: ts=4
