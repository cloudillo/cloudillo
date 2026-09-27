// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { Button, Menu, MenuDivider, MenuItem } from '@cloudillo/react'
import type { SectionType } from '@cloudillo/types'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
	LuColumns2 as IcColumns,
	LuMail as IcContact,
	LuFileText as IcCustom,
	LuGraduationCap as IcEducation,
	LuLink as IcLinks,
	LuMapPin as IcLocation,
	LuPlus as IcPlus,
	LuScrollText as IcRules,
	LuTags as IcSkills,
	LuType as IcText,
	LuBriefcase as IcWork
} from 'react-icons/lu'

import { getSectionTypes, type SectionWithContent } from './types.js'

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

	const availableTypes = React.useMemo(
		() =>
			getSectionTypes(t).filter((def) => {
				// Filter by profile type
				if (isCommunity && !def.community) return false
				if (!isCommunity && !def.personal) return false
				return true
			}),
		[t, isCommunity]
	)

	const usedTypes = new Set(sections.map((s) => s.type))

	return (
		<Menu
			placement="top-start"
			trigger={
				<Button variant="ghost" className="w-100" icon={<IcPlus />}>
					{t('Add Section')}
				</Button>
			}
		>
			{availableTypes.map((def) => {
				const Icon = SECTION_ICONS[def.type]
				return (
					<MenuItem
						key={def.type}
						icon={<Icon />}
						label={def.defaultTitle}
						description={def.description}
						disabled={usedTypes.has(def.type) && !def.multiple}
						onClick={() => onAdd(def.type)}
					/>
				)
			})}
			{onAddCols && (
				<>
					<MenuDivider />
					<MenuItem
						icon={<IcColumns />}
						label={t('2-Column Layout')}
						description={t('Side-by-side sections')}
						onClick={onAddCols}
					/>
				</>
			)}
		</Menu>
	)
}

// vim: ts=4
