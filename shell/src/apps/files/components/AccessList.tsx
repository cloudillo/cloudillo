// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { FileAccess, FileAccessPerson } from '@cloudillo/core'
import {
	Badge,
	Button,
	Heading,
	HBox,
	IcLink,
	IcLocked,
	IcShare,
	List,
	ListItem,
	PersonActionsContext,
	PersonHover,
	type ProfileNode,
	ProfilePicture,
	Text,
	useAuth,
	useProfiles,
	VBox
} from '@cloudillo/react'
import type { TFunction } from 'i18next'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { floorText } from '../../../profile/role-labels.js'
import { formatRefDate } from '../../../utils/parseRefDate.js'
import {
	levelToPermChar,
	linkAccessToPermLevel,
	sharePermLabel,
	sharePermVariant,
	toSharePermChar
} from '../utils.js'

/** Renders a raw permission char, including the read-only 'A' (admin) standing this UI cannot
 *  grant. Label and colour come from the same pair of helpers ShareDialog uses. */
function PermChip({ perm }: { perm: string }) {
	const { t } = useTranslation()
	return <Badge color={sharePermVariant(perm)}>{sharePermLabel(perm, t)}</Badge>
}

const PERM_RANK: Record<string, number> = { A: 0, W: 1, C: 2, R: 3 }

/** A > W > C > R, otherwise the server's order (stable sort). The server always sends a
 *  permission (readers get no people at all); one without ranks last. */
export function sortPeople(people: FileAccessPerson[]): FileAccessPerson[] {
	const rank = (p: FileAccessPerson) =>
		p.permission === undefined ? 4 : PERM_RANK[toSharePermChar(p.permission)]
	return [...people].sort((a, b) => rank(a) - rank(b))
}

const SHORT_FLOOR: Record<string, (t: TFunction) => string> = {
	follower: (t) => t('Followers+'),
	supporter: (t) => t('Supporters+'),
	contributor: (t) => t('Contributors+'),
	moderator: (t) => t('Mods+'),
	leader: (t) => t('Leaders')
}

/** The file's own visibility level, when the audience is that rather than a place */
const VISIBILITY_TEXT: Record<string, (t: TFunction) => string> = {
	public: (t) => t('Public'),
	verified: (t) => t('Verified users'),
	secondDegree: (t) => t('Connections of connections'),
	followers: (t) => t('Followers'),
	connections: (t) => t('Connections'),
	subscribers: (t) => t('Subscribers')
}

export interface AudienceText {
	/** Short token for the bar slot ("All members", "Mods+", "Invited · 12", "Only you") */
	label: string
	/** Full sentence for the popover and the accessible name */
	long: string
	ownerOnly: boolean
}

/** Who the place's audience is, in words. `contextName` names the tenant (`access.owner`). */
export function accessAudienceText(
	t: TFunction,
	access: FileAccess,
	contextName: string,
	authIdTag: string | undefined
): AudienceText {
	const { kind, channel } = access.audience
	if (kind === 'owner') {
		const text = access.owner.idTag === authIdTag ? t('Only you') : t('Only the owner')
		return { label: text, long: text, ownerOnly: true }
	}
	if (kind === 'shared') {
		const text = t('Shared with you')
		return { label: text, long: text, ownerOnly: false }
	}
	const visibility = VISIBILITY_TEXT[kind]
	if (visibility) {
		const text = visibility(t)
		return { label: text, long: text, ownerOnly: false }
	}
	if (kind === 'members' || !channel) {
		return {
			label: t('All members'),
			long: t('All {{context}} members', { context: contextName }),
			ownerOnly: false
		}
	}
	const count = channel.memberCount
	const people = count != null ? t('{{count}} people', { count }) : undefined
	if (channel.closed) {
		return {
			label: count != null ? t('Invited · {{count}}', { count }) : t('Invited members'),
			long: [t('Invited members'), people].filter(Boolean).join(' · '),
			ownerOnly: false
		}
	}
	// an absent minRole reads as "no floor"; the wire cannot tell it from "unknown"
	const floor = channel.minRole
		? floorText(t, channel.minRole)
		: t('Everyone who can see {{context}}', { context: contextName })
	return {
		label: channel.minRole
			? (SHORT_FLOOR[channel.minRole]?.(t) ?? t('Members'))
			: t('Everyone'),
		long: [floor, people].filter(Boolean).join(' · '),
		ownerOnly: false
	}
}

/** The node profiles are read from: the file's own node once `access` is known (no token — one
 *  minted for another node is never sent, as in `profileNode`), else the shell's
 *  `PersonActionsProvider` node. */
export function useProfileNode(access: FileAccess | undefined): ProfileNode {
	const { node } = React.useContext(PersonActionsContext)
	const [auth] = useAuth()
	const own = node ?? { tag: auth?.idTag }
	if (access && access.owner.idTag !== own.tag) return { tag: access.owner.idTag }
	return own
}

/** Parts joined by " · ", any of them a node. */
function Dotted({ parts }: { parts: React.ReactNode[] }) {
	const shown = parts.filter(Boolean)
	return (
		<>
			{shown.map((part, i) => (
				<React.Fragment key={i}>
					{i > 0 && ' · '}
					{part}
				</React.Fragment>
			))}
		</>
	)
}

export interface AccessListProps {
	access: FileAccess
	/** "via /Folder" opens the ancestor the grant comes from */
	onNavigateToFolder?: (folderId: string) => void
	/** Footer "Manage sharing…"; shown only when set and `access.canManage` */
	onManage?: () => void
}

/**
 * THE rendering of a `FileAccess` — the bar's access popover and DetailsPanel's Sharing section
 * both use it, so they never disagree. The backend already shaped the response to the caller:
 * readers get no permission/expiry and a link count only, link guests get no people or links.
 */
export function AccessList({ access, onNavigateToFolder, onManage }: AccessListProps) {
	const { t } = useTranslation()
	const [auth] = useAuth()
	const node = useProfileNode(access)
	const people = React.useMemo(() => sortPeople(access.people), [access.people])
	const idTags = React.useMemo(
		() => Array.from(new Set([access.owner.idTag, ...people.map((p) => p.idTag)])),
		[access.owner.idTag, people]
	)
	const profiles = useProfiles(idTags, node)

	const ownerTag = access.owner.idTag
	const ownerProfile = profiles[ownerTag]
	const contextName = ownerProfile?.name ?? ownerTag
	const audience = accessAudienceText(t, access, contextName, auth?.idTag)
	const channel = access.audience.kind === 'room' ? access.audience.channel : undefined
	const isGuest = access.audience.kind === 'shared'

	function via(from: FileAccessPerson['inheritedFrom'], inherited: boolean) {
		if (from) {
			const label = t('via /{{folder}}', { folder: from.fileName })
			return onNavigateToFolder ? (
				<Button variant="link" size="sm" onClick={() => onNavigateToFolder(from.entryId)}>
					{label}
				</Button>
			) : (
				label
			)
		}
		// No source: inherited from an ancestor past the first one the caller cannot read
		return inherited ? t('inherited') : undefined
	}

	function expiry(expiresAt: string | Date | undefined) {
		const f = formatRefDate(expiresAt)
		return f ? `${t('Expires')} ${f}` : undefined
	}

	return (
		<VBox gap={3}>
			<VBox gap={1}>
				<Heading level={4} overline>
					{t('Audience')}
				</Heading>
				<List>
					<ListItem
						leading={
							<ProfilePicture
								profile={ownerProfile ?? { idTag: ownerTag }}
								srcTag={ownerTag}
								size="sm"
							/>
						}
						title={channel ? `~${channel.title ?? channel.name}` : contextName}
						subtitle={audience.long}
						trailing={
							audience.ownerOnly || channel?.closed ? (
								<IcLocked aria-label={t('Private')} />
							) : undefined
						}
					/>
				</List>
			</VBox>

			{!isGuest && (
				<VBox gap={1}>
					<Heading level={4} overline>
						{t('People')}
					</Heading>
					{people.length > 0 ? (
						<List>
							{people.map((p, i) => {
								const profile = profiles[p.idTag]
								return (
									<ListItem
										// The same person can hold a direct and an inherited grant
										key={`${p.idTag}:${i}`}
										leading={
											<PersonHover idTag={p.idTag}>
												<HBox>
													<ProfilePicture
														profile={profile ?? { idTag: p.idTag }}
														srcTag={p.idTag}
														size="sm"
													/>
												</HBox>
											</PersonHover>
										}
										title={profile?.name ?? p.idTag}
										subtitle={
											<Dotted
												parts={[
													expiry(p.expiresAt),
													via(p.inheritedFrom, p.inherited)
												]}
											/>
										}
										trailing={
											p.permission !== undefined && (
												<PermChip perm={toSharePermChar(p.permission)} />
											)
										}
									/>
								)
							})}
						</List>
					) : (
						<Text size="sm" emphasis="muted">
							{t('No one else has access')}
						</Text>
					)}
				</VBox>
			)}

			{access.links && (
				<VBox gap={1}>
					<Heading level={4} overline>
						{t('Links')}
					</Heading>
					{access.links.items && access.links.items.length > 0 ? (
						<List>
							{access.links.items.map((link) => (
								// Never print the refId: unless `redacted`, it is the credential
								<ListItem
									key={link.refId}
									leading={<IcLink />}
									title={t('Share link')}
									subtitle={
										<Dotted
											parts={[
												expiry(link.expiresAt) ?? t('Never expires'),
												via(link.inheritedFrom, false)
											]}
										/>
									}
									trailing={
										<PermChip
											perm={levelToPermChar(
												linkAccessToPermLevel(link.accessLevel)
											)}
										/>
									}
								/>
							))}
						</List>
					) : (
						<Text size="sm" emphasis="muted">
							{access.links.count > 0
								? t('{{count}} links', { count: access.links.count })
								: t('No share links')}
						</Text>
					)}
				</VBox>
			)}

			{access.canManage && onManage && (
				<HBox>
					<Button size="sm" icon={<IcShare />} onClick={onManage}>
						{t('Manage sharing…')}
					</Button>
				</HBox>
			)}
		</VBox>
	)
}

// vim: ts=4
