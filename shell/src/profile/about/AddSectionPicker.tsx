// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { usePopper } from 'react-popper'

import {
	LuPlus as IcPlus,
	LuType as IcText,
	LuMail as IcContact,
	LuMapPin as IcLocation,
	LuLink as IcLinks,
	LuBriefcase as IcWork,
	LuGraduationCap as IcEducation,
	LuTags as IcSkills,
	LuScrollText as IcRules,
	LuFileText as IcCustom,
	LuColumns2 as IcColumns
} from 'react-icons/lu'

import { Button, mergeClasses } from '@cloudillo/react'
import type { SectionType } from '@cloudillo/types'

import { type SectionWithContent, SECTION_TYPES } from './types.js'

const SECTION_ICONS: Record<SectionType, React.ComponentType> = {
	about: IcText,
	contact: IcContact,
	location: IcLocation,
	links: IcLinks,
	work: IcWork,
	education: IcEducation,
	skills: IcSkills,
	rules: IcRules,
	custom: IcCustom
}

interface AddSectionPickerProps {
	sections: SectionWithContent[]
	isCommunity: boolean
	onAdd: (type: SectionType) => void
	onAddCols?: () => void
}

export function AddSectionPicker({
	sections,
	isCommunity,
	onAdd,
	onAddCols
}: AddSectionPickerProps) {
	const { t } = useTranslation()

	const availableTypes = SECTION_TYPES.filter((def) => {
		// Filter by profile type
		if (isCommunity && !def.community) return false
		if (!isCommunity && !def.personal) return false
		return true
	})

	const usedTypes = new Set(sections.map((s) => s.type))

	const [open, setOpen] = React.useState(false)
	const [btnEl, setBtnEl] = React.useState<HTMLButtonElement | null>(null)
	const [popperEl, setPopperEl] = React.useState<HTMLDivElement | null>(null)
	const { styles: popperStyles, attributes } = usePopper(btnEl, popperEl, {
		placement: 'top-start',
		strategy: 'fixed'
	})

	React.useEffect(() => {
		if (!open) return

		function handleClickOutside(evt: MouseEvent) {
			if (
				evt.target instanceof Node &&
				!popperEl?.contains(evt.target) &&
				!btnEl?.contains(evt.target)
			) {
				setOpen(false)
			}
		}

		document.addEventListener('click', handleClickOutside, true)
		return () => document.removeEventListener('click', handleClickOutside, true)
	}, [open, popperEl, btnEl])

	function handleAdd(type: SectionType) {
		onAdd(type)
		setOpen(false)
	}

	function handleAddCols() {
		onAddCols?.()
		setOpen(false)
	}

	return (
		<div className="c-vbox g-1">
			<Button
				ref={setBtnEl}
				kind="link"
				className="c-about-add-btn w-100 p-2"
				onClick={() => setOpen(!open)}
			>
				<IcPlus /> {t('Add Section')}
			</Button>
			{open &&
				createPortal(
					<div
						ref={setPopperEl}
						className="c-popper high"
						style={popperStyles.popper}
						{...attributes.popper}
					>
						<div className="c-panel c-vbox g-1 p-2">
							{availableTypes.map((def) => {
								const Icon = SECTION_ICONS[def.type]
								const isUsed = usedTypes.has(def.type) && !def.multiple
								return (
									<Button
										key={def.type}
										kind="link"
										disabled={isUsed}
										className={mergeClasses(
											'c-hbox g-2 align-items-center p-2 border-radius-sm justify-content-start text-left',
											isUsed && 'text-muted'
										)}
										onClick={() => handleAdd(def.type)}
									>
										<Icon />
										<span className="c-vbox g-0">
											<span>{t(def.defaultTitle)}</span>
											<small className="text-muted">
												{t(def.description)}
											</small>
										</span>
									</Button>
								)
							})}
							{onAddCols && (
								<>
									<hr className="border-bottom my-1" />
									<Button
										kind="link"
										className="c-hbox g-2 align-items-center p-2 border-radius-sm justify-content-start text-left"
										onClick={handleAddCols}
									>
										<IcColumns />
										<span className="c-vbox g-0">
											<span>{t('2-Column Layout')}</span>
											<small className="text-muted">
												{t('Side-by-side sections')}
											</small>
										</span>
									</Button>
								</>
							)}
						</div>
					</div>,
					document.getElementById('popper-container')!
				)}
		</div>
	)
}

// vim: ts=4
