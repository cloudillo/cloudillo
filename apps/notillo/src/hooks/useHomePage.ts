// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Setting and clearing the document's home page — the whole act, once.
 *
 * Two entry points reach it, the sidebar's row menu and the page settings pane, so
 * it lives here rather than in either of them.
 *
 * The act is two writes, in this order: `d/site` names the new home page, and only
 * then do its children move to the root. The window between them shows every
 * collaborator's sidebar a home page whose children are still filed under it — a
 * duplicated top level for as long as the second write takes.
 *
 * That is the cheaper half of the trade. `setHomePage` reparents children
 * irreversibly, so the other order fails into a document whose tree has been
 * restructured for everyone with no home page to explain why, and nothing on screen
 * says so. This order fails into `d/site` naming a page whose tree is mid-move —
 * which the readers already tolerate, and which the same action retried completes.
 *
 * Neither action confirms. Promoting a page reparents its children and moves its own
 * URL, but both land in the sidebar the moment they happen and neither deletes
 * anything — so a confirm was a speed bump on the common path rather than a guard on
 * a dangerous one. A failed *write* is still reported: that one leaves nothing on
 * screen to explain itself.
 */

import { useDialog } from '@cloudillo/react'
import type { RtdbClient } from '@cloudillo/rtdb'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { PageWithId } from '../publish/tree.js'
import { setHomePage } from '../rtdb/page-ops.js'

export interface HomePageActions {
	/** A home-page write is in flight; both actions are inert until it lands. */
	busy: boolean
	setHome(pageId: string, opts?: { justCreated?: boolean }): Promise<void>
	clearHome(): Promise<void>
}

export interface UseHomePageOptions {
	client: RtdbClient | undefined
	pages: Map<string, PageWithId>
	/** The current home page, from the document settings. */
	homePageId?: string
	/** Writes `homePageId` into the document settings — `useDocSettings`'s `save`. */
	save(homePageId: string | null): Promise<void>
}

export function useHomePage({
	client,
	pages,
	homePageId,
	save
}: UseHomePageOptions): HomePageActions {
	const { t } = useTranslation()
	const dialog = useDialog()
	const [busy, setBusy] = useState(false)

	const setHome = useCallback(
		async (pageId: string, opts?: { justCreated?: boolean }) => {
			if (!client || busy) return
			if (pageId === homePageId) return
			// The map is the render-time snapshot, so a page created a moment ago
			// cannot be in it — `useAllPages` builds a new Map per snapshot and the
			// create resolves before the snapshot arrives. `justCreated` is the caller
			// saying so; every other path still refuses a page deleted under it.
			if (!opts?.justCreated && !pages.has(pageId)) return

			setBusy(true)
			try {
				await save(pageId)
				// A just-created page has no children, so the stale map finds nothing
				// to reparent — which is the right answer for it.
				await setHomePage(client, pages, pageId)
			} catch (err) {
				console.error('[Notillo] Set home page failed:', err)
				await dialog.tell(
					t('Home page'),
					t('Could not set the home page. Check your connection and try again.')
				)
			} finally {
				setBusy(false)
			}
		},
		[client, pages, homePageId, busy, dialog, save, t]
	)

	const clearHome = useCallback(async () => {
		if (!client || busy || !homePageId) return

		setBusy(true)
		try {
			await save(null)
		} catch (err) {
			console.error('[Notillo] Clear home page failed:', err)
			await dialog.tell(
				t('Home page'),
				t('Could not clear the home page. Check your connection and try again.')
			)
		} finally {
			setBusy(false)
		}
	}, [client, homePageId, busy, dialog, save, t])

	return { busy, setHome, clearHome }
}

// vim: ts=4
