// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import {
	Button,
	EmptyState,
	Grid,
	HBox,
	Panel,
	SortableGroup,
	SortableList,
	Text,
	useDialog,
	VBox
} from '@cloudillo/react'
import type { SectionType } from '@cloudillo/types'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuX as IcCancel, LuCheck as IcDone, LuPencil as IcEdit } from 'react-icons/lu'

import { htmlToMd } from '../../lib/markdown.js'
import { AddSectionPicker } from './AddSectionPicker.js'
import { SectionEditor } from './SectionEditor.js'
import { SectionView } from './SectionView.js'
import {
	buildSavePatch,
	getDefaultContent,
	getSectionId,
	isColsLayout,
	type LayoutItem,
	parseSections,
	type SectionWithContent
} from './types.js'

// ============================================================================
// Types
// ============================================================================

type XMap = Record<string, string>

interface ProfileAboutProps {
	profile: {
		idTag: string
		type: 'community' | 'person'
		x?: XMap
	}
	updateProfile?: (patch: { x: Record<string, string | null> }) => Promise<void>
}

// ============================================================================
// Check if a section has meaningful content
// ============================================================================

function hasContent(s: SectionWithContent): boolean {
	if (!s.content) return false
	if (['contact', 'location', 'links', 'work', 'education', 'skills'].includes(s.type)) {
		try {
			const parsed = JSON.parse(s.content)
			if (Array.isArray(parsed.links) && !parsed.links.length) return false
			if (Array.isArray(parsed.entries) && !parsed.entries.length) return false
			if (Array.isArray(parsed.tags) && !parsed.tags.length) return false
			if (s.type === 'contact' && !parsed.email && !parsed.phone && !parsed.website)
				return false
			if (s.type === 'location' && !parsed.city && !parsed.country && !parsed.address)
				return false
		} catch {
			// Non-JSON content, show it
		}
	}
	return true
}

// ============================================================================
// View mode
// ============================================================================

function AboutViewMode({
	layout,
	sections,
	isOwner,
	onEdit
}: {
	layout: LayoutItem[]
	sections: SectionWithContent[]
	isOwner: boolean
	onEdit: () => void
}) {
	const { t } = useTranslation()

	const sectionMap = new Map(sections.map((s) => [s.id, s]))

	// Filter empty sections for non-owners
	const visibleMap = isOwner
		? sectionMap
		: new Map([...sectionMap].filter(([_, s]) => hasContent(s)))

	type ViewRow =
		| { kind: 'section'; section: SectionWithContent }
		| { kind: 'cols'; left: SectionWithContent[]; right: SectionWithContent[] }

	const rows: ViewRow[] = []
	for (const item of layout) {
		if (typeof item === 'string') {
			const s = visibleMap.get(item)
			if (s) rows.push({ kind: 'section', section: s })
		} else {
			const left = item.left
				.map((id) => visibleMap.get(id))
				.filter(Boolean) as SectionWithContent[]
			const right = item.right
				.map((id) => visibleMap.get(id))
				.filter(Boolean) as SectionWithContent[]
			if (left.length || right.length) {
				rows.push({ kind: 'cols', left, right })
			}
		}
	}

	const editButton = isOwner ? (
		<Button variant="ghost" size="sm" icon={<IcEdit />} onClick={onEdit}>
			{t('Edit')}
		</Button>
	) : null

	if (!rows.length) {
		return <EmptyState title={t('No information available')} actions={editButton} />
	}

	// The Edit button sits in the first card's header, not detached below the cards
	const first = rows[0]
	const firstId =
		first.kind === 'section' ? first.section.id : (first.left[0] ?? first.right[0])?.id
	const view = (s: SectionWithContent) => (
		<SectionView
			key={s.id}
			section={s}
			isOwner={isOwner}
			actions={s.id === firstId ? editButton : undefined}
		/>
	)

	return (
		<VBox gap={1}>
			{rows.map((row) => {
				if (row.kind === 'cols') {
					const key = row.left[0]?.id ?? row.right[0]?.id ?? 'cols'
					// One-sided row: full width instead of an empty half
					if (!row.left.length || !row.right.length) {
						return (
							<VBox key={key} gap={1}>
								{[...row.left, ...row.right].map(view)}
							</VBox>
						)
					}
					return (
						<Grid key={key} min="16rem" gap={1}>
							<VBox gap={1}>{row.left.map(view)}</VBox>
							<VBox gap={1}>{row.right.map(view)}</VBox>
						</Grid>
					)
				}
				return view(row.section)
			})}
		</VBox>
	)
}

// ============================================================================
// Layout manipulation helpers
// ============================================================================

// SortableList groups: `top` is the layout itself, `<layoutIndex>:left|right` a column
const TOP = 'top'

function colGroup(layoutIndex: number, col: 'left' | 'right'): string {
	return `${layoutIndex}:${col}`
}

/** Move an item between (or within) groups; a cols container never goes into a column */
function moveItem(
	layout: LayoutItem[],
	fromGroup: string,
	from: number,
	toGroup: string,
	to: number
): LayoutItem[] {
	const next: LayoutItem[] = layout.map((item) =>
		typeof item === 'string' ? item : { left: [...item.left], right: [...item.right] }
	)
	function list(group: string): LayoutItem[] {
		if (group === TOP) return next
		const [idx, col] = group.split(':')
		const cols = next[Number(idx)]
		return isColsLayout(cols) ? cols[col as 'left' | 'right'] : []
	}
	// Resolve both lists before splicing: removing from `top` shifts column indices
	const src = list(fromGroup)
	const dst = list(toGroup)
	const item = src[from]
	if (item === undefined || (toGroup !== TOP && typeof item !== 'string')) return layout
	src.splice(from, 1)
	dst.splice(to, 0, item)
	return next
}

function removeSectionFromLayout(layout: LayoutItem[], id: string): LayoutItem[] {
	return layout
		.map((item) => {
			if (typeof item === 'string') return item === id ? null : item
			return {
				left: item.left.filter((s) => s !== id),
				right: item.right.filter((s) => s !== id)
			}
		})
		.filter((item): item is LayoutItem => item !== null)
}

function cleanEmptyCols(layout: LayoutItem[]): LayoutItem[] {
	return layout.filter((item) => {
		if (typeof item === 'string') return true
		return item.left.length > 0 || item.right.length > 0
	})
}

// ============================================================================
// Edit mode
// ============================================================================

function AboutEditMode({
	initialLayout,
	initialSections,
	isCommunity,
	onSave,
	onCancel
}: {
	initialLayout: LayoutItem[]
	initialSections: SectionWithContent[]
	isCommunity: boolean
	onSave: (layout: LayoutItem[], sections: SectionWithContent[], deletedIds: string[]) => void
	onCancel: () => void
}) {
	const { t } = useTranslation()
	const dialog = useDialog()

	const [layout, setLayout] = React.useState<LayoutItem[]>(initialLayout)
	const [sectionMap, setSectionMap] = React.useState<Map<string, SectionWithContent>>(
		() => new Map(initialSections.map((s) => [s.id, s]))
	)
	const [deletedIds, setDeletedIds] = React.useState<string[]>([])
	const [dirty, setDirty] = React.useState(false)

	function updateSection(id: string, patch: Partial<SectionWithContent>) {
		setSectionMap((prev) => {
			const next = new Map(prev)
			const existing = next.get(id)
			if (existing) next.set(id, { ...existing, ...patch })
			return next
		})
		setDirty(true)
	}

	function deleteSection(id: string) {
		setLayout((prev) => removeSectionFromLayout(prev, id))
		setSectionMap((prev) => {
			const next = new Map(prev)
			next.delete(id)
			return next
		})
		setDeletedIds((prev) => [...prev, id])
		setDirty(true)
	}

	function addSection(type: SectionType) {
		const existingIds = [...sectionMap.keys()]
		const newSection: SectionWithContent = {
			id: getSectionId(type, existingIds),
			type,
			content: getDefaultContent(type),
			visibility: 'P'
		}
		if (type === 'custom') {
			newSection.title = ''
		}
		setSectionMap((prev) => new Map(prev).set(newSection.id, newSection))
		setLayout((prev) => [...prev, newSection.id])
		setDirty(true)
	}

	function addColsContainer() {
		setLayout((prev) => [...prev, { left: [], right: [] }])
		setDirty(true)
	}

	function reorderInto(group: string) {
		return (from: number, to: number, fromGroup?: string) => {
			setLayout((prev) => moveItem(prev, fromGroup ?? group, from, group, to))
			setDirty(true)
		}
	}

	function handleSave() {
		// Convert rich-text sections from HTML back to markdown for storage
		const sections = [...sectionMap.values()].map((s) =>
			s.type === 'about' || s.type === 'custom' || s.type === 'rules'
				? // Quill 2's getSemanticHTML emits every space as &nbsp;, which Turndown keeps
					{ ...s, content: htmlToMd(s.content.replace(/&nbsp;| /g, ' ')) }
				: s
		)
		onSave(cleanEmptyCols(layout), sections, deletedIds)
	}

	async function handleCancel() {
		if (dirty) {
			const confirmed = await dialog.confirm(
				t('Discard changes'),
				t('Are you sure you want to discard unsaved changes?'),
				{ color: 'error', confirmLabel: t('Discard') }
			)
			if (!confirmed) return
		}
		onCancel()
	}

	function sectionLabel(id: string): string {
		const s = sectionMap.get(id)
		return s?.title || s?.type || id
	}

	function renderSection(id: string, handle: React.ReactNode) {
		const section = sectionMap.get(id)
		if (!section) return null
		return (
			<SectionEditor
				section={section}
				isCommunity={isCommunity}
				handle={handle}
				onUpdate={(patch) => updateSection(id, patch)}
				onDelete={() => deleteSection(id)}
			/>
		)
	}

	function renderColumn(layoutIndex: number, col: 'left' | 'right', ids: string[]) {
		return (
			<VBox gap={1}>
				{!ids.length && (
					<Text size="sm" emphasis="muted" align="center">
						{t('Drag a section here')}
					</Text>
				)}
				<SortableList
					group={colGroup(layoutIndex, col)}
					className={ids.length ? 'g-1' : 'p-4'}
					items={ids}
					getKey={(id) => id}
					getLabel={sectionLabel}
					onReorder={reorderInto(colGroup(layoutIndex, col))}
					renderItem={(id, { handle }) => renderSection(id, handle)}
				/>
			</VBox>
		)
	}

	return (
		<Panel
			variant="soft"
			title={t('Editing About Page')}
			headingLevel={4}
			actions={
				<HBox gap={2}>
					<Button size="sm" icon={<IcCancel />} onClick={handleCancel}>
						{t('Cancel')}
					</Button>
					<Button color="primary" size="sm" icon={<IcDone />} onClick={handleSave}>
						{t('Done')}
					</Button>
				</HBox>
			}
		>
			<VBox gap={2}>
				<SortableGroup>
					<SortableList
						group={TOP}
						className="g-2"
						items={layout}
						getKey={(item) =>
							typeof item === 'string' ? item : `cols:${layout.indexOf(item)}`
						}
						getLabel={(item) =>
							typeof item === 'string' ? sectionLabel(item) : t('2-Column Layout')
						}
						onReorder={reorderInto(TOP)}
						renderItem={(item, { handle }) => {
							if (!isColsLayout(item)) return renderSection(item, handle)
							const layoutIndex = layout.indexOf(item)
							return (
								<Panel
									padding={2}
									title={
										<HBox gap={2} align="center">
											{handle}
											<Text size="sm" emphasis="muted">
												{t('2-Column Layout')}
											</Text>
										</HBox>
									}
									headingLevel={5}
								>
									<Grid min="16rem" gap={2}>
										{renderColumn(layoutIndex, 'left', item.left)}
										{renderColumn(layoutIndex, 'right', item.right)}
									</Grid>
								</Panel>
							)
						}}
					/>
				</SortableGroup>

				<AddSectionPicker
					sections={[...sectionMap.values()]}
					isCommunity={isCommunity}
					onAdd={addSection}
					onAddCols={addColsContainer}
				/>
			</VBox>
		</Panel>
	)
}

// ============================================================================
// Main ProfileAbout component
// ============================================================================

export function ProfileAbout({ profile, updateProfile }: ProfileAboutProps) {
	const [editing, setEditing] = React.useState(false)
	const { layout, sections } = parseSections(profile.x)
	const isOwner = !!updateProfile
	const isCommunity = profile.type === 'community'

	async function handleSave(
		newLayout: LayoutItem[],
		newSections: SectionWithContent[],
		deletedIds: string[]
	) {
		if (!updateProfile) return

		const xPatch = buildSavePatch(newLayout, newSections, deletedIds)
		try {
			await updateProfile({ x: xPatch })
			setEditing(false)
		} catch (err) {
			console.error('Failed to save profile:', err)
		}
	}

	if (editing) {
		return (
			<AboutEditMode
				initialLayout={layout}
				initialSections={sections}
				isCommunity={isCommunity}
				onSave={handleSave}
				onCancel={() => setEditing(false)}
			/>
		)
	}

	return (
		<AboutViewMode
			layout={layout}
			sections={sections}
			isOwner={isOwner}
			onEdit={() => setEditing(true)}
		/>
	)
}

// vim: ts=4
