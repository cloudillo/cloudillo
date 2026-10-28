// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import type { ReaderStatePatch } from '@cloudillo/core'
import {
	Button,
	HBox,
	Heading,
	IcFolder,
	IcPin,
	IcSearch,
	Icon,
	IdentityTag,
	Menu,
	MenuDivider,
	MenuItem,
	ProfilePicture,
	Tab,
	IcEdit,
	Tabs,
	Text,
	useAuth,
	VBox
} from '@cloudillo/react'
import { useAtomValue } from 'jotai'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { contextRolesAtom, useCtx } from '../../../context/index.js'
import {
	IcGroup,
	IcLeave,
	IcMute,
	IcProfile,
	IcRestore,
	IcUnmute,
	IcUnpin
} from '../../../icons.js'
import { profilePath } from '../../../routes.js'
import { conversationsAtom } from '../hooks/useConversations.js'
import { MuteMenuItems, useConvActions } from '../inbox/RowActions.js'
import type { Conversation, ConversationMember } from '../types.js'
import { myGroupRole } from '../types.js'
import { GroupSettingsDialog } from './GroupSettingsDialog.js'
import { MediaTab } from './MediaTab.js'
import { MembersTab } from './MembersTab.js'
import { PinnedTab } from './PinnedTab.js'
import { SearchResults, useConvSearch } from './SearchResults.js'

export interface DetailsPanelProps {
	/** `useMessages().conversation`; reader-state prefs are read from the inbox list */
	conversation: Conversation
	members?: ConversationMember[]
	/** Jump to a message (`useMessages().jumpTo`, epoch s; search hits have none); the host closes a non-docked panel */
	/** Community roles of the members (`useCommunityMemberRoles`) */
	memberRoles: Map<string, string[]>
	onJump: (actionId: string, createdAt?: number) => void
	/** After a membership or group-settings change (reload the conversation + inbox) */
	onChanged?: () => void
	/** Also called by the Search quick action, which opens search mode (`convSearchAtom`) itself */
	onSearch?: () => void
}

interface DetailsTab {
	id: string
	label: string
	content: React.ReactNode
}

// Header, quick actions (Mute · Pin · Search), tabs, Archive (DMs) / Leave (groups).
export function DetailsPanel({
	conversation,
	members,
	memberRoles,
	onJump,
	onChanged,
	onSearch
}: DetailsPanelProps) {
	const { t } = useTranslation()
	const [auth] = useAuth()
	const base = useCtx().base
	const contextRoles = useAtomValue(contextRolesAtom)
	// The inbox entry carries the reader-state prefs (pinned, mute, …); `conversation` may not.
	const listed = useAtomValue(conversationsAtom)?.find(
		(c) => c.id === conversation.id && c.type === conversation.type
	)
	const a = useConvActions(listed ?? conversation)
	const [tab, setTab] = React.useState<string>()
	const [editOpen, setEditOpen] = React.useState(false)
	const search = useConvSearch(conversation.id)

	const isGroup = conversation.type === 'group'
	const me = auth?.idTag
	const peer = isGroup ? undefined : conversation.profiles[0]
	const left =
		!!listed?.left ||
		(isGroup && members !== undefined && !members.some((m) => m.profile.idTag === me))
	// Prefs need the reader-state row: listed and not left (as in inbox/RowActions.tsx).
	const prefs = listed && !left ? listed : undefined
	const community = conversation.communityTag ?? listed?.communityTag
	const myRole = myGroupRole({
		ownerTag: conversation.ownerTag,
		members,
		me,
		communityRoles: community ? contextRoles.get(community) : undefined,
		left
	})
	const isAdmin = myRole === 'admin'

	const run = (patch: ReaderStatePatch) => prefs && a.run(patch)
	const mute = (notify: 'T' | 'M' | null, hours?: number) => prefs && a.mute(notify, hours)

	const tabs: DetailsTab[] = [
		...(isGroup
			? [
					{
						id: 'members',
						label: t('Members'),
						content: (
							<MembersTab
								conversation={{ ...conversation, communityTag: community }}
								members={members}
								me={me}
								myRole={myRole}
								readOnly={left}
								communityRoles={memberRoles}
								onChanged={() => onChanged?.()}
							/>
						)
					}
				]
			: []),
		{
			id: 'media',
			label: t('Media & files'),
			content: me ? <MediaTab convId={conversation.id} idTag={me} onJump={onJump} /> : null
		},
		{
			id: 'pinned',
			label: t('Pinned'),
			content: <PinnedTab conversation={conversation} onJump={onJump} />
		}
	]
	const active = tabs.find((x) => x.id === tab) ?? tabs[0]

	const muteLabel =
		prefs?.muteLevel === 'mentions'
			? t('Mentions only')
			: prefs?.muteLevel === 'none'
				? t('Muted')
				: t('Mute')

	const name = isGroup
		? conversation.name || t('Unnamed Group')
		: peer?.name || peer?.idTag || conversation.id

	return (
		<VBox gap={2} className="h-100">
			{/* Header: avatar, name, description / identity */}
			<VBox gap={0} padding={2} align="center" className="text-center">
				{isGroup ? (
					conversation.picture ? (
						<ProfilePicture
							profile={{ name, profilePic: conversation.picture }}
							srcTag={conversation.ownerTag}
							size="lg"
						/>
					) : (
						<Icon as={IcGroup} size="lg" />
					)
				) : (
					peer && <ProfilePicture profile={peer} size="lg" />
				)}
				<HBox gap={1} align="center" justify="center">
					<Heading level={3} className="text-break">
						{name}
					</Heading>
					{isGroup && isAdmin && (
						<Button
							variant="ghost"
							size="sm"
							icon={<IcEdit />}
							aria-label={t('Edit')}
							onClick={() => setEditOpen(true)}
						/>
					)}
				</HBox>
				{isGroup ? (
					<>
						<Text emphasis="muted">
							{t('{{count}} members', { count: conversation.memberCount })}
						</Text>
						{conversation.description && (
							<Text as="p" className="text-break">
								{conversation.description}
							</Text>
						)}
						{conversation.editedBy && (
							<Text emphasis="muted" size="sm">
								{t('Settings changed by {{name}}', {
									name:
										members?.find(
											(m) => m.profile.idTag === conversation.editedBy
										)?.profile.name ?? conversation.editedBy
								})}
							</Text>
						)}
					</>
				) : (
					peer && (
						<HBox gap={1} align="center" justify="center">
							<IdentityTag idTag={peer.idTag} />
							<Button
								variant="ghost"
								size="sm"
								icon={<IcProfile />}
								aria-label={t('View profile')}
								href={profilePath(base, peer.idTag)}
							/>
						</HBox>
					)
				)}
			</VBox>

			{/* Quick actions: labelled buttons, nothing icon-only */}
			<HBox gap={1} justify="center" wrap className="px-2">
				{prefs && (
					<Menu
						placement="bottom-start"
						trigger={
							<Button
								variant="ghost"
								icon={prefs.muteLevel ? <IcMute /> : <IcUnmute />}
								aria-pressed={!!prefs.muteLevel}
							>
								{muteLabel}
							</Button>
						}
					>
						<MuteMenuItems muteLevel={prefs.muteLevel} onMute={mute} />
						{isGroup && (
							<>
								<MenuDivider />
								<MenuItem
									label={t('Ignore @all')}
									checked={!!prefs.ignoreAll}
									onClick={() =>
										run({ ignoreAll: prefs.ignoreAll ? null : true })
									}
								/>
							</>
						)}
					</Menu>
				)}
				{prefs && (
					<Button
						variant="ghost"
						icon={prefs.pinned ? <IcUnpin /> : <IcPin />}
						aria-pressed={!!prefs.pinned}
						onClick={() => run({ pinned: prefs.pinned ? null : true })}
					>
						{prefs.pinned ? t('Unpin') : t('Pin')}
					</Button>
				)}
				<Button
					variant="ghost"
					icon={<IcSearch />}
					aria-pressed={search.active}
					onClick={() => {
						search.open()
						onSearch?.()
					}}
				>
					{t('Search')}
				</Button>
			</HBox>

			{/* Search mode takes over the content area; else the tab frame */}
			{search.active ? (
				<VBox className="flex-fill">
					<SearchResults convId={conversation.id} onJump={(id) => onJump(id)} />
				</VBox>
			) : (
				<>
					{tabs.length > 1 && (
						<Tabs value={active?.id} onTabChange={setTab} className="px-2">
							{tabs.map((x) => (
								<Tab key={x.id} value={x.id}>
									{x.label}
								</Tab>
							))}
						</Tabs>
					)}
					<VBox className="flex-fill" role={tabs.length > 1 ? 'tabpanel' : undefined}>
						{active?.content}
					</VBox>
				</>
			)}

			{/* Bottom: Archive (DMs) / Leave (groups) */}
			{!isGroup && prefs && (
				<VBox className="p-3">
					<Button
						icon={prefs.archived ? <IcRestore /> : <IcFolder />}
						className="w-100"
						onClick={() => run({ archived: prefs.archived ? null : true })}
					>
						{prefs.archived ? t('Unarchive') : t('Archive')}
					</Button>
				</VBox>
			)}
			{isGroup && !left && (
				<VBox className="p-3">
					<Button color="error" icon={<IcLeave />} className="w-100" onClick={a.leave}>
						{t('Leave Group')}
					</Button>
				</VBox>
			)}

			{isAdmin && (
				<GroupSettingsDialog
					open={editOpen}
					onClose={() => setEditOpen(false)}
					conversation={{ ...conversation, communityTag: community }}
					onSaved={() => {
						setEditOpen(false)
						onChanged?.()
					}}
				/>
			)}
		</VBox>
	)
}

// vim: ts=4
