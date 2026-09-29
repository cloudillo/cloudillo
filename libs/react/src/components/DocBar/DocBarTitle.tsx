// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { getFileUrl } from '@cloudillo/core'
import * as React from 'react'
import { LuChevronRight as IcSep } from 'react-icons/lu'

import { useLibTranslation } from '../../i18n.js'
import { Avatar, InitialsAvatar, monogramFor } from '../Avatar/index.js'
import { InlineEditForm } from '../InlineEdit/index.js'
import { mergeClasses } from '../utils.js'

export interface DocBarSubItem {
	/** The sub-item's name. Also accepts a non-editable ordinal, e.g. "Page 3 of 12". */
	label: string
	/** Shown in place of an empty `label`. Never seeded into the edit box. */
	emptyLabel?: string
	/** Emoji or icon before the label — the visual anchor for "this is the sub-item". */
	icon?: React.ReactNode
	canRename?: boolean
	onRename?: (name: string) => void | Promise<void>
	renaming?: boolean
}

export interface DocBarTitleProps {
	className?: string
	/** The tenant owning the CONTENT. Shown only when `showOwner`. */
	owner?: { idTag?: string; name?: string; profilePic?: string }
	/** Driven by `DocInfo.isCrossOwner` — a document whose owner is not the signed-in viewer. */
	showOwner?: boolean
	title?: string
	/**
	 * Resolution state of the document. `'loading'` with no title yet shows a
	 * placeholder rather than the untitled label, so a document that has a perfectly
	 * good name does not read as "Untitled document" for the length of the fetch.
	 */
	state?: 'loading' | 'ready' | 'unavailable'
	/** Unsaved changes: rendered as the same leading `*` the tab title uses. */
	dirty?: boolean
	canRename?: boolean
	onRename?: (name: string) => void | Promise<void>
	renaming?: boolean
	/** The item inside the document you are looking at — notillo's current page. */
	sub?: DocBarSubItem
	/**
	 * Actions on the document's IDENTITY, sitting with its name — copying the
	 * reference to it, and nothing else so far. Before the `sub` crumb on purpose:
	 * after it they would read as scoped to the page rather than to the document.
	 */
	titleActions?: React.ReactNode
	/** Hide the owner's name, keeping the picture. Set on narrow viewports. */
	compact?: boolean
}

interface TitleSegmentProps {
	className?: string
	value: string
	/**
	 * Stand-in for an empty `value` in the button and span branches; without one a
	 * renameable untitled document is a zero-width button nobody can hit.
	 * Deliberately NOT seeded into the edit box, so the user is not made to delete
	 * the word "Untitled" before typing.
	 */
	emptyLabel?: string
	/** Rendered before the value in the button and span branches, e.g. the dirty `*`. */
	prefix?: React.ReactNode
	canRename?: boolean
	onRename?: (name: string) => void | Promise<void>
	renaming?: boolean
	editPlaceholder?: string
	/** Marks this as the segment the crumb trail is currently on. */
	current?: boolean
	/**
	 * Wrap the non-editing branches in the document's `h1`. Set by the document
	 * name alone — a second one on the sub-item crumb would give the page two.
	 */
	heading?: boolean
}

/**
 * One title segment: an inline edit while editing, a button when renameable, a
 * plain span otherwise.
 *
 * Both the document name and the sub-item go through this, so the bar can never
 * end up showing two different edit interactions side by side.
 */
function TitleSegment({
	className,
	value,
	emptyLabel,
	prefix,
	canRename,
	onRename,
	renaming,
	editPlaceholder,
	current,
	heading
}: TitleSegmentProps) {
	const { t } = useLibTranslation()
	const [editing, setEditing] = React.useState(false)
	// What `value` was when this edit began, so the effect below can tell a name
	// that moved under the user from one that did not.
	const editStartValueRef = React.useRef(value)

	// A rename elsewhere (or a navigation) must not leave a stale edit box open —
	// but the shell pushes a fresh `DocInfo` on every change of any kind (a pin, an
	// access change, a Files-list bump), and closing on those would throw away what
	// is being typed. So close only when the name itself moved under the user.
	React.useEffect(() => {
		if (value !== editStartValueRef.current) {
			editStartValueRef.current = value
			setEditing(false)
		}
	}, [value])

	const handleSave = React.useCallback(
		(next: string) => {
			// Adopted before the rename lands, so the push confirming it does not
			// read as a competing change.
			editStartValueRef.current = next
			setEditing(false)
			if (next !== value) void onRename?.(next)
		},
		[onRename, value]
	)

	// `className` deliberately does not reach the edit form: it carries the
	// responsive hiding, and a box that vanishes mid-edit loses what was typed.
	if (editing && canRename) {
		return (
			<InlineEditForm
				className="flex-fill"
				value={value}
				size="small"
				onSave={handleSave}
				onCancel={() => setEditing(false)}
				placeholder={editPlaceholder}
			/>
		)
	}

	const shown = value || emptyLabel

	const content = canRename ? (
		<button
			type="button"
			className={mergeClasses('c-docbar-title-button text-truncate', className)}
			onClick={() => {
				editStartValueRef.current = value
				setEditing(true)
			}}
			disabled={renaming}
			title={t('Rename')}
			aria-current={current ? 'page' : undefined}
		>
			{prefix}
			{shown}
		</button>
	) : (
		<span
			className={mergeClasses('c-docbar-title text-truncate', className)}
			title={shown}
			aria-current={current ? 'page' : undefined}
		>
			{prefix}
			{shown}
		</span>
	)

	// The heading wraps these branches only: `InlineEditForm` above renders a
	// `<form>`, which is flow content and may not sit inside an `h1`.
	return heading ? <h1 className="c-docbar-heading">{content}</h1> : content
}

/**
 * The DocBar's left region: who owns the document, what it is called, and —
 * when the app has one — which item inside it you are looking at.
 *
 * The title becomes an inline edit on click when `canRename`. It is a button
 * rather than a click-anywhere span so keyboard users can reach it and screen
 * readers announce it as editable.
 */
export function DocBarTitle({
	className,
	owner,
	showOwner,
	title,
	state = 'ready',
	dirty,
	canRename,
	onRename,
	renaming,
	sub,
	titleActions,
	compact
}: DocBarTitleProps) {
	const { t } = useLibTranslation()

	return (
		<div className={mergeClasses('c-docbar-main', sub && 'has-sub', className)}>
			{showOwner && owner && (
				<div
					className="c-docbar-owner"
					title={owner.name ? `${owner.name} (${owner.idTag})` : owner.idTag}
				>
					{/* The same Avatar pair the presence faces use, rather than
					    ProfilePicture: consistent with the roster, and it keeps
					    `@cloudillo/react/doc-bar` free of react-router, which
					    ProfilePicture pulls in via hooks.tsx. */}
					{owner.profilePic && owner.idTag ? (
						<Avatar
							size="xs"
							src={getFileUrl(owner.idTag, owner.profilePic, 'vis.pf')}
							alt={owner.name || owner.idTag}
							fallback={monogramFor(owner.idTag, owner.name)}
						/>
					) : (
						<InitialsAvatar
							size="xs"
							name={owner.name || owner.idTag}
							idTag={owner.idTag}
							seed={owner.idTag}
						/>
					)}
					{!compact && (
						<span className="name text-truncate">{owner.name || owner.idTag}</span>
					)}
				</div>
			)}
			{/* Each app is its own iframe document, so this `h1` is the only one in
			    it — without it the app has none. It lives one level down, inside
			    the segment, because it may not wrap the edit form; this slot is the
			    stable flex box the layout rules hang off either way. */}
			<div className="c-docbar-heading-slot">
				{state === 'loading' && !title ? (
					/* A name we do not have yet is not "Untitled". Rendering the real
					   segment as soon as a title exists is what stops a rename push
					   from flashing this back in. */
					<h1 className="c-docbar-heading">
						<span
							className="c-docbar-title"
							aria-busy="true"
							aria-label={t('Loading document name')}
						>
							<span
								className="c-skeleton"
								style={{ display: 'block', width: '8rem', height: '1em' }}
							/>
						</span>
					</h1>
				) : (
					<TitleSegment
						heading
						className="c-docbar-doc-title"
						value={title ?? ''}
						emptyLabel={
							state === 'unavailable'
								? t('Document unavailable')
								: t('Untitled document')
						}
						prefix={dirty ? '* ' : ''}
						/* No extra guard needed while loading: the shell's loading
						   `DocInfo` already carries `canRename: false`. */
						canRename={canRename}
						onRename={onRename}
						renaming={renaming}
						editPlaceholder={t('Document name')}
					/>
				)}
			</div>
			{/* `.c-docbar-actions` for the chrome: one look for every action in the bar,
			    wherever it sits. */}
			{titleActions && <div className="c-docbar-actions">{titleActions}</div>}
			{sub && (
				<>
					<IcSep className="c-docbar-sep" aria-hidden="true" />
					<span className="c-docbar-sub">
						{sub.icon && <span className="c-docbar-sub-icon">{sub.icon}</span>}
						<TitleSegment
							value={sub.label}
							emptyLabel={sub.emptyLabel}
							canRename={sub.canRename}
							onRename={sub.onRename}
							renaming={sub.renaming}
							editPlaceholder={t('Name')}
							current
						/>
					</span>
				</>
			)}
		</div>
	)
}

// vim: ts=4
