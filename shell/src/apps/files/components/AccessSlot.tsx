// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import type { FileAccess } from '@cloudillo/core'
import {
	Badge,
	Button,
	IcLink,
	IcLocked,
	Popover,
	ProfilePicture,
	Text,
	useAuth,
	useProfiles,
	VBox
} from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import {
	type AudienceText,
	AccessList,
	accessAudienceText,
	sortPeople,
	useProfileNode
} from './AccessList.js'

/** The audience when there is no `FileAccess` to read it from: the room root has no entry, so
 *  the caller derives it from the porch (`audienceText`) instead of calling the endpoint. */
export interface AccessSlotFallback {
	/** The tenant whose avatar stands for the audience (community, or the user at home) */
	idTag: string
	label: string
	long?: string
	ownerOnly?: boolean
}

export interface AccessSlotProps {
	/** The place's access; undefined at the room root or while loading → `fallback` */
	access?: FileAccess
	fallback?: AccessSlotFallback
	/** Remote folder: our own level there, shown as "Can edit" / "Read only" (also on mobile) */
	remotePermission?: 'write' | 'read'
	/** All rooms, Trash, Managed, selection mode */
	hidden?: boolean
	/** Mobile: drop the labels, one face */
	compact?: boolean
	onNavigateToFolder?: (folderId: string) => void
	/** Opens ShareDialog; the popover footer shows it only when `access.canManage` */
	onManage?: () => void
}

/**
 * The bar's compact access summary: `[audience avatar + label] · faces(≤3) +n · 🔗n`. One
 * `<button>` (the popover trigger) holding plain, non-interactive faces — a `PersonHover` per
 * face would nest interactive content and add a tab stop each. The popover holds `AccessList`.
 */
export function AccessSlot({
	access,
	fallback,
	remotePermission,
	hidden,
	compact,
	onNavigateToFolder,
	onManage
}: AccessSlotProps) {
	const { t } = useTranslation()
	const [auth] = useAuth()
	const node = useProfileNode(access)
	const [open, setOpen] = React.useState(false)

	const people = React.useMemo(() => (access ? sortPeople(access.people) : []), [access])
	const tenantTag = access?.owner.idTag ?? fallback?.idTag
	const maxFaces = compact ? 1 : 3
	const faceTags = React.useMemo(() => Array.from(new Set(people.map((p) => p.idTag))), [people])
	const idTags = React.useMemo(
		() => [...(tenantTag ? [tenantTag] : []), ...faceTags.slice(0, maxFaces)],
		[tenantTag, faceTags, maxFaces]
	)
	const profiles = useProfiles(idTags, node)

	if (hidden || !tenantTag) return null

	const contextName = profiles[tenantTag]?.name ?? tenantTag
	const audience: AudienceText | undefined = access
		? accessAudienceText(t, access, contextName, auth?.idTag)
		: fallback && {
				label: fallback.label,
				long: fallback.long ?? fallback.label,
				ownerOnly: !!fallback.ownerOnly
			}
	if (!audience) return null

	const linkCount = access?.links?.count ?? 0
	const extra = faceTags.length - maxFaces
	const remoteText =
		remotePermission === 'write'
			? t('Can edit')
			: remotePermission === 'read'
				? t('Read only')
				: undefined
	const name = [
		t('Access: {{audience}}, {{people}}, {{links}}', {
			audience: audience.long,
			people: t('{{count}} people', { count: faceTags.length }),
			links: t('{{count}} links', { count: linkCount })
		}),
		remoteText
	]
		.filter(Boolean)
		.join(', ')

	function close() {
		setOpen(false)
	}

	return (
		<Popover
			role="dialog"
			width="md"
			placement="bottom-end"
			open={open}
			onOpenChange={setOpen}
			aria-label={t('Access')}
			trigger={
				<Button variant="ghost" size="sm" aria-label={name}>
					{audience.ownerOnly ? (
						<IcLocked />
					) : (
						<ProfilePicture
							profile={profiles[tenantTag] ?? { idTag: tenantTag }}
							srcTag={tenantTag}
							size="xs"
						/>
					)}
					{!compact && <Text>{audience.label}</Text>}
					{faceTags.length > 0 && (
						<>
							{!compact && <Text aria-hidden="true">·</Text>}
							{faceTags.slice(0, maxFaces).map((idTag) => (
								<ProfilePicture
									key={idTag}
									profile={profiles[idTag] ?? { idTag }}
									srcTag={idTag}
									size="xs"
								/>
							))}
							{extra > 0 && <Text>+{extra}</Text>}
						</>
					)}
					{linkCount > 0 && !compact && (
						<>
							<Text aria-hidden="true">·</Text>
							<IcLink />
							<Text>{linkCount}</Text>
						</>
					)}
					{remoteText && <Badge>{remoteText}</Badge>}
				</Button>
			}
		>
			<VBox gap={2} padding={2}>
				{access ? (
					<AccessList
						access={access}
						onNavigateToFolder={
							onNavigateToFolder &&
							((id) => {
								close()
								onNavigateToFolder(id)
							})
						}
						onManage={
							onManage &&
							(() => {
								close()
								onManage()
							})
						}
					/>
				) : (
					<Text>{audience.long}</Text>
				)}
			</VBox>
		</Popover>
	)
}

// vim: ts=4
