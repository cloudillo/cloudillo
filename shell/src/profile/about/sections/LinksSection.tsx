// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { Button, HBox, Icon, Input, Link, Menu, MenuItem, VBox } from '@cloudillo/react'
import type { LinkEntry, LinkIcon } from '@cloudillo/types'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
	LuBookOpen as IcBook,
	LuBriefcase as IcBriefcase,
	LuCode as IcCode,
	LuFile as IcFile,
	LuGlobe as IcGlobe,
	LuHeart as IcHeart,
	LuMail as IcMail,
	LuMapPin as IcMapPin,
	LuMessageCircle as IcMessage,
	LuMusic as IcMusic,
	LuPhone as IcPhone,
	LuPlus as IcPlus,
	LuX as IcRemove,
	LuRss as IcRss,
	LuStar as IcStar,
	LuVideo as IcVideo
} from 'react-icons/lu'

import type { LinksContent, SectionWithContent } from '../types.js'
import { ensureUrlProtocol, parseContent, stringifyContent } from '../types.js'

const EMPTY: LinksContent = { links: [] }

// Icon registry
const LINK_ICONS: {
	value: LinkIcon
	label: string
	icon: React.ComponentType<React.SVGAttributes<SVGElement>>
}[] = [
	{ value: 'globe', label: 'Website', icon: IcGlobe },
	{ value: 'mail', label: 'Email', icon: IcMail },
	{ value: 'phone', label: 'Phone', icon: IcPhone },
	{ value: 'map-pin', label: 'Location', icon: IcMapPin },
	{ value: 'code', label: 'Code', icon: IcCode },
	{ value: 'video', label: 'Video', icon: IcVideo },
	{ value: 'music', label: 'Music', icon: IcMusic },
	{ value: 'book', label: 'Book', icon: IcBook },
	{ value: 'briefcase', label: 'Work', icon: IcBriefcase },
	{ value: 'heart', label: 'Heart', icon: IcHeart },
	{ value: 'star', label: 'Star', icon: IcStar },
	{ value: 'message', label: 'Message', icon: IcMessage },
	{ value: 'rss', label: 'Feed', icon: IcRss },
	{ value: 'file', label: 'File', icon: IcFile }
]

export function getLinkIconComponent(
	icon?: LinkIcon
): React.ComponentType<React.SVGAttributes<SVGElement>> {
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
		<VBox gap={1}>
			{data.links.map((link, i) => (
				<HBox key={i} gap={2} align="center">
					<Icon as={getLinkIconComponent(link.icon)} className="text-muted" />
					<Link
						href={ensureUrlProtocol(link.url)}
						target="_blank"
						rel="noopener noreferrer"
					>
						{link.label || link.url.replace(/^https?:\/\//, '')}
					</Link>
				</HBox>
			))}
		</VBox>
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
	const { t } = useTranslation()
	const CurrentIcon = getLinkIconComponent(value)

	return (
		<Menu
			trigger={
				<Button
					variant="ghost"
					size="sm"
					icon={<CurrentIcon />}
					aria-label={t('Link icon')}
				/>
			}
		>
			{LINK_ICONS.map((item) => (
				<MenuItem
					key={item.value}
					icon={<item.icon />}
					label={t(item.label)}
					selected={item.value === value}
					onClick={() => onChange(item.value)}
				/>
			))}
		</Menu>
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
		<VBox gap={2}>
			{data.links.map((link, i) => (
				<HBox key={i} gap={1} align="center">
					<IconPicker value={link.icon} onChange={(icon) => updateLink(i, { icon })} />
					<Input
						className="w-sm"
						aria-label={t('Label')}
						placeholder={t('Label')}
						value={link.label}
						onChange={(e) => updateLink(i, { label: e.target.value })}
					/>
					<Input
						className="flex-fill"
						type="url"
						aria-label={t('URL')}
						placeholder={t('URL')}
						value={link.url}
						onChange={(e) => updateLink(i, { url: e.target.value })}
					/>
					<Button
						variant="ghost"
						size="sm"
						icon={<IcRemove />}
						aria-label={t('Remove link')}
						onClick={() => removeLink(i)}
					/>
				</HBox>
			))}
			<Button variant="ghost" icon={<IcPlus />} onClick={addLink}>
				{t('Add link')}
			</Button>
		</VBox>
	)
}

// vim: ts=4
