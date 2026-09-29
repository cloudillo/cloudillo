// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import {
	Avatar,
	EmptyState,
	HBox,
	Icon,
	List,
	ListItem,
	LoadingSpinner,
	LoadMoreTrigger,
	Text
} from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
	LuLink as IcLinked,
	LuMail as IcMail,
	LuBuilding as IcOrg,
	LuPhone as IcPhone,
	LuUser as IcUser
} from 'react-icons/lu'

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
		<ListItem
			selected={isSelected}
			onClick={onSelect}
			leading={<Avatar size="md" src={photoUrl} fallback={<Icon as={IcUser} />} />}
			title={
				<HBox gap={1} align="center">
					<Text truncate weight="medium">
						{displayName}
					</Text>
					{contact.profileIdTag && (
						<Icon as={IcLinked} color="primary" label={t('Linked Cloudillo profile')} />
					)}
				</HBox>
			}
			subtitle={
				subtitle && (
					<HBox gap={1} align="center">
						<Icon as={contact.email ? IcMail : contact.tel ? IcPhone : IcOrg} />
						<Text truncate>{subtitle}</Text>
					</HBox>
				)
			}
			meta={showBookName ? contact.bookName : undefined}
		/>
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
			<LoadingSpinner fill size="lg" className="auto-bg" label={t('Loading contacts...')} />
		)
	}

	if (contacts.length === 0) {
		return (
			<EmptyState
				fill
				title={t('No contacts')}
				description={t('Create a contact or add one from your Cloudillo network.')}
			/>
		)
	}

	return (
		<>
			<List variant="divided" aria-label={t('Contacts')}>
				{contacts.map((contact) => (
					<ContactRow
						key={`${contact.abId}:${contact.uid}`}
						contact={contact}
						isSelected={
							selected?.abId === contact.abId && selected?.uid === contact.uid
						}
						onSelect={() => onSelect({ abId: contact.abId, uid: contact.uid })}
						showBookName={showBookName}
					/>
				))}
			</List>
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
		</>
	)
}

// vim: ts=4
