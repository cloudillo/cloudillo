// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * Sections tab of the left rail: one row per `secs` entry (display name, page range, layout,
 * current / overset badges). Row click jumps there; with `editable` rows drag (handle + Move
 * menu, Alt+↑/↓), carry a ⋮ menu (also Shift+F10; insert above / below) and one "New section"
 * button appends.
 */

import {
	Button,
	IcAdd,
	IcMore,
	IcWarning,
	Input,
	isKeyboardContextMenu,
	Menu,
	MenuItem,
	SortableList,
	Tooltip
} from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import type * as Y from 'yjs'

import { mastersOf, SECTION_NAME_MAX, sectionByStory, sectionOf } from '../crdt/entities'
import { addSection, duplicateSection, moveSection, updateSection } from '../crdt/section-ops'
import type { YPagilloDocument } from '../crdt/stored-types'
import { type LayoutState, pageKey } from '../layout/useLayout'
import { useDocVersion } from '../panels/useY'
import { sectionDisplayName, useDocSnapshot, useRemoveSection } from './section-utils'

export interface SectionsListProps {
	yDoc: Y.Doc
	doc: YPagilloDocument
	layout: LayoutState
	/** Global index of the page in view. */
	current: number
	/** Story of the caret, if any (wins over `current` for the current-section badge). */
	caretStory?: string
	/** Insert, rename, reorder, settings, duplicate, remove. Absent = navigation only. */
	editable: boolean
	/** Scroll to section `id` and put the caret at the start of `story`. */
	onGo(id: string, story: string): void
	/** "Section settings…": open the section popover anchored to `el`. */
	onSettings(id: string, el: HTMLElement): void
	/** "Import Markdown below…": new section at `index` with `like`'s page setup. */
	onImportMarkdown?(like: string, index: number): void
}

export function SectionsList({
	yDoc,
	doc,
	layout,
	current,
	caretStory,
	editable,
	onGo,
	onSettings,
	onImportMarkdown
}: SectionsListProps) {
	const { t } = useTranslation()
	const removeSection = useRemoveSection(yDoc, doc)
	useDocVersion(doc)
	// Value unused: re-renders when a heading-derived name changes (story text is not in `useDocVersion`).
	useDocSnapshot(doc, () =>
		doc.secs
			.toArray()
			.map((id) => sectionDisplayName(doc, id, t))
			.join('\n')
	)
	const ref = React.useRef<HTMLDivElement>(null)
	const [editing, setEditing] = React.useState<string>()
	const [menu, setMenu] = React.useState<{
		id: string
		row: HTMLElement
		position?: { x: number; y: number }
	}>()

	const ids = doc.secs.toArray()
	const masters = new Map(mastersOf(doc))
	// Global page range of each laid-out section.
	const range = new Map<string, [number, number]>()
	let total = 0
	let inView: string | undefined
	for (const s of layout.sections) {
		if (s.pages) range.set(s.id, [total + 1, total + s.pages])
		if (current >= total && current < total + s.pages) inView = s.id
		total += s.pages
	}
	const caretSec = caretStory && sectionByStory(doc, caretStory)
	const currentSec = caretSec || inView
	const name = (id: string) => sectionDisplayName(doc, id, t)
	const focusRow = (id: string) =>
		requestAnimationFrame(() =>
			ref.current?.querySelector<HTMLElement>(`[data-sec="${CSS.escape(id)}"]`)?.focus()
		)

	/** Insert at `index`, copying page setup from `like`; then rename it and move the caret there. */
	const insert = (index: number, like: string | undefined) => {
		const s = like ? sectionOf(doc, like) : undefined
		if (!s) return
		const id = addSection(
			yDoc,
			doc,
			{ first: s.first, rest: s.rest, start: s.start },
			undefined,
			index
		)
		const story = sectionOf(doc, id)?.story
		if (story) onGo(id, story)
		setEditing(id)
	}
	const move = (id: string, to: number) => {
		if (to < 0 || to >= ids.length) return
		moveSection(yDoc, doc, id, to)
		focusRow(id)
	}

	const row = (id: string, index: number, handle?: React.ReactNode) => {
		const sec = sectionOf(doc, id)
		if (!sec) return null
		const n = name(id)
		const r = range.get(id)
		const master = layout.pages.get(pageKey(id, 0))?.page.master ?? sec.first
		const overset = layout.overset.some((o) => o.sec === id && !o.frame)
		const meta = [
			r &&
				(r[0] === r[1]
					? t('p. {{a}}', { a: r[0] })
					: t('pp. {{a}}–{{b}}', { a: r[0], b: r[1] })),
			masters.get(master)?.name
		]
			.filter(Boolean)
			.join(' · ')
		return (
			<div className="c-hbox pagillo-sec-row" data-current={id === currentSec || undefined}>
				{handle}
				{editing === id ? (
					<RenameInput
						initial={sec.name ?? ''}
						placeholder={n}
						label={t('Name')}
						onDone={(value, byKey) => {
							setEditing(undefined)
							if (value !== undefined) updateSection(yDoc, doc, id, { name: value })
							// On blur focus already went where the user put it.
							if (byKey) focusRow(id)
						}}
					/>
				) : (
					<TruncTip name={n} meta={meta}>
						<Button
							variant="link"
							className="pagillo-sec-main"
							data-sec={id}
							aria-current={id === currentSec ? 'location' : undefined}
							onClick={() => onGo(id, sec.story)}
							onKeyDown={(e) => {
								if (!editable || !e.altKey) return
								if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
								e.preventDefault()
								move(id, index + (e.key === 'ArrowUp' ? -1 : 1))
							}}
							onContextMenu={
								editable
									? (e) => {
											e.preventDefault()
											setMenu({
												id,
												row: e.currentTarget,
												position: isKeyboardContextMenu(e)
													? undefined
													: { x: e.clientX, y: e.clientY }
											})
										}
									: undefined
							}
						>
							<span className="pagillo-sec-name" data-trunc>
								{n}
							</span>
							{meta && (
								<span className="pagillo-sec-meta small text-muted" data-trunc>
									{meta}
								</span>
							)}
							{overset && (
								<span className="pagillo-sec-overset small">
									<IcWarning aria-hidden /> {t('Overset')}
								</span>
							)}
						</Button>
					</TruncTip>
				)}
				{editable && editing !== id && (
					<Button
						variant="ghost"
						size="sm"
						className="pagillo-sec-more"
						icon={<IcMore />}
						aria-label={t('Section actions')}
						aria-haspopup="menu"
						onClick={(e) => {
							const el =
								e.currentTarget.parentElement?.querySelector<HTMLElement>(
									'[data-sec]'
								)
							setMenu({ id, row: el ?? e.currentTarget })
						}}
					/>
				)}
			</div>
		)
	}

	const mi = menu ? ids.indexOf(menu.id) : -1
	return (
		<div ref={ref} className="c-vbox pagillo-sections">
			{editable ? (
				<SortableList
					className="pagillo-rail-list"
					items={ids}
					getKey={(id) => id}
					getLabel={name}
					onReorder={(from, to) => {
						const id = ids[from]
						if (id) moveSection(yDoc, doc, id, to)
					}}
					renderItem={(id, st) => row(id, st.index, st.handle)}
				/>
			) : (
				ids.map((id, i) => <React.Fragment key={id}>{row(id, i)}</React.Fragment>)
			)}
			{editable && (
				<Button
					variant="soft"
					size="sm"
					className="pagillo-sec-add"
					icon={<IcAdd />}
					onClick={() => insert(ids.length, ids[ids.length - 1])}
				>
					{t('New section')}
				</Button>
			)}
			{menu && mi >= 0 && (
				<Menu
					position={menu.position}
					anchor={menu.position ? undefined : menu.row}
					onClose={() => setMenu(undefined)}
				>
					<MenuItem
						label={t('Rename…')}
						// After the menu closes: its focus restore must not blur the input.
						onClick={() => requestAnimationFrame(() => setEditing(menu.id))}
					/>
					<MenuItem
						label={t('Section settings…')}
						onClick={() => onSettings(menu.id, menu.row)}
					/>
					<MenuItem
						label={t('Insert section above')}
						onClick={() => insert(mi, menu.id)}
					/>
					<MenuItem
						label={t('Insert section below')}
						onClick={() => insert(mi + 1, menu.id)}
					/>
					{onImportMarkdown && (
						<MenuItem
							label={t('Import Markdown below…')}
							onClick={() => onImportMarkdown(menu.id, mi + 1)}
						/>
					)}
					<MenuItem
						label={t('Duplicate')}
						onClick={() => {
							const copy = duplicateSection(yDoc, doc, menu.id, ` ${t('(copy)')}`)
							if (copy) focusRow(copy)
						}}
					/>
					<MenuItem
						label={t('Move up')}
						disabled={mi <= 0}
						onClick={() => move(menu.id, mi - 1)}
					/>
					<MenuItem
						label={t('Move down')}
						disabled={mi >= ids.length - 1}
						onClick={() => move(menu.id, mi + 1)}
					/>
					<MenuItem
						label={t('Remove')}
						color="error"
						disabled={ids.length <= 1}
						onClick={() => removeSection(menu.id)}
					/>
				</Menu>
			)}
		</div>
	)
}

/** Library tooltip with the full name + meta, only while a descendant marked `data-trunc` is cut off. */
function TruncTip({
	name,
	meta,
	children
}: {
	name: string
	meta: string
	children: React.ReactElement<{ ref?: React.Ref<HTMLElement> }>
}) {
	const ref = React.useRef<HTMLElement>(null)
	const [cut, setCut] = React.useState(false)
	React.useLayoutEffect(() => {
		const el = ref.current
		if (!el) return
		const check = () =>
			setCut(
				Array.from(el.querySelectorAll('[data-trunc]')).some(
					(e) => e.scrollWidth > e.clientWidth
				)
			)
		check()
		const ro = new ResizeObserver(check)
		ro.observe(el)
		return () => ro.disconnect()
	}, [name, meta])
	return (
		<Tooltip
			content={
				<>
					{name}
					{meta && <div className="small">{meta}</div>}
				</>
			}
			placement="right"
			describe={false}
			disabled={!cut}
		>
			{React.cloneElement(children, { ref })}
		</Tooltip>
	)
}

/** Inline rename: Enter (or leaving the field) keeps the text, Esc keeps the old name. */
function RenameInput({
	initial,
	placeholder,
	label,
	onDone
}: {
	initial: string
	placeholder: string
	label: string
	/** `byKey`: Enter / Esc (focus goes back to the row), not blur. */
	onDone(value: string | undefined, byKey: boolean): void
}) {
	const done = React.useRef(false)
	const ref = React.useRef<HTMLInputElement>(null)
	// Not `autoFocus`: the caller's `onGo` caret would blur it at once (and blur commits); its work
	// is queued earlier in this tick, so this frame wins. The row menu mounts this a frame after
	// it closes, so its focus restore is already done.
	React.useEffect(() => {
		const id = requestAnimationFrame(() => ref.current?.focus())
		return () => cancelAnimationFrame(id)
	}, [])
	const finish = (value: string | undefined, byKey: boolean) => {
		if (done.current) return
		done.current = true
		onDone(value, byKey)
	}
	return (
		<Input
			ref={ref}
			className="pagillo-sec-main"
			maxLength={SECTION_NAME_MAX}
			defaultValue={initial}
			placeholder={placeholder}
			aria-label={label}
			onKeyDown={(e) => {
				if (e.key === 'Enter') finish(e.currentTarget.value, true)
				else if (e.key === 'Escape') {
					e.stopPropagation()
					finish(undefined, true)
				} else return
				e.preventDefault()
			}}
			onBlur={(e) => finish(e.currentTarget.value, false)}
		/>
	)
}

// vim: ts=4
