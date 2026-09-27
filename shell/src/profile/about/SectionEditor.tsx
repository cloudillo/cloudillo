// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import {
	Button,
	COMMUNITY_VISIBILITY,
	HBox,
	Input,
	Menu,
	MenuDivider,
	MenuItem,
	PERSONAL_VISIBILITY,
	Panel,
	Text,
	useDialog,
	type VisibilityCode,
	VisibilitySelect
} from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
	LuTrash2 as IcDelete,
	LuEllipsisVertical as IcMore,
	LuPencil as IcRename
} from 'react-icons/lu'

import { AboutSectionEdit } from './sections/AboutSection.js'
import { ContactSectionEdit } from './sections/ContactSection.js'
import { EducationSectionEdit } from './sections/EducationSection.js'
import { LinksSectionEdit } from './sections/LinksSection.js'
import { LocationSectionEdit } from './sections/LocationSection.js'
import { SkillsSectionEdit } from './sections/SkillsSection.js'
import { WorkSectionEdit } from './sections/WorkSection.js'
import type { SectionWithContent } from './types.js'
import { getSectionTitle } from './types.js'

// ============================================================================
// Section content editor dispatcher
// ============================================================================

function SectionContentEditor({
	section,
	onChange
}: {
	section: SectionWithContent
	onChange: (content: string) => void
}) {
	switch (section.type) {
		case 'about':
		case 'custom':
		case 'rules':
			return <AboutSectionEdit section={section} onChange={onChange} />
		case 'contact':
			return <ContactSectionEdit section={section} onChange={onChange} />
		case 'location':
			return <LocationSectionEdit section={section} onChange={onChange} />
		case 'links':
			return <LinksSectionEdit section={section} onChange={onChange} />
		case 'work':
			return <WorkSectionEdit section={section} onChange={onChange} />
		case 'education':
			return <EducationSectionEdit section={section} onChange={onChange} />
		case 'skills':
			return <SkillsSectionEdit section={section} onChange={onChange} />
		default:
			return null
	}
}

// ============================================================================
// Section Editor
// ============================================================================

interface SectionEditorProps {
	section: SectionWithContent
	isCommunity: boolean
	onUpdate: (patch: Partial<SectionWithContent>) => void
	onDelete: () => void
	/** Drag handle from SortableList */
	handle?: React.ReactNode
}

export function SectionEditor({
	section,
	isCommunity,
	onUpdate,
	onDelete,
	handle
}: SectionEditorProps) {
	const { t } = useTranslation()
	const dialog = useDialog()
	const [renaming, setRenaming] = React.useState(false)
	const [titleInput, setTitleInput] = React.useState(section.title || '')
	const title = getSectionTitle(t, section)

	async function handleDelete() {
		const confirmed = await dialog.confirm(
			t('Delete section'),
			t('Are you sure you want to delete "{{title}}"?', { title }),
			{ color: 'error', confirmLabel: t('Delete') }
		)
		if (confirmed) onDelete()
	}

	function handleRename() {
		setRenaming(true)
		setTitleInput(section.title || '')
	}

	function commitRename() {
		const trimmed = titleInput.trim()
		onUpdate({ title: trimmed || undefined })
		setRenaming(false)
	}

	function onRenameKeyDown(e: React.KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault()
			commitRename()
		} else if (e.key === 'Escape') {
			setRenaming(false)
		}
	}

	return (
		<Panel
			title={
				<HBox gap={2} align="center">
					{handle}
					{renaming ? (
						<Input
							className="flex-fill"
							aria-label={t('Section title')}
							value={titleInput}
							onChange={(e) => setTitleInput(e.target.value)}
							onBlur={commitRename}
							onKeyDown={onRenameKeyDown}
							autoFocus
						/>
					) : (
						<Text weight="semibold">{title}</Text>
					)}
				</HBox>
			}
			headingLevel={4}
			actions={
				<HBox gap={1} align="center">
					<VisibilitySelect
						value={section.visibility as VisibilityCode}
						onChange={(visibility) => onUpdate({ visibility })}
						options={isCommunity ? COMMUNITY_VISIBILITY : PERSONAL_VISIBILITY}
						aria-label={t('Visibility')}
					/>
					<Menu
						trigger={
							<Button
								variant="ghost"
								size="sm"
								icon={<IcMore />}
								aria-label={t('Section options')}
							/>
						}
					>
						<MenuItem
							icon={<IcRename />}
							label={t('Rename section')}
							onClick={handleRename}
						/>
						<MenuDivider />
						<MenuItem
							icon={<IcDelete />}
							label={t('Delete section')}
							color="error"
							onClick={handleDelete}
						/>
					</Menu>
				</HBox>
			}
		>
			<SectionContentEditor section={section} onChange={(content) => onUpdate({ content })} />
		</Panel>
	)
}

// vim: ts=4
