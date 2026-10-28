// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import {
	EmptyState,
	FAB,
	Fcd,
	Heading,
	PageHeader,
	useAuth,
	useIsDesktop,
	useIsMobile
} from '@cloudillo/react'
import { useAtomValue } from 'jotai'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'

import { useCtx } from '../../context/index.js'
import { messagesPath } from '../../routes.js'
import '@cloudillo/react/components.css'

import { IcCompose, IcMessages } from '../../icons.js'
import { NewChatDialog } from './components/NewChatDialog.js'
import { ConversationView } from './conversation/ConversationView.js'
import { DetailsPanel } from './details/DetailsPanel.js'
import { useCommunityMemberRoles } from './hooks/useCommunityMemberRoles.js'
import {
	conversationsAtom,
	useConversationMembersEnrichment,
	useConversationsReload
} from './hooks/useConversations.js'
import { useMessages } from './hooks/useMessages.js'
import { useTypingReceiver } from './hooks/useTyping.js'
import { usePendingInvites } from './hooks/usePendingInvites.js'
import { InboxList } from './inbox/InboxList.js'

// Layout host:
// - below md: a stack — list (/messages), conversation (/messages/:convId, Back),
//   details (?panel=details) — every level is a URL, so browser back works;
// - md: list rail + conversation, details as an overlay sheet;
// - lg+: rail + conversation + details, docked when it fits (Fcd), toggleable.
export function MessagesApp() {
	const { convId } = useParams()
	const [searchParams] = useSearchParams()
	const navigate = useNavigate()
	const { t } = useTranslation()
	const [auth] = useAuth()
	const urlContext = useCtx().base
	const isMobile = useIsMobile('md')
	const isDesktop = useIsDesktop('lg')

	const [showNewChat, setShowNewChat] = React.useState(false)
	// Saved scroll position per conversation, for restoration on switch. Lives here so
	// it survives the ConversationView unmounting (stack navigation below md).
	const scrollPositions = React.useRef<Map<string, number>>(new Map()).current

	const reloadConversations = useConversationsReload()
	// Cosmetic group-member avatars/counts — only enriched while Messages is open.
	useConversationMembersEnrichment()
	// Typing state for the inbox rows and the open conversation.
	useTypingReceiver()
	// Called once here: the conversation column and the details panel share it.
	const messages = useMessages(convId)
	const { conversation, members, refreshGroupMeta } = messages
	const listed = useAtomValue(conversationsAtom)?.find((c) => c.id === convId)
	// Shared by the `@all` gate (conversation) and the members list (details).
	const memberRoles = useCommunityMemberRoles(
		conversation?.communityTag ?? listed?.communityTag,
		members
	)
	// Kept here, not in InboxList: the list unmounts below md while a conversation is open.
	const invites = usePendingInvites()

	const isGroup = conversation?.type === 'group'
	const detailsOpen = !!convId && searchParams.get('panel') === 'details'

	// Stack level: 0 list, 1 conversation, 2 details. "Up" pops the history entry when
	// the previous one was the parent level (the usual way in), else replaces the
	// current entry with the parent, so a deep link never leaves the app on Back.
	const level = !convId ? 0 : detailsOpen ? 2 : 1
	const prevLevelRef = React.useRef<{ level: number; convId?: string } | undefined>(undefined)
	const upIsBackRef = React.useRef(false)
	React.useEffect(() => {
		const prev = prevLevelRef.current
		upIsBackRef.current =
			!!prev && prev.level === level - 1 && (level === 1 || prev.convId === convId)
		prevLevelRef.current = { level, convId }
	}, [level, convId])

	function goUp() {
		if (upIsBackRef.current) navigate(-1)
		else navigate(messagesPath(urlContext, level === 2 ? convId : undefined), { replace: true })
	}

	function toggleDetails() {
		if (detailsOpen) goUp()
		else if (convId) navigate(messagesPath(urlContext, convId, { panel: 'details' }))
	}

	// New chat: list header icon + empty state (InboxList), FAB below md.
	const inbox = (
		<InboxList activeId={convId} invites={invites} onNewChat={() => setShowNewChat(true)} />
	)

	return (
		<>
			{/* md: details always overlays; lg+: Fcd docks it when the container fits */}
			<Fcd.Container className="g-1" detailsMode={isDesktop ? undefined : 'overlay'}>
				{!!auth && (
					<>
						{!isMobile && <Fcd.Filter className="messages-rail">{inbox}</Fcd.Filter>}
						{convId ? (
							<ConversationView
								key={convId}
								convId={convId}
								messages={messages}
								memberRoles={memberRoles}
								scrollPositions={scrollPositions}
								onBack={isMobile ? goUp : undefined}
								onToggleDetails={toggleDetails}
								detailsOpen={detailsOpen}
							/>
						) : (
							<Fcd.Content
								width="wide"
								surface="raised"
								header={<PageHeader title={t('Messages')} />}
							>
								{isMobile ? (
									<>
										{inbox}
										<FAB
											icon={<IcCompose />}
											aria-label={t('New chat')}
											onClick={() => setShowNewChat(true)}
										/>
									</>
								) : (
									<EmptyState
										fill
										icon={<IcMessages />}
										title={t('Select a conversation')}
										description={t(
											'Choose a contact from the list to start messaging'
										)}
									/>
								)}
							</Fcd.Content>
						)}

						{/* Details: stack level 2 below md, overlay sheet at md, docked at lg+ */}
						<Fcd.Details
							isVisible={detailsOpen}
							hide={goUp}
							header={
								<Heading level={4}>
									{isGroup ? t('Group details') : t('Conversation details')}
								</Heading>
							}
						>
							{conversation && (
								<DetailsPanel
									conversation={conversation}
									members={members}
									memberRoles={memberRoles}
									onJump={(actionId, createdAt) => {
										messages.jumpTo(actionId, createdAt)
										// Only the docked panel leaves the conversation visible.
										if (!isDesktop) goUp()
									}}
									onChanged={() => {
										refreshGroupMeta()
										reloadConversations()
									}}
								/>
							)}
						</Fcd.Details>
					</>
				)}
			</Fcd.Container>

			{showNewChat && (
				<NewChatDialog
					onClose={() => setShowNewChat(false)}
					onOpenDirect={(idTag) => {
						setShowNewChat(false)
						navigate(messagesPath(urlContext, idTag))
					}}
					onCreated={(newConvId) => {
						setShowNewChat(false)
						reloadConversations()
						navigate(messagesPath(urlContext, newConvId))
					}}
				/>
			)}
		</>
	)
}

// vim: ts=4
