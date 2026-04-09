// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { LuMail as IcMail, LuPhone as IcPhone, LuGlobe as IcGlobe } from 'react-icons/lu'

import type { SectionWithContent, ContactContent } from '../types.js'
import { parseContent, stringifyContent } from '../types.js'

const EMPTY: ContactContent = { email: '', phone: '', website: '' }

interface ContactSectionViewProps {
	section: SectionWithContent
}

export function ContactSectionView({ section }: ContactSectionViewProps) {
	const data = parseContent<ContactContent>(section.content, EMPTY)
	const hasContent = data.email || data.phone || data.website

	if (!hasContent) return null

	return (
		<div className="c-vbox g-1">
			{data.email && (
				<div className="c-hbox g-2 align-items-center">
					<IcMail className="c-section-icon" />
					<a href={`mailto:${data.email}`}>{data.email}</a>
				</div>
			)}
			{data.phone && (
				<div className="c-hbox g-2 align-items-center">
					<IcPhone className="c-section-icon" />
					<a href={`tel:${data.phone}`}>{data.phone}</a>
				</div>
			)}
			{data.website && (
				<div className="c-hbox g-2 align-items-center">
					<IcGlobe className="c-section-icon" />
					<a href={data.website} target="_blank" rel="noopener noreferrer">
						{data.website.replace(/^https?:\/\//, '')}
					</a>
				</div>
			)}
		</div>
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
		<div className="c-vbox g-2">
			<div className="c-hbox g-2 align-items-center">
				<IcMail className="c-section-icon" />
				<input
					className="c-input flex-fill"
					type="email"
					placeholder={t('Email')}
					value={data.email || ''}
					onChange={(e) => update('email', e.target.value)}
				/>
			</div>
			<div className="c-hbox g-2 align-items-center">
				<IcPhone className="c-section-icon" />
				<input
					className="c-input flex-fill"
					type="tel"
					placeholder={t('Phone')}
					value={data.phone || ''}
					onChange={(e) => update('phone', e.target.value)}
				/>
			</div>
			<div className="c-hbox g-2 align-items-center">
				<IcGlobe className="c-section-icon" />
				<input
					className="c-input flex-fill"
					type="url"
					placeholder={t('Website')}
					value={data.website || ''}
					onChange={(e) => update('website', e.target.value)}
				/>
			</div>
		</div>
	)
}

// vim: ts=4
