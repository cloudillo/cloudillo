// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The bus-wired DocBar — what apps actually mount.
 *
 * Deliberately router-free: `hooks.tsx` imports `react-router-dom` at module
 * scope and the router is only a devDependency here, so anything that reaches
 * it drags the router into every app bundle. This talks to `getAppBus()`
 * directly instead.
 */

import { type DocInfo, getAppBus, parseAppHash } from '@cloudillo/core'
import * as React from 'react'
import { LuShare2 as IcShare } from 'react-icons/lu'
import type { Awareness } from 'y-protocols/awareness'

import { Button } from './components/Button/Button.js'
import { DocBar, type DocBarSubItem } from './components/DocBar/index.js'
import { useToast } from './components/Toast/index.js'
import { useLibTranslation } from './i18n.js'
import { useDocPresence, usePresenceContext } from './presence.js'

// Re-exported here so an app can type an `AppDocBar` `sub` object without
// reaching into `components/`.
export type { DocBarSubItem }

export interface UseDocBarReturn {
	info?: DocInfo
	/** The name to display — optimistically the pending one during a rename. */
	title?: string
	/** Resolution state of the document. `undefined` until the shell's first push. */
	state?: DocInfo['state']
	canRename: boolean
	/** The viewer may share this document to their feed: a signed-in identity plus write access
	 *  to a local row that ORIGINATES here. Not the rename rule — rename reaches a mirrored
	 *  copy, a post cannot widen one. False for a guest. */
	canPost: boolean
	rename(name: string): Promise<void>
	renaming: boolean
	/** True in an embedded document, where no chrome of any kind belongs. */
	hidden: boolean
}

/**
 * Document identity and rename, straight from the shell — which pushes
 * `doc:info` unprompted, so there is nothing to poll and no fetch here.
 */
export function useDocBar(): UseDocBarReturn {
	const { t } = useLibTranslation()
	const { error: toastError } = useToast()
	const [info, setInfo] = React.useState<DocInfo | undefined>(undefined)
	// Set while a rename is in flight so the name changes under the user's
	// cursor immediately rather than after the shell's round trip.
	const [pendingTitle, setPendingTitle] = React.useState<string | undefined>(undefined)
	const [renaming, setRenaming] = React.useState(false)
	// An embed has no bar at all. Read from the hash rather than from
	// `bus.embedded`: this runs before `bus.init()` has parsed it, so the bus would
	// still say false and the bar would render inside every embed. Resolved once,
	// since it cannot change.
	const [hidden] = React.useState(() => parseAppHash(window.location.hash).isEmbed)

	React.useEffect(() => {
		const bus = getAppBus()
		return bus.onDocInfo((next) => {
			// What `DocInfo.resId` is for: drop a push that belongs to the document
			// we navigated away from. Only when the bus has a resId of its own —
			// standalone and test mounts have none, and a guard that fired there
			// would blank the bar permanently.
			if (bus.resId && next.resId && next.resId !== bus.resId) return
			setInfo(next)
			// Retire the optimistic name only once the push confirms it. A push
			// that lands mid-rename (a pin change, say) must not revert the box.
			setPendingTitle((pending) => (next.fileName === pending ? undefined : pending))
		})
	}, [])

	const rename = React.useCallback(
		async (name: string) => {
			const fileName = name.trim()
			if (!fileName) return

			const bus = getAppBus()
			setPendingTitle(fileName)
			setRenaming(true)
			try {
				// `renameDocument` reports a refused rename through `ok`, but
				// still throws outright if the bus was never initialized.
				const res = await bus.renameDocument(fileName)
				if (!res.ok) {
					setPendingTitle(undefined)
					toastError(res.error || t('Could not rename the document'))
					return
				}
				// The resolver may hand back a different name than the one asked
				// for — a de-duplicating rename turns "Notes" into "Notes (2)".
				// Without re-pointing the optimistic name the confirming push never
				// matches, and the bar shows the requested name until remount.
				// Setting rather than clearing avoids a flash of the old name.
				const applied = res.fileName ?? fileName
				setPendingTitle(applied)
				// Keep the shell's tab title in step: an `appManaged` app owns
				// that string, so the shell will not update it on its own.
				bus.setTitle(applied)
			} catch (err) {
				setPendingTitle(undefined)
				toastError((err as Error).message || t('Could not rename the document'))
			} finally {
				setRenaming(false)
			}
		},
		[t, toastError]
	)

	return {
		info,
		title: pendingTitle ?? info?.fileName,
		state: info?.state,
		canRename: !!info?.canRename,
		canPost: !!info?.canPost,
		rename,
		renaming,
		hidden
	}
}

export interface AppDocBarProps {
	/**
	 * Yjs awareness for the presence roster, for an app that has one and no
	 * `PresenceProvider` above this bar. A provider always wins, which is how the
	 * RTDB apps feed the same slot without a prop. With neither, it renders empty.
	 */
	awareness?: Awareness | null
	className?: string
	/** Unsaved changes: rendered as the leading `*` the tab title also uses. */
	dirty?: boolean
	/**
	 * The item inside the document you are looking at — notillo's current page.
	 * Rendered as a second crumb after the document name.
	 */
	sub?: DocBarSubItem
	/** Rendered before the title — e.g. notillo's mobile sidebar toggle. */
	start?: React.ReactNode
	/** Actions scoped to `sub`, rendered right after it. */
	subActions?: React.ReactNode
	maxAvatars?: number
	/** Document-wide actions. Anything scoped to `sub` belongs in `subActions`. */
	children?: React.ReactNode
}

/**
 * The DocBar, wired to the app bus. Mount it as the first row of the app root.
 *
 * Renders `null` in an embedded document.
 */
export function AppDocBar({
	awareness,
	className,
	dirty,
	sub,
	start,
	subActions,
	maxAvatars,
	children
}: AppDocBarProps) {
	const { info, title, state, canRename, canPost, rename, renaming, hidden } = useDocBar()
	const { t } = useLibTranslation()
	const { error: toastError } = useToast()
	// An app that computed the roster once — RTDB apps do, and so does any Yjs app
	// that needs presence outside the bar — provides it here. Only without a
	// provider does the bar subscribe on its own, and never in an embed.
	const provided = usePresenceContext()
	const own = useDocPresence(hidden || provided ? undefined : awareness)
	const { users } = provided ?? own

	if (hidden) return null

	return (
		<DocBar
			className={className}
			owner={info?.owner}
			showOwner={!!info?.isCrossOwner}
			title={title}
			// No push yet is the same thing as still resolving, as far as the
			// title area is concerned.
			state={state ?? 'loading'}
			dirty={dirty}
			canRename={canRename}
			onRename={rename}
			renaming={renaming}
			sub={sub}
			start={start}
			subActions={subActions}
			presence={users}
			maxAvatars={maxAvatars}
		>
			{/* An embedded document never gets here — `hidden` returned above. A
			    document that has not resolved yet has nothing to post, and a
			    share-link guest has no feed to post it to: the click would only
			    navigate them out of the document they were sent. */}
			{state === 'ready' && canPost && (
				<Button
					kind="link"
					icon={<IcShare />}
					title={t('Share to feed')}
					aria-label={t('Share to feed')}
					onClick={() =>
						getAppBus()
							.postToFeed()
							.catch((err: Error) => {
								// The wire message is a protocol string, not UI copy — log it,
								// never toast it. The toast needs an app-mounted <Toasts/> sink;
								// the log always lands.
								console.error('[DocBar] Share to feed failed', err)
								toastError(t('Could not share this document'))
							})
					}
				/>
			)}
			{children}
		</DocBar>
	)
}

// vim: ts=4
