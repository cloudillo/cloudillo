// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
	LuMail as IcMail,
	LuPhone as IcPhone,
	LuBuilding as IcOrg,
	LuLink as IcLinked,
	LuUser as IcUser
} from 'react-icons/lu'

import { EmptyState, LoadMoreTrigger, LoadingSpinner, mergeClasses } from '@cloudillo/react'

import type { ListedContact } from '../hooks/useContactList.js'
import type { SelectedContactRef } from '../types.js'
import { isAbsoluteUrl, withVariant } from '../utils.js'

function ContactRow({
	contact,
	isSelected,
	onSelect,
	showBookName
}: {
	contact: ListedContact
	isSelected: boolean
	onSelect: () => void
	showBookName: boolean
}) {
	const { t } = useTranslation()
	const subtitle = contact.email ?? contact.tel ?? contact.org
	const displayName = contact.fn ?? contact.email ?? contact.uid

	const overlayPic = contact.profile?.profilePic
	const localPic = contact.photo
	const photoUrl = isAbsoluteUrl(overlayPic)
		? withVariant(overlayPic, 'vis.pf')
		: isAbsoluteUrl(localPic)
			? withVariant(localPic, 'vis.pf')
			: undefined

	return (
		<button
			type="button"
			role="listitem"
			aria-current={isSelected ? 'true' : undefined}
			className={mergeClasses('c-contact-row', isSelected && 'active')}
			onClick={onSelect}
		>
			{photoUrl ? (
				<img className="c-contact-row__avatar" src={photoUrl} alt="" />
			) : (
				<div
					className="c-contact-row__avatar d-flex align-items-center justify-content-center"
					aria-hidden="true"
					style={{ color: 'lch(from var(--col-on) l c h / 0.45)' }}
				>
					<IcUser />
				</div>
			)}
			<div className="flex-fill" style={{ minWidth: 0 }}>
				<div className="d-flex align-items-center g-1">
					<span className="c-contact-row__name text-truncate flex-fill">
						{displayName}
					</span>
					{contact.profileIdTag && (
						<IcLinked
							title={t('Linked Cloudillo profile')}
							className="text-primary flex-shrink-0"
							aria-label={t('Linked Cloudillo profile')}
						/>
					)}
				</div>
				{subtitle && (
					<div className="c-contact-row__sub">
						{contact.email ? <IcMail /> : contact.tel ? <IcPhone /> : <IcOrg />}
						<span className="text-truncate">{subtitle}</span>
					</div>
				)}
				{showBookName && contact.bookName && (
					<div className="c-contact-row__book text-truncate">{contact.bookName}</div>
				)}
			</div>
		</button>
	)
}

export interface ContactListProps {
	contacts: ListedContact[]
	isLoading: boolean
	isLoadingMore: boolean
	hasMore: boolean
	error: Error | null
	loadMore: () => void
	sentinelRef: React.Ref<HTMLDivElement>
	selected: SelectedContactRef | null
	onSelect: (ref: SelectedContactRef) => void
	showBookName: boolean
}

export function ContactList({
	contacts,
	isLoading,
	isLoadingMore,
	hasMore,
	error,
	loadMore,
	sentinelRef,
	selected,
	onSelect,
	showBookName
}: ContactListProps) {
	const { t } = useTranslation()

	if (isLoading && contacts.length === 0) {
		return (
			<div className="d-flex align-items-center justify-content-center flex-fill p-4">
				<LoadingSpinner size="lg" label={t('Loading contacts...')} />
			</div>
		)
	}

	if (contacts.length === 0) {
		return (
			<EmptyState
				title={t('No contacts')}
				description={t('Create a contact or add one from your Cloudillo network.')}
			/>
		)
	}

	return (
		<div className="c-contact-list c-vbox g-1 p-2" role="list" aria-label={t('Contacts')}>
			{contacts.map((contact) => {
				const isSelected = selected?.abId === contact.abId && selected?.uid === contact.uid
				return (
					<ContactRow
						key={`${contact.abId}:${contact.uid}`}
						contact={contact}
						isSelected={isSelected}
						onSelect={() => onSelect({ abId: contact.abId, uid: contact.uid })}
						showBookName={showBookName}
					/>
				)
			})}
			<LoadMoreTrigger
				ref={sentinelRef}
				isLoading={isLoadingMore}
				hasMore={hasMore}
				error={error}
				onRetry={loadMore}
				loadingLabel={t('Loading more contacts...')}
				retryLabel={t('Retry')}
				errorPrefix={t('Failed to load:')}
			/>
		</div>
	)
}

// vim: ts=4
