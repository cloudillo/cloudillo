// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { useTranslation } from 'react-i18next'

import {
	LuGlobe as IcGlobe,
	LuUsers as IcUsers,
	LuUserCheck as IcUserCheck,
	LuShield as IcRole
} from 'react-icons/lu'

import { mergeClasses } from '@cloudillo/react'

import type { SectionWithContent } from './types.js'
import { getSectionTitle } from './types.js'
import { AboutSectionView } from './sections/AboutSection.js'
import { ContactSectionView } from './sections/ContactSection.js'
import { LocationSectionView } from './sections/LocationSection.js'
import { LinksSectionView } from './sections/LinksSection.js'
import { WorkSectionView } from './sections/WorkSection.js'
import { EducationSectionView } from './sections/EducationSection.js'
import { SkillsSectionView } from './sections/SkillsSection.js'

// ============================================================================
// Section content renderer
// ============================================================================

function SectionContent({ section }: { section: SectionWithContent }) {
	switch (section.type) {
		case 'about':
		case 'custom':
		case 'rules':
			return <AboutSectionView section={section} />
		case 'contact':
			return <ContactSectionView section={section} />
		case 'location':
			return <LocationSectionView section={section} />
		case 'links':
			return <LinksSectionView section={section} />
		case 'work':
			return <WorkSectionView section={section} />
		case 'education':
			return <EducationSectionView section={section} />
		case 'skills':
			return <SkillsSectionView section={section} />
		default:
			return null
	}
}

// ============================================================================
// Visibility badge (only for owners)
// ============================================================================

function VisibilityBadge({ visibility }: { visibility: string }) {
	const { t } = useTranslation()

	let Icon: React.ComponentType<{ className?: string }>
	let label: string
	let variant: string

	switch (visibility) {
		case 'P':
			Icon = IcGlobe
			label = t('Public')
			variant = 'vis-public'
			break
		case 'F':
			Icon = IcUserCheck
			label = t('Followers')
			variant = 'vis-follower'
			break
		case 'C':
			Icon = IcUsers
			label = t('Connected')
			variant = 'vis-connected'
			break
		default:
			Icon = IcRole
			label = t(visibility.charAt(0).toUpperCase() + visibility.slice(1) + '+')
			variant = 'vis-role'
			break
	}

	return (
		<span className={mergeClasses('c-vis-badge c-hbox g-1 align-items-center', variant)}>
			<Icon className="text-xs" />
			{label}
		</span>
	)
}

// ============================================================================
// SectionView - read-only section card
// ============================================================================

interface SectionViewProps {
	section: SectionWithContent
	isOwner?: boolean
	className?: string
}

export function SectionView({ section, isOwner, className }: SectionViewProps) {
	const { t } = useTranslation()
	const title = getSectionTitle(t, section)

	return (
		<div className={mergeClasses('c-panel', className)}>
			<div className="c-hbox align-items-center g-2 mb-1">
				<h4 className="m-0 text-base">{title}</h4>
				<div className="flex-fill" />
				{isOwner && section.visibility !== 'P' && (
					<VisibilityBadge visibility={section.visibility} />
				)}
			</div>
			<SectionContent section={section} />
		</div>
	)
}

// vim: ts=4
