// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { HBox, Icon, Input, Link, VBox } from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuGlobe as IcGlobe, LuMail as IcMail, LuPhone as IcPhone } from 'react-icons/lu'

import type { ContactContent, SectionWithContent } from '../types.js'
import { ensureUrlProtocol, parseContent, stringifyContent } from '../types.js'

const EMPTY: ContactContent = { email: '', phone: '', website: '' }

interface ContactSectionViewProps {
	section: SectionWithContent
}

export function ContactSectionView({ section }: ContactSectionViewProps) {
	const data = parseContent<ContactContent>(section.content, EMPTY)
	const hasContent = data.email || data.phone || data.website

	if (!hasContent) return null

	return (
		<VBox gap={1}>
			{data.email && (
				<HBox gap={2} align="center">
					<Icon as={IcMail} className="text-muted" />
					<Link href={`mailto:${data.email}`}>{data.email}</Link>
				</HBox>
			)}
			{data.phone && (
				<HBox gap={2} align="center">
					<Icon as={IcPhone} className="text-muted" />
					<Link href={`tel:${data.phone}`}>{data.phone}</Link>
				</HBox>
			)}
			{data.website && (
				<HBox gap={2} align="center">
					<Icon as={IcGlobe} className="text-muted" />
					<Link
						href={ensureUrlProtocol(data.website)}
						target="_blank"
						rel="noopener noreferrer"
					>
						{data.website.replace(/^https?:\/\//, '')}
					</Link>
				</HBox>
			)}
		</VBox>
	)
}

interface ContactSectionEditProps {
	section: SectionWithContent
	onChange: (content: string) => void
}

export function ContactSectionEdit({ section, onChange }: ContactSectionEditProps) {
	const { t } = useTranslation()
	const [data, setData] = React.useState<ContactContent>(() =>
		parseContent<ContactContent>(section.content, EMPTY)
	)

	function update(field: keyof ContactContent, value: string) {
		const next = { ...data, [field]: value }
		setData(next)
		onChange(stringifyContent(next))
	}

	return (
		<VBox gap={2}>
			<HBox gap={2} align="center">
				<Icon as={IcMail} className="text-muted" />
				<Input
					className="flex-fill"
					type="email"
					aria-label={t('Email')}
					placeholder={t('Email')}
					value={data.email || ''}
					onChange={(e) => update('email', e.target.value)}
				/>
			</HBox>
			<HBox gap={2} align="center">
				<Icon as={IcPhone} className="text-muted" />
				<Input
					className="flex-fill"
					type="tel"
					aria-label={t('Phone')}
					placeholder={t('Phone')}
					value={data.phone || ''}
					onChange={(e) => update('phone', e.target.value)}
				/>
			</HBox>
			<HBox gap={2} align="center">
				<Icon as={IcGlobe} className="text-muted" />
				<Input
					className="flex-fill"
					type="url"
					aria-label={t('Website')}
					placeholder={t('Website')}
					value={data.website || ''}
					onChange={(e) => update('website', e.target.value)}
				/>
			</HBox>
		</VBox>
	)
}

// vim: ts=4
