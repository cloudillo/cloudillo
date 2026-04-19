// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
	LuPencil as IcEdit,
	LuTrash as IcDelete,
	LuLink as IcLinked,
	LuUser as IcUser,
	LuMail as IcMail,
	LuPhone as IcPhone,
	LuNotebookPen as IcNote,
	LuHouse as IcHome,
	LuBriefcase as IcWork,
	LuSmartphone as IcCell,
	LuPrinter as IcFax,
	LuTag as IcOther
} from 'react-icons/lu'

import { Button, LoadingSpinner, useDialog } from '@cloudillo/react'
import type { ContactOutput } from '@cloudillo/core'

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

function emailTypeIcon(type: string | undefined): React.ReactNode {
	switch (type?.toUpperCase()) {
		case 'HOME':
			return <IcHome />
		case 'WORK':
			return <IcWork />
		default:
			return <IcOther />
	}
}

function phoneTypeIcon(type: string | undefined): React.ReactNode {
	switch (type?.toUpperCase()) {
		case 'CELL':
		case 'MOBILE':
			return <IcCell />
		case 'HOME':
			return <IcHome />
		case 'WORK':
			return <IcWork />
		case 'FAX':
			return <IcFax />
		default:
			return <IcOther />
	}
}

function firstMeaningfulType(types: string[] | undefined, noise: Set<string>): string | undefined {
	return (types ?? []).find((tp) => !noise.has(tp.toUpperCase()))
}

function ContactTypeIcon({ icon, label }: { icon: React.ReactNode; label: string }) {
	return (
		<span className="c-contact-type-icon" role="img" aria-label={label} title={label}>
			{icon}
		</span>
	)
}

export function ContactDetails({ contact, loading, onEdit, onDelete }: ContactDetailsProps) {
	const { t } = useTranslation()
	const dialog = useDialog()

	async function handleDelete() {
		if (!contact) return
		const confirmed = await dialog.confirm(
			t('Delete contact?'),
			t('"{{name}}" will be permanently removed.', { name: contact.fn || contact.uid })
		)
		if (!confirmed) return
		await onDelete()
	}

	if (loading) {
		return (
			<div className="d-flex align-items-center justify-content-center p-4">
				<LoadingSpinner size="md" />
			</div>
		)
	}

	if (!contact) {
		return <div className="c-hint p-3">{t('Select a contact to see details')}</div>
	}

	const displayName = contact.fn || fullNameFromN(contact.n) || contact.uid
	// Use a higher-resolution variant for the 96px hero photo so it stays crisp on retina.
	const overlayPic = contact.profile?.profilePic
	const localPic = contact.photo
	const heroUrl = isAbsoluteUrl(overlayPic)
		? withVariant(overlayPic, 'vis.sd')
		: isAbsoluteUrl(localPic)
			? withVariant(localPic, 'vis.sd')
			: undefined

	return (
		<div className="c-contact-details c-vbox h-100" style={{ overflowY: 'auto' }}>
			<div className="c-contact-hero">
				{heroUrl ? (
					<img className="c-contact-hero__photo" src={heroUrl} alt="" />
				) : (
					<div className="c-contact-hero__photo c-contact-hero__photo--placeholder">
						<IcUser size={40} />
					</div>
				)}

				<h2 className="c-contact-hero__name">{displayName}</h2>

				{(contact.title || contact.org) && (
					<div className="c-contact-hero__meta">
						{contact.title && <span>{contact.title}</span>}
						{contact.org && <span>{contact.org}</span>}
					</div>
				)}

				<div className="d-flex g-2 mt-2">
					<Button className="small" onClick={onEdit}>
						<IcEdit className="me-1" />
						{t('Edit')}
					</Button>
					<Button className="small" onClick={handleDelete}>
						<IcDelete className="me-1 text-error" />
						{t('Delete')}
					</Button>
				</div>
			</div>

			{contact.profile && (
				<section className="c-contact-section">
					<h3 className="c-contact-section__title">
						<IcLinked />
						{t('Linked Cloudillo profile')}
					</h3>
					<div className="d-flex align-items-center g-2">
						<span className="font-medium">{contact.profile.idTag}</span>
					</div>
					{contact.profile.name && contact.profile.name !== displayName && (
						<div className="c-hint">{contact.profile.name}</div>
					)}
				</section>
			)}

			{contact.emails && contact.emails.length > 0 && (
				<section className="c-contact-section">
					<h3 className="c-contact-section__title">
						<IcMail />
						{t('Email')}
					</h3>
					{contact.emails.map((e, i) => {
						const tp = firstMeaningfulType(e.type, NOISE_EMAIL_TYPES)
						return (
							<a key={i} href={`mailto:${e.value}`} className="c-contact-row-link">
								<ContactTypeIcon
									icon={emailTypeIcon(tp)}
									label={tp ? tp.toLowerCase() : t('other')}
								/>
								<span className="c-contact-row-link__value">{e.value}</span>
							</a>
						)
					})}
				</section>
			)}

			{contact.phones && contact.phones.length > 0 && (
				<section className="c-contact-section">
					<h3 className="c-contact-section__title">
						<IcPhone />
						{t('Phone')}
					</h3>
					{contact.phones.map((p, i) => {
						const tp = firstMeaningfulType(p.type, NOISE_PHONE_TYPES)
						return (
							<a key={i} href={`tel:${p.value}`} className="c-contact-row-link">
								<ContactTypeIcon
									icon={phoneTypeIcon(tp)}
									label={tp ? tp.toLowerCase() : t('other')}
								/>
								<span className="c-contact-row-link__value">{p.value}</span>
							</a>
						)
					})}
				</section>
			)}

			{contact.note && (
				<section className="c-contact-section">
					<h3 className="c-contact-section__title">
						<IcNote />
						{t('Notes')}
					</h3>
					<div style={{ whiteSpace: 'pre-wrap' }} className="text-sm">
						{contact.note}
					</div>
				</section>
			)}
		</div>
	)
}

// vim: ts=4
