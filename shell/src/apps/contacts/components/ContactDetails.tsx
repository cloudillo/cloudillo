// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { ContactOutput } from '@cloudillo/core'
import {
	ActionBar,
	Avatar,
	Button,
	DescriptionList,
	type DescriptionListItem,
	EmptyState,
	HBox,
	Icon,
	Link,
	LoadingSpinner,
	PageHeader,
	Text,
	useDialog,
	VBox
} from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
	LuSmartphone as IcCell,
	LuTrash as IcDelete,
	LuPencil as IcEdit,
	LuPrinter as IcFax,
	LuHouse as IcHome,
	LuLink as IcLinked,
	LuMail as IcMail,
	LuNotebookPen as IcNote,
	LuTag as IcOther,
	LuPhone as IcPhone,
	LuUser as IcUser,
	LuBriefcase as IcWork
} from 'react-icons/lu'

import { isAbsoluteUrl, withVariant } from '../utils.js'

export interface ContactDetailsProps {
	contact: ContactOutput | undefined
	loading: boolean
	onEdit: () => void
	onDelete: () => Promise<void>
}

function fullNameFromN(n: ContactOutput['n']): string | undefined {
	if (!n) return undefined
	const parts = [n.prefix, n.given, n.additional, n.family, n.suffix].filter(
		(p): p is string => !!p
	)
	return parts.length > 0 ? parts.join(' ') : undefined
}

// INTERNET (emails) and VOICE (phones) are legacy vCard markers that carry
// no info in this UI — the section heading already says "Email"/"Phone".
const NOISE_EMAIL_TYPES = new Set(['INTERNET'])
const NOISE_PHONE_TYPES = new Set(['VOICE'])

function emailTypeIcon(type: string | undefined): React.ComponentType {
	switch (type?.toUpperCase()) {
		case 'HOME':
			return IcHome
		case 'WORK':
			return IcWork
		default:
			return IcOther
	}
}

function phoneTypeIcon(type: string | undefined): React.ComponentType {
	switch (type?.toUpperCase()) {
		case 'CELL':
		case 'MOBILE':
			return IcCell
		case 'HOME':
			return IcHome
		case 'WORK':
			return IcWork
		case 'FAX':
			return IcFax
		default:
			return IcOther
	}
}

function firstMeaningfulType(types: string[] | undefined, noise: Set<string>): string | undefined {
	return (types ?? []).find((tp) => !noise.has(tp.toUpperCase()))
}

function Term({ icon, children }: { icon: React.ComponentType; children: React.ReactNode }) {
	return (
		<HBox gap={1} align="center">
			<Icon as={icon} />
			{children}
		</HBox>
	)
}

export function ContactDetails({ contact, loading, onEdit, onDelete }: ContactDetailsProps) {
	const { t } = useTranslation()
	const dialog = useDialog()

	async function handleDelete() {
		if (!contact) return
		const confirmed = await dialog.confirm(
			t('Delete contact?'),
			t('"{{name}}" will be permanently removed.', { name: contact.fn || contact.uid }),
			{ color: 'error', confirmLabel: t('Delete') }
		)
		if (!confirmed) return
		await onDelete()
	}

	if (loading) {
		return <LoadingSpinner fill className="auto-bg" />
	}

	if (!contact) {
		return (
			<EmptyState
				fill
				className="auto-bg"
				description={t('Select a contact to see details')}
			/>
		)
	}

	const displayName = contact.fn || fullNameFromN(contact.n) || contact.uid
	// Use a higher-resolution variant for the hero photo so it stays crisp on retina.
	const overlayPic = contact.profile?.profilePic
	const localPic = contact.photo
	const heroUrl = isAbsoluteUrl(overlayPic)
		? withVariant(overlayPic, 'vis.sd')
		: isAbsoluteUrl(localPic)
			? withVariant(localPic, 'vis.sd')
			: undefined

	function typedLinks(
		values: { value: string; type?: string[] }[],
		scheme: 'mailto' | 'tel',
		noise: Set<string>,
		iconFor: (type: string | undefined) => React.ComponentType
	) {
		return (
			<VBox gap={1}>
				{values.map((v, i) => {
					const tp = firstMeaningfulType(v.type, noise)
					return (
						<Link
							key={i}
							href={`${scheme}:${v.value}`}
							icon={
								<Icon as={iconFor(tp)} label={tp ? tp.toLowerCase() : t('other')} />
							}
						>
							{v.value}
						</Link>
					)
				})}
			</VBox>
		)
	}

	const items: DescriptionListItem[] = []
	if (contact.profile) {
		items.push({
			key: 'profile',
			term: <Term icon={IcLinked}>{t('Linked Cloudillo profile')}</Term>,
			description: (
				<VBox>
					<Text weight="medium">{contact.profile.idTag}</Text>
					{contact.profile.name && contact.profile.name !== displayName && (
						<Text emphasis="muted">{contact.profile.name}</Text>
					)}
				</VBox>
			)
		})
	}
	if (contact.emails && contact.emails.length > 0) {
		items.push({
			key: 'email',
			term: <Term icon={IcMail}>{t('Email')}</Term>,
			description: typedLinks(contact.emails, 'mailto', NOISE_EMAIL_TYPES, emailTypeIcon)
		})
	}
	if (contact.phones && contact.phones.length > 0) {
		items.push({
			key: 'phone',
			term: <Term icon={IcPhone}>{t('Phone')}</Term>,
			description: typedLinks(contact.phones, 'tel', NOISE_PHONE_TYPES, phoneTypeIcon)
		})
	}
	if (contact.note) {
		items.push({
			key: 'note',
			term: <Term icon={IcNote}>{t('Notes')}</Term>,
			description: (
				<Text size="sm" preWrap>
					{contact.note}
				</Text>
			)
		})
	}

	return (
		<VBox gap={3} padding={3} autoBg>
			<PageHeader
				level={2}
				leading={<Avatar size="2xl" src={heroUrl} fallback={<Icon as={IcUser} />} />}
				title={displayName}
				subtitle={
					contact.title || contact.org
						? [contact.title, contact.org].filter(Boolean).join(' · ')
						: undefined
				}
			/>

			<ActionBar>
				<Button size="sm" onClick={onEdit} icon={<IcEdit />}>
					{t('Edit')}
				</Button>
				<Button size="sm" color="error" onClick={handleDelete} icon={<IcDelete />}>
					{t('Delete')}
				</Button>
			</ActionBar>

			{items.length > 0 && <DescriptionList items={items} />}
		</VBox>
	)
}

// vim: ts=4
