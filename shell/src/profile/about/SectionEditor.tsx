// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { useTranslation } from 'react-i18next'

import {
	LuGripVertical as IcDrag,
	LuEllipsisVertical as IcMore,
	LuTrash2 as IcDelete,
	LuPencil as IcRename
} from 'react-icons/lu'

import { Button, Popper, useDialog, mergeClasses } from '@cloudillo/react'

import type { SectionWithContent } from './types.js'
import { getSectionTitle } from './types.js'
import { SectionVisibilitySelector } from './SectionVisibilitySelector.js'
import { AboutSectionEdit } from './sections/AboutSection.js'
import { ContactSectionEdit } from './sections/ContactSection.js'
import { LocationSectionEdit } from './sections/LocationSection.js'
import { LinksSectionEdit } from './sections/LinksSection.js'
import { WorkSectionEdit } from './sections/WorkSection.js'
import { EducationSectionEdit } from './sections/EducationSection.js'
import { SkillsSectionEdit } from './sections/SkillsSection.js'

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
	className?: string
}

export function SectionEditor({
	section,
	isCommunity,
	onUpdate,
	onDelete,
	className
}: SectionEditorProps) {
	const { t } = useTranslation()
	const dialog = useDialog()
	const [renaming, setRenaming] = React.useState(false)
	const [titleInput, setTitleInput] = React.useState(section.title || '')
	const title = getSectionTitle(t, section)

	async function handleDelete() {
		const confirmed = await dialog.confirm(
			t('Delete section'),
			t('Are you sure you want to delete "{{title}}"?', { title })
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
		<div className={mergeClasses('c-panel c-vbox g-2', className)}>
			{/* Header */}
			<div className="c-hbox align-items-center g-2">
				<span className="c-drag-handle">
					<IcDrag size="1.2rem" />
				</span>

				{renaming ? (
					<input
						className="c-input flex-fill"
						value={titleInput}
						onChange={(e) => setTitleInput(e.target.value)}
						onBlur={commitRename}
						onKeyDown={onRenameKeyDown}
						autoFocus
					/>
				) : (
					<h4 className="m-0 flex-fill text-base">{title}</h4>
				)}

				<SectionVisibilitySelector
					value={section.visibility}
					onChange={(visibility) => onUpdate({ visibility })}
					isCommunity={isCommunity}
				/>

				<Popper menuClassName="c-btn link secondary sm" icon={<IcMore />}>
					<ul className="c-nav vertical">
						<li>
							<Button kind="nav-item" onClick={handleRename}>
								<IcRename />
								{t('Rename section')}
							</Button>
						</li>
						<li role="separator" className="border-bottom my-1" />
						<li>
							<Button kind="nav-item" onClick={handleDelete}>
								<IcDelete className="text-error" />
								<span className="text-error">{t('Delete section')}</span>
							</Button>
						</li>
					</ul>
				</Popper>
			</div>

			{/* Content editor */}
			<SectionContentEditor section={section} onChange={(content) => onUpdate({ content })} />
		</div>
	)
}

// vim: ts=4
