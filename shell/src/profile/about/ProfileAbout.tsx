// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { useTranslation } from 'react-i18next'

import {
	LuPencil as IcEdit,
	LuCheck as IcDone,
	LuX as IcCancel,
	LuGripVertical as IcDrag
} from 'react-icons/lu'

import { Button, useDialog, mergeClasses } from '@cloudillo/react'
import type { SectionType } from '@cloudillo/types'

import { htmlToMd } from '../../lib/markdown.js'
import {
	type LayoutItem,
	type SectionWithContent,
	isColsLayout,
	parseSections,
	buildSavePatch,
	getDefaultContent,
	getSectionId
} from './types.js'
import { SectionView } from './SectionView.js'
import { SectionEditor } from './SectionEditor.js'
import { AddSectionPicker } from './AddSectionPicker.js'

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
// Drag location: identifies where a section lives in the layout
// ============================================================================

interface DragLocation {
	// Index in the top-level layout array
	layoutIndex: number
	// If inside a cols container: which column and position within it
	col?: 'left' | 'right'
	colIndex?: number
}

interface DragOver {
	loc: DragLocation
	half: 'top' | 'bottom' // mouse is in the top or bottom half of the target
}

function dragLocationsEqual(a: DragLocation | null, b: DragLocation | null): boolean {
	if (a === b) return true
	if (!a || !b) return false
	return a.layoutIndex === b.layoutIndex && a.col === b.col && a.colIndex === b.colIndex
}

// Determine if mouse is in the top or bottom half of the target element
function getDropHalf(e: React.DragEvent): 'top' | 'bottom' {
	const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
	return e.clientY < rect.top + rect.height / 2 ? 'top' : 'bottom'
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

	if (!rows.length) {
		return (
			<div className="c-panel pos-relative">
				<p className="text-muted text-center p-3">{t('No information available')}</p>
				{isOwner && (
					<Button
						kind="link"
						className="pos-absolute bottom-0 right-0 m-2"
						onClick={onEdit}
					>
						<IcEdit size="1.5rem" />
					</Button>
				)}
			</div>
		)
	}

	return (
		<div className="c-vbox g-1 pos-relative">
			{rows.map((row) => {
				if (row.kind === 'cols') {
					const key = row.left[0]?.id ?? row.right[0]?.id ?? 'cols'
					return (
						<div key={key} className="c-cols-view">
							<div className="c-vbox g-1 flex-fill">
								{row.left.map((s) => (
									<SectionView key={s.id} section={s} isOwner={isOwner} />
								))}
							</div>
							<div className="c-vbox g-1 flex-fill">
								{row.right.map((s) => (
									<SectionView key={s.id} section={s} isOwner={isOwner} />
								))}
							</div>
						</div>
					)
				}
				return <SectionView key={row.section.id} section={row.section} isOwner={isOwner} />
			})}
			{isOwner && (
				<div className="c-hbox justify-content-end mt-1">
					<Button kind="link" onClick={onEdit}>
						<IcEdit /> {t('Edit')}
					</Button>
				</div>
			)}
		</div>
	)
}

// ============================================================================
// Column drop zone (one side of a cols container)
// ============================================================================

function ColDropZone({
	sectionIds,
	sectionMap,
	isCommunity,
	layoutIndex,
	col,
	dragFrom,
	dragOver,
	onDragStart,
	onDragOver,
	onDrop,
	onDragEnd,
	onUpdate,
	onDelete
}: {
	sectionIds: string[]
	sectionMap: Map<string, SectionWithContent>
	isCommunity: boolean
	layoutIndex: number
	col: 'left' | 'right'
	dragFrom: DragLocation | null
	dragOver: DragOver | null
	onDragStart: (e: React.DragEvent, loc: DragLocation) => void
	onDragOver: (e: React.DragEvent, loc: DragLocation) => void
	onDrop: (e: React.DragEvent, loc: DragLocation, half: 'top' | 'bottom') => void
	onDragEnd: () => void
	onUpdate: (id: string, patch: Partial<SectionWithContent>) => void
	onDelete: (id: string) => void
}) {
	const { t } = useTranslation()

	if (!sectionIds.length) {
		const dropLoc: DragLocation = { layoutIndex, col, colIndex: 0 }
		return (
			<div
				className={mergeClasses(
					'c-cols-empty',
					dragFrom && 'drop-ready',
					dragOver && dragLocationsEqual(dragOver.loc, dropLoc) && 'drop-target'
				)}
				onDragOver={(e) => {
					e.stopPropagation()
					onDragOver(e, dropLoc)
				}}
				onDrop={(e) => {
					e.stopPropagation()
					onDrop(e, dropLoc, 'top')
				}}
			>
				<span className="text-muted">{t('Drag a section here')}</span>
			</div>
		)
	}

	return (
		<div className="c-vbox g-1 flex-fill">
			{sectionIds.map((id, i) => {
				const section = sectionMap.get(id)
				if (!section) return null
				const loc: DragLocation = { layoutIndex, col, colIndex: i }
				const isDragged = dragFrom && dragLocationsEqual(dragFrom, loc)
				const isOver = dragOver && dragLocationsEqual(dragOver.loc, loc)
				const isDropAbove = isOver && dragOver.half === 'top'
				const isDropBelow = isOver && dragOver.half === 'bottom'

				return (
					<div
						key={id}
						className={mergeClasses(
							'c-about-drag-item',
							isDragged && 'dragging',
							isDropAbove && 'drop-above',
							isDropBelow && 'drop-below'
						)}
						draggable
						onDragStart={(e) => {
							e.stopPropagation()
							onDragStart(e, loc)
						}}
						onDragOver={(e) => {
							e.stopPropagation()
							onDragOver(e, loc)
						}}
						onDrop={(e) => {
							e.stopPropagation()
							onDrop(e, loc, getDropHalf(e))
						}}
						onDragEnd={onDragEnd}
					>
						<SectionEditor
							section={section}
							isCommunity={isCommunity}
							onUpdate={(patch) => onUpdate(id, patch)}
							onDelete={() => onDelete(id)}
						/>
					</div>
				)
			})}
		</div>
	)
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

	const [layout, setLayout] = React.useState<LayoutItem[]>(() =>
		initialLayout.length ? initialLayout : []
	)
	const [sectionMap, setSectionMap] = React.useState<Map<string, SectionWithContent>>(
		() => new Map(initialSections.map((s) => [s.id, s]))
	)
	const [deletedIds, setDeletedIds] = React.useState<string[]>([])
	const [dirty, setDirty] = React.useState(false)

	// Drag state
	const [dragFrom, setDragFrom] = React.useState<DragLocation | null>(null)
	const [dragOver, setDragOver] = React.useState<DragOver | null>(null)

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
		// Remove from layout
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

	// ----------------------------------------------------------------
	// Drag & drop
	// ----------------------------------------------------------------

	function onDragStart(e: React.DragEvent, loc: DragLocation) {
		setDragFrom(loc)
		e.dataTransfer.effectAllowed = 'move'
	}

	function onDragOverHandler(e: React.DragEvent, loc: DragLocation) {
		e.preventDefault()
		e.dataTransfer.dropEffect = 'move'
		if (dragFrom && dragLocationsEqual(dragFrom, loc)) {
			setDragOver(null)
			return
		}
		setDragOver({ loc, half: getDropHalf(e) })
	}

	function onDropHandler(e: React.DragEvent, targetLoc: DragLocation, half: 'top' | 'bottom') {
		e.preventDefault()
		if (!dragFrom || dragLocationsEqual(dragFrom, targetLoc)) {
			setDragFrom(null)
			setDragOver(null)
			return
		}

		setLayout((prev) => {
			// 1. Extract the dragged section ID and target anchor
			const draggedId = getSectionAtLocation(prev, dragFrom)
			const targetAnchor = getDropAnchor(prev, targetLoc, half)
			if (!draggedId) return prev

			// 2. Remove from source (but keep empty cols — we may insert into them)
			let next = removeSectionFromLayout(prev, draggedId)

			// 3. Insert at target using stable anchor
			next = insertAtAnchor(next, draggedId, targetAnchor)

			// 4. Clean up empty cols containers only after insertion
			return cleanEmptyCols(next)
		})

		setDirty(true)
		setDragFrom(null)
		setDragOver(null)
	}

	function onDragEnd() {
		setDragFrom(null)
		setDragOver(null)
	}

	function handleSave() {
		// Convert rich-text sections from HTML back to markdown for storage
		const sections = [...sectionMap.values()].map((s) =>
			s.type === 'about' || s.type === 'custom' || s.type === 'rules'
				? { ...s, content: htmlToMd(s.content) }
				: s
		)
		// Clean up any empty cols before saving
		const cleanedLayout = cleanEmptyCols(layout)
		onSave(cleanedLayout, sections, deletedIds)
	}

	async function handleCancel() {
		if (dirty) {
			const confirmed = await dialog.confirm(
				t('Discard changes'),
				t('Are you sure you want to discard unsaved changes?')
			)
			if (!confirmed) return
		}
		onCancel()
	}

	return (
		<div className="c-vbox g-2">
			{/* Toolbar */}
			<div className="c-about-toolbar c-hbox align-items-center g-2 p-2">
				<h4 className="m-0 flex-fill">{t('Editing About Page')}</h4>
				<Button variant="secondary" size="small" onClick={handleCancel}>
					<IcCancel /> {t('Cancel')}
				</Button>
				<Button variant="primary" size="small" onClick={handleSave}>
					<IcDone /> {t('Done')}
				</Button>
			</div>

			{/* Layout items */}
			{layout.map((item, layoutIndex) => {
				if (isColsLayout(item)) {
					// 2-column container
					const colsLoc: DragLocation = { layoutIndex }
					const isDragged =
						dragFrom && !dragFrom.col && dragFrom.layoutIndex === layoutIndex
					const isOver =
						dragOver && !dragOver.loc.col && dragOver.loc.layoutIndex === layoutIndex
					const isDropAbove = isOver && dragOver.half === 'top'
					const isDropBelow = isOver && dragOver.half === 'bottom'

					return (
						<div
							key={`cols-${layoutIndex}`}
							className={mergeClasses(
								'c-about-drag-item',
								isDragged && 'dragging',
								isDropAbove && 'drop-above',
								isDropBelow && 'drop-below'
							)}
							draggable
							onDragStart={(e) => {
								// Only start drag from the header handle area
								const target = e.target as HTMLElement
								if (!target.closest('.c-cols-header')) {
									e.preventDefault()
									return
								}
								onDragStart(e, colsLoc)
							}}
							onDragOver={(e) => onDragOverHandler(e, colsLoc)}
							onDrop={(e) => onDropHandler(e, colsLoc, getDropHalf(e))}
							onDragEnd={onDragEnd}
						>
							<div className="c-cols-container">
								<div className="c-cols-header">
									<span className="c-drag-handle">
										<IcDrag size="1.2rem" />
									</span>
									<span className="text-muted text-sm">
										{t('2-Column Layout')}
									</span>
								</div>
								<div className="c-cols-body">
									<ColDropZone
										sectionIds={item.left}
										sectionMap={sectionMap}
										isCommunity={isCommunity}
										layoutIndex={layoutIndex}
										col="left"
										dragFrom={dragFrom}
										dragOver={dragOver}
										onDragStart={onDragStart}
										onDragOver={onDragOverHandler}
										onDrop={onDropHandler}
										onDragEnd={onDragEnd}
										onUpdate={updateSection}
										onDelete={deleteSection}
									/>
									<ColDropZone
										sectionIds={item.right}
										sectionMap={sectionMap}
										isCommunity={isCommunity}
										layoutIndex={layoutIndex}
										col="right"
										dragFrom={dragFrom}
										dragOver={dragOver}
										onDragStart={onDragStart}
										onDragOver={onDragOverHandler}
										onDrop={onDropHandler}
										onDragEnd={onDragEnd}
										onUpdate={updateSection}
										onDelete={deleteSection}
									/>
								</div>
							</div>
						</div>
					)
				}

				// Regular section
				const section = sectionMap.get(item)
				if (!section) return null
				const loc: DragLocation = { layoutIndex }
				const isDragged = dragFrom && dragLocationsEqual(dragFrom, loc)
				const isOver = dragOver && dragLocationsEqual(dragOver.loc, loc)
				const isDropAbove = isOver && dragOver.half === 'top'
				const isDropBelow = isOver && dragOver.half === 'bottom'

				return (
					<div
						key={section.id}
						className={mergeClasses(
							'c-about-drag-item',
							isDragged && 'dragging',
							isDropAbove && 'drop-above',
							isDropBelow && 'drop-below'
						)}
						draggable
						onDragStart={(e) => onDragStart(e, loc)}
						onDragOver={(e) => onDragOverHandler(e, loc)}
						onDrop={(e) => onDropHandler(e, loc, getDropHalf(e))}
						onDragEnd={onDragEnd}
					>
						<SectionEditor
							section={section}
							isCommunity={isCommunity}
							onUpdate={(patch) => updateSection(section.id, patch)}
							onDelete={() => deleteSection(section.id)}
						/>
					</div>
				)
			})}

			{/* Add section / columns */}
			<AddSectionPicker
				sections={[...sectionMap.values()]}
				isCommunity={isCommunity}
				onAdd={addSection}
				onAddCols={addColsContainer}
			/>
		</div>
	)
}

// ============================================================================
// Layout manipulation helpers
// ============================================================================

function getSectionAtLocation(layout: LayoutItem[], loc: DragLocation): string | undefined {
	const item = layout[loc.layoutIndex]
	if (!item) return undefined
	if (typeof item === 'string' && !loc.col) return item
	if (isColsLayout(item) && loc.col) {
		const list = loc.col === 'left' ? item.left : item.right
		return list[loc.colIndex ?? 0]
	}
	return undefined
}

// Stable anchor: captures what to insert next to, surviving index shifts after removal
interface DropAnchor {
	// Target section ID to insert near, or null for append/cols
	neighborId: string | null
	// Insert before or after the neighbor
	position: 'before' | 'after'
	// For column targets: which cols container (identified by a section ID inside it)
	colsAnchorId?: string
	// Fallback: nth cols container (0-based) when colsAnchorId is unavailable (empty cols)
	colsNth?: number
	col?: 'left' | 'right'
	colIndex?: number
}

function countColsBefore(layout: LayoutItem[], layoutIndex: number): number {
	let nth = 0
	for (let i = 0; i < layoutIndex; i++) {
		if (isColsLayout(layout[i])) nth++
	}
	return nth
}

function getDropAnchor(
	layout: LayoutItem[],
	loc: DragLocation,
	half: 'top' | 'bottom'
): DropAnchor {
	const item = layout[loc.layoutIndex]
	const position = half === 'top' ? 'before' : 'after'

	if (loc.col && item && isColsLayout(item)) {
		// Dropping into a column
		const allIds = [...item.left, ...item.right]
		const colList = loc.col === 'left' ? item.left : item.right
		const colIndex = loc.colIndex ?? 0
		// Insert position: before = at colIndex, after = at colIndex + 1
		const insertIndex = half === 'top' ? colIndex : colIndex + 1
		return {
			neighborId: null,
			position,
			colsAnchorId: allIds[0],
			colsNth: countColsBefore(layout, loc.layoutIndex),
			col: loc.col,
			colIndex: Math.min(insertIndex, colList.length)
		}
	}

	// Dropping at top level
	if (item) {
		if (typeof item === 'string') {
			return { neighborId: item, position }
		}
		// Dropping onto a cols container
		const allIds = [...item.left, ...item.right]
		return {
			neighborId: null,
			position,
			colsAnchorId: allIds[0],
			colsNth: countColsBefore(layout, loc.layoutIndex)
		}
	}

	// Past the end
	return { neighborId: null, position: 'after' }
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

function findColsContainerIndex(layout: LayoutItem[], anchorId: string): number {
	return layout.findIndex(
		(item) =>
			isColsLayout(item) && (item.left.includes(anchorId) || item.right.includes(anchorId))
	)
}

function findNthColsIndex(layout: LayoutItem[], nth: number): number {
	let count = 0
	for (let i = 0; i < layout.length; i++) {
		if (isColsLayout(layout[i])) {
			if (count === nth) return i
			count++
		}
	}
	return -1
}

function findColsIndex(layout: LayoutItem[], anchor: DropAnchor): number {
	// Try by anchor ID first
	if (anchor.colsAnchorId) {
		const idx = findColsContainerIndex(layout, anchor.colsAnchorId)
		if (idx !== -1) return idx
	}
	// Fallback: find nth cols container
	if (anchor.colsNth != null) {
		return findNthColsIndex(layout, anchor.colsNth)
	}
	return -1
}

function insertAtAnchor(layout: LayoutItem[], id: string, anchor: DropAnchor): LayoutItem[] {
	// Insert into a column
	if (anchor.col) {
		const colsIdx = findColsIndex(layout, anchor)
		if (colsIdx === -1) return [...layout, id] // fallback

		return layout.map((item, i) => {
			if (i !== colsIdx || !isColsLayout(item)) return item
			const cols = { left: [...item.left], right: [...item.right] }
			const list = anchor.col === 'left' ? cols.left : cols.right
			list.splice(anchor.colIndex ?? list.length, 0, id)
			return cols
		})
	}

	// Insert at top level next to neighbor
	if (anchor.neighborId) {
		const idx = layout.indexOf(anchor.neighborId)
		if (idx !== -1) {
			const insertIdx = anchor.position === 'after' ? idx + 1 : idx
			const next = [...layout]
			next.splice(insertIdx, 0, id)
			return next
		}
	}

	// Dropping onto a cols container
	const colsIdx = findColsIndex(layout, anchor)
	if (colsIdx !== -1) {
		const insertIdx = anchor.position === 'after' ? colsIdx + 1 : colsIdx
		const next = [...layout]
		next.splice(insertIdx, 0, id)
		return next
	}

	// Append
	return [...layout, id]
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
