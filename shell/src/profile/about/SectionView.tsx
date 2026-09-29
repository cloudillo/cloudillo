// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { HBox, Panel, Tag } from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
	LuHandshake as IcConnected,
	LuUsers as IcFollowers,
	LuGlobe as IcGlobe,
	LuShield as IcRole
} from 'react-icons/lu'

import { AboutSectionView } from './sections/AboutSection.js'
import { ContactSectionView } from './sections/ContactSection.js'
import { EducationSectionView } from './sections/EducationSection.js'
import { LinksSectionView } from './sections/LinksSection.js'
import { LocationSectionView } from './sections/LocationSection.js'
import { SkillsSectionView } from './sections/SkillsSection.js'
import { WorkSectionView } from './sections/WorkSection.js'
import type { SectionWithContent } from './types.js'
import { getSectionTitle } from './types.js'

// ============================================================================
// Section content renderer
// ============================================================================

function SectionContent({ section }: { section: SectionWithContent }) {
	switch (section.type) {
		case 'about':
		case 'custom':
		case 'rules':
			// Older saved text joins words with U+00A0
			return (
				<AboutSectionView
					section={{ ...section, content: section.content.replace(/ /g, ' ') }}
				/>
			)
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

	switch (visibility) {
		case 'P':
			return (
				<Tag size="xs" color="success" icon={<IcGlobe />}>
					{t('Public')}
				</Tag>
			)
		case 'F':
			return (
				<Tag size="xs" color="primary" icon={<IcFollowers />}>
					{t('Followers')}
				</Tag>
			)
		case 'C':
			return (
				<Tag size="xs" color="warning" icon={<IcConnected />}>
					{t('Connected')}
				</Tag>
			)
		default:
			return (
				<Tag size="xs" color="secondary" icon={<IcRole />}>
					{t(`${visibility.charAt(0).toUpperCase() + visibility.slice(1)}+`)}
				</Tag>
			)
	}
}

// ============================================================================
// SectionView - read-only section card
// ============================================================================

interface SectionViewProps {
	section: SectionWithContent
	isOwner?: boolean
	/** Extra header actions after the visibility badge */
	actions?: React.ReactNode
}

export function SectionView({ section, isOwner, actions }: SectionViewProps) {
	const { t } = useTranslation()
	const badge =
		isOwner && section.visibility !== 'P' ? (
			<VisibilityBadge visibility={section.visibility} />
		) : null

	return (
		<Panel
			title={getSectionTitle(t, section)}
			headingLevel={4}
			actions={
				badge || actions ? (
					<HBox gap={1} align="center">
						{badge}
						{actions}
					</HBox>
				) : undefined
			}
		>
			<SectionContent section={section} />
		</Panel>
	)
}

// vim: ts=4
