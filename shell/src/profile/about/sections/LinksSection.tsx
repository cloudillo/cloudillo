// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { useTranslation } from 'react-i18next'

import {
	LuGlobe as IcGlobe,
	LuMail as IcMail,
	LuPhone as IcPhone,
	LuMapPin as IcMapPin,
	LuCode as IcCode,
	LuVideo as IcVideo,
	LuMusic as IcMusic,
	LuBookOpen as IcBook,
	LuBriefcase as IcBriefcase,
	LuHeart as IcHeart,
	LuStar as IcStar,
	LuMessageCircle as IcMessage,
	LuRss as IcRss,
	LuFile as IcFile,
	LuPlus as IcPlus,
	LuX as IcRemove
} from 'react-icons/lu'

import { Button, Popper, mergeClasses } from '@cloudillo/react'
import type { LinkIcon, LinkEntry } from '@cloudillo/types'

import type { SectionWithContent, LinksContent } from '../types.js'
import { parseContent, stringifyContent, ensureUrlProtocol } from '../types.js'

const EMPTY: LinksContent = { links: [] }

// Icon registry
const LINK_ICONS: {
	value: LinkIcon
	icon: React.ComponentType<{ className?: string }>
}[] = [
	{ value: 'globe', icon: IcGlobe },
	{ value: 'mail', icon: IcMail },
	{ value: 'phone', icon: IcPhone },
	{ value: 'map-pin', icon: IcMapPin },
	{ value: 'code', icon: IcCode },
	{ value: 'video', icon: IcVideo },
	{ value: 'music', icon: IcMusic },
	{ value: 'book', icon: IcBook },
	{ value: 'briefcase', icon: IcBriefcase },
	{ value: 'heart', icon: IcHeart },
	{ value: 'star', icon: IcStar },
	{ value: 'message', icon: IcMessage },
	{ value: 'rss', icon: IcRss },
	{ value: 'file', icon: IcFile }
]

export function getLinkIconComponent(icon?: LinkIcon): React.ComponentType<{ className?: string }> {
	return LINK_ICONS.find((i) => i.value === icon)?.icon ?? IcGlobe
}

// ============================================================================
// View
// ============================================================================

interface LinksSectionViewProps {
	section: SectionWithContent
}

export function LinksSectionView({ section }: LinksSectionViewProps) {
	const data = parseContent<LinksContent>(section.content, EMPTY)

	if (!data.links.length) return null

	return (
		<div className="c-vbox g-1">
			{data.links.map((link, i) => {
				const Icon = getLinkIconComponent(link.icon)
				return (
					<div key={i} className="c-hbox g-2 align-items-center">
						<Icon className="c-section-icon" />
						<a
							href={ensureUrlProtocol(link.url)}
							target="_blank"
							rel="noopener noreferrer"
						>
							{link.label || link.url.replace(/^https?:\/\//, '')}
						</a>
					</div>
				)
			})}
		</div>
	)
}

// ============================================================================
// Icon Picker
// ============================================================================

interface IconPickerProps {
	value?: LinkIcon
	onChange: (icon: LinkIcon) => void
}

function IconPicker({ value, onChange }: IconPickerProps) {
	const current = getLinkIconComponent(value)
	const CurrentIcon = current

	return (
		<Popper
			menuClassName="c-btn link secondary sm"
			icon={<CurrentIcon className="c-section-icon" />}
		>
			<div className="c-hbox wrap g-1 p-1 w-md">
				{LINK_ICONS.map((item) => {
					const Icon = item.icon
					return (
						<Button
							key={item.value}
							kind="link"
							className={mergeClasses('p-1', item.value === value && 'active')}
							onClick={() => onChange(item.value)}
						>
							<Icon />
						</Button>
					)
				})}
			</div>
		</Popper>
	)
}

// ============================================================================
// Edit
// ============================================================================

interface LinksSectionEditProps {
	section: SectionWithContent
	onChange: (content: string) => void
}

export function LinksSectionEdit({ section, onChange }: LinksSectionEditProps) {
	const { t } = useTranslation()
	const [data, setData] = React.useState<LinksContent>(() =>
		parseContent<LinksContent>(section.content, EMPTY)
	)

	function updateLinks(links: LinkEntry[]) {
		const next = { links }
		setData(next)
		onChange(stringifyContent(next))
	}

	function updateLink(index: number, patch: Partial<LinkEntry>) {
		const links = data.links.map((l, i) => (i === index ? { ...l, ...patch } : l))
		updateLinks(links)
	}

	function addLink() {
		updateLinks([...data.links, { label: '', url: '', icon: 'globe' }])
	}

	function removeLink(index: number) {
		updateLinks(data.links.filter((_, i) => i !== index))
	}

	return (
		<div className="c-vbox g-2">
			{data.links.map((link, i) => (
				<div key={i} className="c-hbox g-1 align-items-center">
					<IconPicker value={link.icon} onChange={(icon) => updateLink(i, { icon })} />
					<input
						className="c-input w-sm"
						placeholder={t('Label')}
						value={link.label}
						onChange={(e) => updateLink(i, { label: e.target.value })}
					/>
					<input
						className="c-input flex-fill"
						type="url"
						placeholder={t('URL')}
						value={link.url}
						onChange={(e) => updateLink(i, { url: e.target.value })}
					/>
					<Button kind="link" onClick={() => removeLink(i)}>
						<IcRemove />
					</Button>
				</div>
			))}
			<Button kind="link" onClick={addLink}>
				<IcPlus /> {t('Add link')}
			</Button>
		</div>
	)
}

// vim: ts=4
