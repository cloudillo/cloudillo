// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The check-and-repair dialog flow behind the sidebar's "Check consistency"
 * action: diagnose, report, offer the repair, re-diagnose, repair, report again.
 */

import { useDialog } from '@cloudillo/react'
import type { RtdbClient } from '@cloudillo/rtdb'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { type ConsistencyResult, checkConsistency, fixConsistency } from '../rtdb/consistency.js'

export function useConsistencyCheck(client: RtdbClient): () => Promise<void> {
	const { t } = useTranslation()
	const dialog = useDialog()

	return React.useCallback(async () => {
		let result: ConsistencyResult
		try {
			// A connection blip here would otherwise reject unhandled, and the menu
			// item would look like it did nothing at all.
			result = await checkConsistency(client)
		} catch (err) {
			console.error('[Notillo] Consistency check failed:', err)
			await dialog.tell(
				t('Consistency check'),
				t('Could not check the pages. Check your connection and try again.')
			)
			return
		}
		// English keys are the strings themselves (no `en` bundle), so i18next's
		// plural suffixes are not available — each count picks its own key.
		const unfiled = result.unfiledPages.length
		const dangling = result.danglingPages.length
		const cyclic = result.cyclicPages.length
		// What `fixConsistency` rewrites: every dangling page plus one break point
		// per loop, not every page in the loop (which is what `cyclic` reports).
		const repairs = result.danglingPages.length + result.cycleBreakPages.length
		const message = [
			t('{{total}} pages total, {{roots}} in the sidebar', {
				total: result.totalPages,
				roots: result.rootPages
			}),
			unfiled === 0
				? null
				: unfiled === 1
					? t('{{count}} unfiled page — reachable from links and search', {
							count: unfiled
						})
					: t('{{count}} unfiled pages — reachable from links and search', {
							count: unfiled
						}),
			dangling === 0
				? null
				: dangling === 1
					? t('{{count}} page whose parent no longer exists', { count: dangling })
					: t('{{count}} pages whose parent no longer exists', { count: dangling }),
			cyclic === 0
				? null
				: cyclic === 1
					? t('{{count}} page in a parent loop', { count: cyclic })
					: t('{{count}} pages in a parent loop', { count: cyclic })
		]
			.filter(Boolean)
			.join('\n\n')

		if (result.needsFix) {
			const shouldFix = await dialog.confirm(
				t('Consistency check'),
				`${message}\n\n${
					repairs === 1
						? t('Repair {{count}} broken page?', { count: repairs })
						: t('Repair {{count}} broken pages?', { count: repairs })
				}`
			)
			if (shouldFix) {
				// The confirm above stays open for an unbounded time and the repair
				// re-roots pages by id, so acting on the pre-confirmation analysis
				// would undo a collaborator who fixed one of them meanwhile.
				let fresh: ConsistencyResult
				try {
					fresh = await checkConsistency(client)
				} catch (err) {
					console.error('[Notillo] Consistency re-check failed:', err)
					// No repair without a fresh verdict — repairing against the stale
					// analysis is what the re-check exists to prevent.
					await dialog.tell(
						t('Consistency check'),
						t('Could not check the pages. Check your connection and try again.')
					)
					return
				}
				if (!fresh.needsFix) {
					await dialog.tell(t('Consistency check'), t('No issues found.'))
					return
				}
				// The repair commits in batches, so a rejected one leaves part of the
				// work done — reporting "Issues fixed." regardless would send the user
				// away from a document that is still broken.
				try {
					await fixConsistency(client, fresh)
					await dialog.tell(t('Consistency check'), t('Issues fixed.'))
				} catch (err) {
					console.error('[Notillo] Consistency repair failed:', err)
					await dialog.tell(
						t('Consistency check'),
						t('Repair failed. Some pages may still be broken — run the check again.')
					)
				}
			}
		} else {
			await dialog.tell(t('Consistency check'), `${message}\n\n${t('No issues found.')}`)
		}
	}, [client, dialog, t])
}

// vim: ts=4
