// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { PresenceEntry } from '@cloudillo/core'
import * as React from 'react'

import { useIsMobile } from '../hooks.js'
import { mergeClasses } from '../utils.js'
import { DocBarPresence } from './DocBarPresence.js'
import { type DocBarSubItem, DocBarTitle } from './DocBarTitle.js'

export interface DocBarProps extends React.HTMLAttributes<HTMLElement> {
	/** The tenant owning the CONTENT. Shown only when `showOwner`. */
	owner?: { idTag?: string; name?: string; profilePic?: string }
	/** Driven by `DocInfo.isCrossOwner` — a document whose owner is not the signed-in viewer. */
	showOwner?: boolean
	title?: string
	/** Resolution state of the document; drives the title placeholder. */
	state?: 'loading' | 'ready' | 'unavailable'
	/** Unsaved changes: rendered as the leading `*` the tab title also uses. */
	dirty?: boolean
	canRename?: boolean
	onRename?: (name: string) => void | Promise<void>
	renaming?: boolean
	/**
	 * The item inside the document you are looking at — notillo's current page.
	 * Rendered as a second crumb after the document name.
	 */
	sub?: DocBarSubItem
	/** Actions on the document's identity, rendered with its name rather than in the
	 *  trailing cluster — see `DocBarTitleProps.titleActions`. */
	titleActions?: React.ReactNode
	/** Rendered before the title — e.g. notillo's mobile sidebar toggle. */
	start?: React.ReactNode
	/**
	 * Actions scoped to `sub`, sitting right after it so the scope reads off the
	 * layout — e.g. notillo's per-page comments toggle.
	 */
	subActions?: React.ReactNode
	presence?: PresenceEntry[]
	/** Faces before the `+N` chip. Defaults to 4, or 2 when compact. */
	maxAvatars?: number
	/**
	 * Actions scoped to the *document* as a whole. Editing tools belong in the
	 * app's own toolbar; anything page-scoped belongs in `subActions`.
	 */
	children?: React.ReactNode
	/** Force the narrow layout; defaults to following the viewport. */
	compact?: boolean
}

/**
 * The document top bar every Cloudillo doc app wears.
 *
 * Left to right: who owns the document and what it is called, optionally the
 * item inside it you are looking at and the actions scoped to that item, who
 * else is here, and what can be done to the document as a whole.
 *
 * This is the presentational half — it takes everything as props and knows
 * nothing about the message bus, which keeps it usable in Storybook and in the
 * shell's own built-in views. `AppDocBar` is the bus-wired container.
 */
export function DocBar({
	className,
	owner,
	showOwner,
	title,
	state,
	dirty,
	canRename,
	onRename,
	renaming,
	sub,
	titleActions,
	start,
	subActions,
	presence,
	maxAvatars,
	children,
	compact,
	...props
}: DocBarProps) {
	const isMobile = useIsMobile()
	const isCompact = compact ?? isMobile

	return (
		<nav className={mergeClasses('c-nav c-docbar', className)} {...props}>
			{start}
			<DocBarTitle
				owner={owner}
				showOwner={showOwner}
				title={title}
				state={state}
				dirty={dirty}
				canRename={canRename}
				onRename={onRename}
				renaming={renaming}
				sub={sub}
				titleActions={titleActions}
				compact={isCompact}
			/>
			{subActions && <div className="c-docbar-actions">{subActions}</div>}
			<DocBarPresence users={presence} max={maxAvatars ?? (isCompact ? 2 : 4)} />
			{children && <div className="c-docbar-actions">{children}</div>}
		</nav>
	)
}

// vim: ts=4
