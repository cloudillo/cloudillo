// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { safeHref } from '@cloudillo/core'
import { Badge, Button, mergeClasses, Segmented, SegmentedItem, useDialog } from '@cloudillo/react'
import type { SiteDoc, SiteNavItem, SitePage } from '@cloudillo/types'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
	LuTriangleAlert as IcAlert,
	LuChevronDown as IcDown,
	LuGripVertical as IcGrip,
	LuLink as IcLink,
	LuPlus as IcPlus,
	LuTrash2 as IcTrash,
	LuChevronUp as IcUp,
	LuX as IcX
} from 'react-icons/lu'

/** The server's own ceiling per level — `validate_nav`'s `MAX_NAV_ITEMS`. */
const MAX_NAV_ITEMS = 64

/**
 * A position in the two-level list. `parent: null` is the top level; a number is
 * that top-level item's children. Nesting stops there, structurally — a child has
 * no children of its own — so these two cases are the whole address space.
 */
interface NavPos {
	parent: number | null
	index: number
}

/** Move `from` to `to` within one array, without disturbing anything else. */
function reorder<T>(list: T[], from: number, to: number): T[] {
	const next = [...list]
	const [moved] = next.splice(from, 1)
	if (moved === undefined) return list
	next.splice(to > from ? to - 1 : to, 0, moved)
	return next
}

/**
 * Drop the empty `children` arrays before a write, so a list that has never had a
 * sub-item compares equal to the one the server answers with.
 */
function normalize(items: SiteNavItem[]): SiteNavItem[] {
	return items.map((item) => ({
		label: item.label,
		target: item.target,
		...(item.children?.length ? { children: item.children } : {})
	}))
}

function sameList(a: SiteNavItem[], b: SiteNavItem[]) {
	return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b))
}

export interface SiteNavPanelProps {
	/** The stored explicit list. Empty is the *automatic* state, not an empty nav. */
	nav: SiteNavItem[]
	/** What the site serves with no explicit list — already site-absolute. */
	derivedNav: SiteNavItem[]
	/** The mount table: the picker's first layer, and it costs nothing to offer. */
	docs: SiteDoc[]
	/** fileId -> file name, so a mount root can be offered under its document's name. */
	docNames: Record<string, string>
	isLeader: boolean
	/** Write the whole list, or `null` to go back to automatic. */
	onSave: (nav: SiteNavItem[] | null) => Promise<void>
	/** The picker's second layer, read on demand when it opens and never cached. */
	onLoadPages: () => Promise<SitePage[]>
}

/**
 * The site's main navigation: an explicit ordered list, defaulting to the one the
 * server derives from the root container.
 *
 * The two modes never merge. An empty list means derive, and the moment anything is
 * added the explicit list takes over wholesale — which is what makes "reset to
 * automatic" a single clear rather than an unpicking of per-item edits. That is why
 * the mode is a two-option switch at the top rather than a button buried under the
 * preview: it is the panel's central concept, so it is the first thing on screen.
 *
 * Navigation is not routing: a target may name a path no document serves, may omit
 * one that is served, and may be an external URL. Nothing here affects resolution,
 * and nothing here is written into a container — a nav edit is live at once, with no
 * document republished.
 *
 * This is the one panel on the page with an explicit Save, because it is a multi-item
 * ordered edit: a half-finished list must not reach the site.
 */
export function SiteNavPanel({
	nav,
	derivedNav,
	docs,
	docNames,
	isLeader,
	onSave,
	onLoadPages
}: SiteNavPanelProps) {
	const { t } = useTranslation()
	const dialog = useDialog()
	const [items, setItems] = React.useState<SiteNavItem[]>(nav)
	// Set when the owner takes over an automatic nav, so an explicit list that is
	// still empty stays on screen instead of snapping back to the derived one.
	const [customising, setCustomising] = React.useState(false)
	const [saving, setSaving] = React.useState(false)
	const [error, setError] = React.useState<string | undefined>()
	const [dragSource, setDragSource] = React.useState<NavPos | undefined>()
	const [dragOver, setDragOver] = React.useState<NavPos | undefined>()
	// Which level an "Add" is filling, or nothing while the picker is closed.
	const [picker, setPicker] = React.useState<{ parent: number | null } | undefined>()
	const [pages, setPages] = React.useState<SitePage[] | undefined>()
	const [pagesFailed, setPagesFailed] = React.useState(false)
	const [custom, setCustom] = React.useState('')
	// Set when the typed target is not an address the bar may link to — see `addCustom`.
	const [customRefused, setCustomRefused] = React.useState(false)

	// The stored list is the truth; a save answers with it, and so does a reload.
	//
	// Keyed on the list's *contents*, not on the prop's identity. The parent passes
	// `config.site?.nav ?? []`, which is a fresh array on every render while the site
	// record is null, and lands a whole new `config` after each mount write — so an
	// identity-keyed effect wiped a half-built nav whenever anything else on the page
	// re-rendered. `lastSynced` is a ref rather than a dep so adopting a genuinely
	// new stored list still happens exactly once.
	const lastSynced = React.useRef(nav)
	React.useEffect(
		function syncStoredNav() {
			if (sameList(nav, lastSynced.current)) return
			lastSynced.current = nav
			setItems(nav)
		},
		[nav]
	)

	// Rows are keyed by position, so a reorder reuses the same DOM nodes and leaves
	// focus on the slot rather than on the item that moved — two presses of "Move
	// down" would return an entry to where it started. Focus follows the item instead.
	const focusAfterMoveRef = React.useRef<string | undefined>(undefined)

	// No dependency array on purpose: it must run after whichever commit followed a
	// move, and the ref clears itself so every other commit is a no-op.
	React.useEffect(function focusMovedEntry() {
		const id = focusAfterMoveRef.current
		if (!id) return
		focusAfterMoveRef.current = undefined
		document.getElementById(id)?.focus()
	})

	const explicit = items.length > 0 || nav.length > 0 || customising
	const dirty = !sameList(items, nav)
	const blank = items.some(
		(item) =>
			!item.label.trim() ||
			!item.target.trim() ||
			item.children?.some((child) => !child.label.trim() || !child.target.trim())
	)
	// Every stored target goes out to anonymous readers on the owner's own origin,
	// rendered by the server's own chrome as well as by `SiteBar`. `safeHref` is the
	// same allowlist both render layers apply; refusing here is what keeps a
	// `javascript:` target from ever reaching the record — `addCustom` gates the
	// picker's input, this gates the per-item one, which is editable afterwards.
	//
	// An empty target is the `blank` gate's business, so it is not also faulted here.
	const unsafeTarget = (target: string) => !!target.trim() && !safeHref(target.trim())
	const unsafe = items.some(
		(item) =>
			unsafeTarget(item.target) || item.children?.some((child) => unsafeTarget(child.target))
	)

	const write = React.useCallback(
		function write(next: SiteNavItem[] | null) {
			void (async () => {
				setSaving(true)
				setError(undefined)
				try {
					await onSave(next)
					if (next === null) {
						setItems([])
						setCustomising(false)
					}
				} catch (err) {
					setError(err instanceof Error ? err.message : String(err))
				} finally {
					setSaving(false)
				}
			})()
		},
		[onSave]
	)

	/** Patch one entry, at either level. */
	const editEntry = React.useCallback(function editEntry(
		pos: NavPos,
		patch: { label?: string; target?: string }
	) {
		setItems((prev) =>
			prev.map((item, idx) => {
				if (pos.parent === null) {
					return idx === pos.index ? { ...item, ...patch } : item
				}
				if (idx !== pos.parent) return item
				return {
					...item,
					children: (item.children ?? []).map((child, cIdx) =>
						cIdx === pos.index ? { ...child, ...patch } : child
					)
				}
			})
		)
	}, [])

	const removeEntry = React.useCallback(function removeEntry(pos: NavPos) {
		setItems((prev) => {
			if (pos.parent === null) return prev.filter((_, idx) => idx !== pos.index)
			return prev.map((item, idx) =>
				idx === pos.parent
					? {
							...item,
							children: (item.children ?? []).filter((_, cIdx) => cIdx !== pos.index)
						}
					: item
			)
		})
	}, [])

	const addEntry = React.useCallback(function addEntry(
		parent: number | null,
		label: string,
		target: string
	) {
		setItems((prev) => {
			if (parent === null) return [...prev, { label, target }]
			return prev.map((item, idx) =>
				idx === parent
					? { ...item, children: [...(item.children ?? []), { label, target }] }
					: item
			)
		})
	}, [])

	const openPicker = React.useCallback(
		function openPicker(parent: number | null) {
			setPicker({ parent })
			setCustom('')
			setCustomRefused(false)
			// One read per opening: the server opens a container per mount to answer,
			// so this is deliberately not cached across openings of the panel.
			if (pages) return
			void (async () => {
				try {
					setPages(await onLoadPages())
					setPagesFailed(false)
				} catch (_err) {
					setPagesFailed(true)
				}
			})()
		},
		[onLoadPages, pages]
	)

	const choose = React.useCallback(
		function choose(label: string, target: string) {
			if (!picker) return
			addEntry(picker.parent, label, target)
			setPicker(undefined)
		},
		[picker, addEntry]
	)

	/**
	 * Add the typed target, if it is one the site bar may actually link to.
	 *
	 * `safeHref` is the same allowlist the published pages themselves go through
	 * (`libs/core/src/site.ts`): a path, `#`, or an `http(s)`/`mailto:` address, and
	 * nothing protocol-relative. On a community site an entry typed here is rendered
	 * to every anonymous reader on the owner's own origin, so a `javascript:` target
	 * would be stored XSS — refused here, and refused again at the parse and render
	 * layers (`site/detect.ts`, `site/SiteBar.tsx`) for the entries already stored.
	 */
	const addCustom = React.useCallback(
		function addCustom() {
			const target = safeHref(custom.trim())
			if (!target) {
				setCustomRefused(true)
				return
			}
			choose(target, target)
		},
		[custom, choose]
	)

	// --- reorder, within one level only -------------------------------------------

	/**
	 * Move one item inside its own level — the single definition of where an item
	 * lands, shared by the drag gesture and the move buttons on each row.
	 *
	 * `to` is an insertion index in the *pre-move* list, which is what `reorder`
	 * takes: moving down one slot is `index + 2`, not `index + 1`.
	 */
	function moveEntry(from: NavPos, to: number) {
		setItems((prev) => {
			if (from.parent === null) return reorder(prev, from.index, to)
			return prev.map((item, idx) =>
				idx === from.parent
					? { ...item, children: reorder(item.children ?? [], from.index, to) }
					: item
			)
		})
	}

	function onDrop(target: NavPos) {
		if (!dragSource || dragSource.parent !== target.parent) return
		moveEntry(dragSource, target.index)
		setDragSource(undefined)
		setDragOver(undefined)
	}

	function samePos(a: NavPos | undefined, b: NavPos) {
		return !!a && a.parent === b.parent && a.index === b.index
	}

	// --- the picker's three layers ------------------------------------------------

	/** Every mount root, published or not: adding `/blog` before it exists is fine. */
	const mountTargets = React.useMemo(
		() =>
			[...docs]
				.sort((a, b) => a.mountPath.localeCompare(b.mountPath))
				.map((doc) => ({
					label: docNames[doc.docFileId] ?? doc.mountPath,
					target: doc.mountPath,
					served: !!doc.publishedFileId
				})),
		[docs, docNames]
	)

	/** Pages grouped by their mount, each group in path order. */
	const pageGroups = React.useMemo(() => {
		const groups = new Map<string, SitePage[]>()
		for (const page of pages ?? []) {
			const group = groups.get(page.mountPath)
			if (group) group.push(page)
			else groups.set(page.mountPath, [page])
		}
		for (const group of groups.values()) {
			group.sort((a, b) => a.path.localeCompare(b.path))
		}
		return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))
	}, [pages])

	/**
	 * One target as a full-width row: title on the left, path on the right. The
	 * earlier chip layout sized every option to its own text, which made a list of
	 * a dozen unscannable.
	 */
	function renderTarget(key: string, label: string, target: string, note?: React.ReactNode) {
		return (
			<Button
				key={key}
				kind="nav-item"
				className="w-100 justify-content-between g-2"
				onClick={() => choose(label, target)}
			>
				<span className="text-truncate">
					{label}
					{note}
				</span>
				<span className="c-hint small text-nowrap">{target}</span>
			</Button>
		)
	}

	function renderPicker() {
		if (!picker) return null
		return (
			<div className="c-panel emph c-vbox">
				<div className="c-hbox g-2 align-items-center">
					<strong className="flex-fill">
						{picker.parent === null
							? t('Add a navigation item')
							: t('Add an item under “{{name}}”', {
									name: items[picker.parent]?.label ?? ''
								})}
					</strong>
					<Button
						mode="icon"
						title={t('Cancel')}
						aria-label={t('Cancel')}
						onClick={() => setPicker(undefined)}
					>
						<IcX />
					</Button>
				</div>

				{!!mountTargets.length && (
					<div className="c-settings-section">
						<div className="c-settings-section-title">{t('Documents')}</div>
						{mountTargets.map((mount) =>
							renderTarget(
								mount.target,
								mount.label,
								mount.target,
								!mount.served && (
									<Badge className="neutral ms-2">{t('not published yet')}</Badge>
								)
							)
						)}
					</div>
				)}

				{pagesFailed ? (
					<span className="c-hint">
						{t('The published pages could not be listed. Enter a path below.')}
					</span>
				) : !pages ? (
					<span className="c-hint">{t('Reading the published pages…')}</span>
				) : !pageGroups.length ? (
					<span className="c-hint">{t('No document has published any pages yet.')}</span>
				) : (
					pageGroups.map(([mountPath, group]) => (
						<div key={mountPath} className="c-settings-section">
							<div className="c-settings-section-title">{mountPath}</div>
							{group.map((page) => renderTarget(page.path, page.title, page.path))}
						</div>
					))
				)}

				<div className="c-vbox g-1">
					<span className="c-hint">
						{t('Or a path of your own, or an address elsewhere')}
					</span>
					<div className="c-input-group">
						<input
							className="c-input w-min-0"
							type="text"
							value={custom}
							aria-label={t('Path or address')}
							placeholder={t('/about or https://example.com')}
							onChange={(evt) => {
								setCustom(evt.target.value)
								setCustomRefused(false)
							}}
						/>
						<Button disabled={!custom.trim()} onClick={addCustom}>
							{t('Add')}
						</Button>
					</div>
					{customRefused && (
						<span className="c-hint text-error">
							{t('Use a path like /about, or an http(s) address.')}
						</span>
					)}
				</div>
			</div>
		)
	}

	function renderEntry(pos: NavPos, entry: { label: string; target: string }) {
		const disabled = !isLeader || saving
		// Said on the offending field as well as gating Save, so a refused target is a
		// visible refusal rather than a Save button that mysteriously does nothing.
		const refused = unsafeTarget(entry.target)
		const refusedId = `nav-target-${pos.parent ?? 'top'}-${pos.index}-refused`
		// Its own level's length, which is what bounds the move buttons below.
		const siblings = pos.parent === null ? items : (items[pos.parent]?.children ?? [])
		// Position-derived, because that is what the rows are keyed by: after a move
		// the button at the destination slot is the one this item now owns.
		const moveId = (at: number, dir: 'up' | 'down') =>
			`nav-move-${pos.parent ?? 'top'}-${at}-${dir}`
		return (
			<div
				key={`${pos.parent ?? 'top'}-${pos.index}`}
				role="listitem"
				className={mergeClasses(
					'c-nav-editor-item',
					samePos(dragSource, pos) && 'dragging',
					samePos(dragOver, pos) && 'drag-over'
				)}
				onDragOver={(evt) => {
					evt.preventDefault()
					setDragOver(pos)
				}}
				onDrop={(evt) => {
					evt.preventDefault()
					// The list container below has its own `onDrop` — "dropped past the
					// last item" — and this event would otherwise bubble into it and
					// reorder a *second* time, against the already-reordered array.
					// The `setDragSource(undefined)` inside `onDrop` does not prevent
					// that: it is a state update, so the container's handler still sees
					// the source set in this same dispatch and its guard passes.
					evt.stopPropagation()
					onDrop(pos)
				}}
				onDragEnd={() => {
					setDragSource(undefined)
					setDragOver(undefined)
				}}
			>
				{/* Only the grip is draggable. With the whole row draggable the browser
				    hands the gesture to drag-and-drop, so text inside the two inputs
				    below cannot be selected with the mouse at all. */}
				<span
					className="c-nav-editor-grip"
					draggable={isLeader && !saving}
					aria-hidden="true"
					onDragStart={(evt) => {
						setDragSource(pos)
						evt.dataTransfer.effectAllowed = 'move'
					}}
				>
					<IcGrip />
				</span>
				{/* The grip is a mouse affordance and nothing else — these are how the
				    list is reordered from the keyboard, and the only way a screen
				    reader can reorder it at all. */}
				<Button
					kind="link"
					mode="icon"
					size="small"
					id={moveId(pos.index, 'up')}
					disabled={disabled || pos.index === 0}
					title={t('Move up')}
					aria-label={t('Move up')}
					onClick={() => {
						focusAfterMoveRef.current = moveId(pos.index - 1, 'up')
						moveEntry(pos, pos.index - 1)
					}}
				>
					<IcUp />
				</Button>
				<Button
					kind="link"
					mode="icon"
					size="small"
					id={moveId(pos.index, 'down')}
					disabled={disabled || pos.index >= siblings.length - 1}
					title={t('Move down')}
					aria-label={t('Move down')}
					onClick={() => {
						// `moveEntry` takes an insert-*before* index in the pre-move
						// list, hence `+ 2`; the item's resulting index is `+ 1`.
						focusAfterMoveRef.current = moveId(pos.index + 1, 'down')
						moveEntry(pos, pos.index + 2)
					}}
				>
					<IcDown />
				</Button>
				<input
					className="c-input flex-fill w-min-0"
					type="text"
					value={entry.label}
					disabled={disabled}
					aria-label={t('Label')}
					placeholder={t('Label')}
					onChange={(evt) => editEntry(pos, { label: evt.target.value })}
				/>
				{pos.parent === null && (
					<Button
						mode="icon"
						disabled={
							disabled || (items[pos.index]?.children?.length ?? 0) >= MAX_NAV_ITEMS
						}
						title={t('Add sub-item')}
						aria-label={t('Add sub-item')}
						onClick={() => openPicker(pos.index)}
					>
						<IcPlus />
					</Button>
				)}
				<Button
					mode="icon"
					disabled={disabled}
					title={t('Remove')}
					aria-label={t('Remove')}
					onClick={() => removeEntry(pos)}
				>
					<IcTrash />
				</Button>
				<div className="c-nav-editor-target">
					<IcLink className="text-muted flex-shrink-0" />
					<input
						className={mergeClasses('c-input flex-fill w-min-0', refused && 'error')}
						type="text"
						value={entry.target}
						disabled={disabled}
						aria-label={t('Path or address')}
						aria-invalid={refused}
						aria-describedby={refused ? refusedId : undefined}
						placeholder={t('/about or https://example.com')}
						onChange={(evt) => editEntry(pos, { target: evt.target.value })}
					/>
				</div>
				{refused && (
					<span id={refusedId} className="c-hint text-error">
						{t('Use a path like /about, or an http(s) address.')}
					</span>
				)}
			</div>
		)
	}

	return (
		<div className="c-panel c-site-panel">
			<h4 className="pb-2">{t('Navigation')}</h4>

			{/* A segmented button, not a tab bar: this picks how the navigation is
			built, it does not navigate to the panel below. */}
			<Segmented
				aria-label={t('Navigation mode')}
				value={explicit ? 'custom' : 'auto'}
				onChange={(value) => {
					if (!isLeader || saving) return
					if (value === 'custom' && !explicit) {
						// Seed from the derived list rather than from nothing: the owner
						// is taking over a navigation, not writing a new one.
						setItems(derivedNav)
						setCustomising(true)
					} else if (value === 'auto' && explicit) {
						// Switching back is one click, and `write(null)` discards the whole
						// custom list — unsaved edits and stored entries alike — so it is
						// confirmed like every other destructive action on these pages
						// (`site-mounts.tsx`). Declining needs no undo: `explicit` is
						// derived from the stored config, so the control snaps back on its
						// own.
						void (async () => {
							const confirmed = await dialog.confirm(
								t('Go back to automatic navigation?'),
								t(
									'The navigation you built is discarded and the site lists its top-level pages again.'
								)
							)
							if (!confirmed) return
							setPicker(undefined)
							write(null)
						})()
					}
				}}
			>
				<SegmentedItem value="auto">{t('Automatic')}</SegmentedItem>
				<SegmentedItem value="custom">{t('Custom')}</SegmentedItem>
			</Segmented>

			{!explicit ? (
				<>
					<p className="c-hint">
						{t(
							'Automatic: the site lists the top-level pages of the document served at /. Take it over to reorder, rename or add items, including links into another document and addresses elsewhere.'
						)}
					</p>
					{derivedNav.length ? (
						<table className="c-table compact c-site-table">
							<thead>
								<tr>
									<th>{t('Label')}</th>
									<th>{t('Target')}</th>
								</tr>
							</thead>
							<tbody>
								{derivedNav.map((item, index) => (
									<tr key={`${index}-${item.target}`}>
										<td data-label={t('Label')}>{item.label}</td>
										<td className="c-hint" data-label={t('Target')}>
											{item.target}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					) : (
						<p className="c-hint">
							{t(
								'Nothing to show yet — the navigation appears once the root document is published.'
							)}
						</p>
					)}
				</>
			) : (
				<>
					<p className="c-hint">
						{t(
							'Custom: this list is what the site serves, in this order. It takes effect at once — no document has to be published again.'
						)}
					</p>
					<div
						className="c-nav-editor"
						role="list"
						aria-label={t('Navigation items')}
						onDragOver={(evt) => evt.preventDefault()}
						onDrop={(evt) => {
							evt.preventDefault()
							onDrop({ parent: null, index: items.length })
						}}
					>
						{items.map((item, index) => (
							<React.Fragment key={`item-${index}`}>
								{renderEntry({ parent: null, index }, item)}
								{!!item.children?.length && (
									// `group`, not a nested `list`: a list's own children
									// must be list items, and a group of them is the one
									// other thing ARIA allows directly inside one.
									<div className="c-nav-editor-child" role="group">
										{item.children.map((child, cIndex) =>
											renderEntry({ parent: index, index: cIndex }, child)
										)}
									</div>
								)}
							</React.Fragment>
						))}
						{!items.length && (
							<span className="c-hint">
								{t('No items yet — add the first one below.')}
							</span>
						)}
					</div>

					{renderPicker()}

					<div className="c-hbox g-2 flex-wrap justify-content-end">
						{blank ? (
							<span className="c-hint flex-fill">
								{t('Every item needs a label and a target.')}
							</span>
						) : (
							unsafe && (
								<span className="c-hint text-error flex-fill">
									{t('A target must be a path or an http(s) address.')}
								</span>
							)
						)}
						<Button
							disabled={
								!isLeader || saving || !!picker || items.length >= MAX_NAV_ITEMS
							}
							onClick={() => openPicker(null)}
						>
							{t('Add item')}
						</Button>
						<Button
							variant="primary"
							disabled={!isLeader || saving || !dirty || blank || unsafe}
							onClick={() => write(items.length ? items : null)}
						>
							{t('Save')}
						</Button>
					</div>
				</>
			)}

			{error && (
				<span className="text-error c-hbox align-items-center g-1" role="alert">
					<IcAlert className="flex-shrink-0" />
					{error}
				</span>
			)}
		</div>
	)
}

// vim: ts=4
