// This file is part of the Cloudillo Platform.
// Copyright (C) 2024  Szilárd Hajba
//
// Cloudillo is free software: you can redistribute it and/or modify
// it under the terms of the GNU Lesser General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Lesser General Public License for more details.
//
// You should have received a copy of the GNU Lesser General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

import * as React from 'react'
import { Link, NavLink, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useEditable, Position } from 'use-editable'
import dayjs from 'dayjs'
import { useTranslation } from 'react-i18next'
import debounce from 'debounce'

import {
	LuPlus as IcNew,
	LuMessagesSquare as IcConvList,
	LuImage as IcImage,
	LuSendHorizontal as IcSend,
	LuArrowDownToLine as IcScrollBottom,
	LuMessageCircle as IcComment,
	LuThumbsUp as IcLike,
	LuForward as IcShare,
	LuUsers as IcGroup,
	LuUser as IcDirect,
	LuInfo as IcInfo,
	LuUserPlus as IcInvite,
	LuLogOut as IcLeave,
	LuSettings as IcSettings,
	LuX as IcClose,
	LuCheck as IcCheck,
	LuChevronDown as IcChevronDown
} from 'react-icons/lu'

import { Profile, ActionView, NewAction } from '@cloudillo/types'
import * as Types from '@cloudillo/base'
import { getFileUrl } from '@cloudillo/base'
import {
	useAuth,
	useApi,
	Button,
	Fcd,
	IdentityTag,
	ProfileCard,
	ProfilePicture,
	mergeClasses,
	generateFragments,
	LoadingSpinner,
	EmptyState,
	SkeletonList,
	Modal,
	useDialog,
	Badge,
	Tabs,
	Tab,
	Avatar,
	AvatarGroup,
	Toggle
} from '@cloudillo/react'
import '@cloudillo/react/components.css'

import { useAppConfig, parseQS, qs } from '../utils.js'
import { ImageUpload } from '../image.js'
import { useWsBus } from '../ws-bus.js'
import { useImageUpload } from '../hooks/useImageUpload.js'
import { AttachmentPreview } from '../components/AttachmentPreview.js'
import { useCurrentContextIdTag } from '../context/index.js'

//////////////////////
// Action datatypes //
//////////////////////
interface MsgAction extends ActionView {
	type: 'MSG'
	parentId?: undefined
	content: string
}

interface MsgTextAction extends MsgAction {
	type: 'MSG'
	subType: undefined | 'TEXT'
	parentId?: undefined
	content: string
}

interface MsgImageAction extends MsgAction {
	type: 'MSG'
	subType: 'IMG'
	parentId?: undefined
	content: string
	attachments: ActionView['attachments']
}
export type ActionEvt = MsgAction | MsgTextAction | MsgImageAction

//////////////////////
// Conversation types
//////////////////////
export type ConversationType = 'direct' | 'group'
export type ConversationTab = 'all' | 'direct' | 'groups'
export type MemberRole = 'observer' | 'member' | 'moderator' | 'admin'

export interface Conversation {
	id: string // actionId for CONV, idTag for direct
	type: ConversationType
	name?: string // Group name (from CONV content)
	description?: string // Group description
	profiles: Profile[] // Participants
	memberCount?: number // For groups
	isOpen?: boolean // Open to join (O flag)
	lastMessage?: MsgAction
}

export type MemberStatus = 'active' | 'invited'

export interface ConversationMember {
	profile: Profile
	role: MemberRole
	status: MemberStatus
	actionId: string // SUBS actionId for members, INVT actionId for invited
	joinedAt?: string
}

// CONV action content structure
interface ConvContent {
	name: string
	description?: string
	joinMode?: 'auto' | 'moderated'
}

// SUBS action content structure
interface SubsContent {
	role?: MemberRole
	message?: string
	invitedBy?: string
}

// Helper to extract role from action's x metadata
function getActionRole(action: ActionView): MemberRole {
	const xRole = (action as ActionView & { x?: { role?: string } }).x?.role
	return (xRole || 'member') as MemberRole
}

/////////////////
// Msg Action //
/////////////////
interface MsgProps {
	className?: string
	action: MsgAction
	local?: boolean
	showSender?: boolean // For group messages, always show sender
}
function Msg({ className, action, local, showSender }: MsgProps) {
	const { t } = useTranslation()
	const { api, setIdTag } = useApi()
	const [auth] = useAuth()
	const [tab, setTab] = React.useState<undefined | 'CMNT' | 'LIKE' | 'SHRE'>(undefined)

	let imgSrc: string | undefined
	if (action.subType == 'IMG' && action.attachments?.[0] && auth?.idTag) {
		const att = action.attachments[0]
		if (typeof att !== 'string') {
			// Always use local instance with preferred variant
			imgSrc = getFileUrl(auth.idTag, att.fileId, 'vis.sd')
		}
	}

	function onTabClick(clicked: 'CMNT' | 'LIKE' | 'SHRE') {
		if (clicked == tab) {
			setTab(undefined)
		} else {
			setTab(clicked)
		}
	}

	// In group chats, show sender for all messages (including own)
	const displaySender = showSender || !local

	return (
		<>
			<div
				className={mergeClasses(
					'c-panel c-msg p-2 px-3 mb-1',
					local ? 'local primary' : 'remote secondary',
					className
				)}
			>
				{displaySender && (
					<div className="c-panel-header d-flex mb-1">
						<Link to={`/profile/${action.issuer.idTag}`}>
							<ProfileCard profile={action.issuer} className="small" />
						</Link>
					</div>
				)}
				<div className="d-flex flex-column">
					{imgSrc && <img src={imgSrc} className="mb-2 mx-auto w-max-100" />}
					{typeof action.content != 'string'
						? null
						: action.content.split('\n\n').map((paragraph, i) => (
								<p key={i}>
									{paragraph.split('\n').map((line, i) => (
										<React.Fragment key={i}>
											{generateFragments(line).map((n, i) => (
												<React.Fragment key={i}>{n}</React.Fragment>
											))}
											<br />
										</React.Fragment>
									))}
								</p>
							))}
				</div>
			</div>
		</>
	)
}

// New Msg
export function NewMsg({
	className,
	style,
	conversation,
	onSubmit
}: {
	className?: string
	style?: React.CSSProperties
	conversation: Conversation
	onSubmit?: (action: ActionEvt) => void
}) {
	const { t } = useTranslation()
	const { api, setIdTag } = useApi()
	const [auth] = useAuth()
	const [content, setContent] = React.useState('')
	const editorRef = React.useRef<HTMLDivElement>(null)
	const imgInputRef = React.useRef<HTMLInputElement>(null)
	const imgInputId = React.useId()

	const imageUpload = useImageUpload()

	useEditable(editorRef, onChange)

	React.useEffect(() => {
		setTimeout(function () {
			console.log('blur+focus', editorRef.current),
				editorRef.current?.blur(),
				editorRef.current?.focus()
		}, 1000)
	}, [])

	function onChange(text: string, pos: Position) {
		setContent(text)
	}

	function onFileChange() {
		const file = imgInputRef.current?.files?.[0]
		if (file) {
			imageUpload.selectFile(file)
			if (imgInputRef.current) imgInputRef.current.value = ''
		}
	}

	function onCancelCrop() {
		imageUpload.cancelCrop()
		if (imgInputRef.current) imgInputRef.current.value = ''
	}

	async function doSubmit() {
		if (!api || !auth?.idTag || !content) return

		setContent('')

		// Build action based on conversation type
		const action: NewAction = {
			type: 'MSG',
			subType: imageUpload.attachmentIds.length ? 'IMG' : 'TEXT',
			content: content.trim(),
			attachments: imageUpload.attachmentIds.length ? imageUpload.attachmentIds : undefined,
			// For groups: use parentId (CONV actionId for first msg, MSG actionId for replies)
			// For direct: use audienceTag (recipient idTag)
			...(conversation.type === 'group'
				? { parentId: conversation.id }
				: { audienceTag: conversation.id })
		}

		const res = await api.actions.create(action)
		console.log('MSG res', res)
		onSubmit?.({
			...res,
			issuer: { name: auth.name ?? '', idTag: auth.idTag, profilePic: auth.profilePic },
			audience: undefined
		} as ActionEvt)
		imageUpload.reset()
		setTimeout(function () {
			editorRef.current?.blur(), editorRef.current?.focus()
		}, 0)
	}

	function onKeyDown(e: React.KeyboardEvent) {
		if (!e.shiftKey && e.key == 'Enter') {
			e.preventDefault()
			doSubmit()
		}
	}

	return (
		<>
			<div className={mergeClasses('c-panel', className)}>
				<div className="h-100" style={style}>
					<div className="c-input-group">
						<label htmlFor={imgInputId} className="c-button secondary align-self-start">
							<IcImage />
						</label>
						<input
							ref={imgInputRef}
							id={imgInputId}
							type="file"
							accept="image/*"
							style={{ display: 'none' }}
							onChange={onFileChange}
						/>
						<div
							ref={editorRef}
							className="c-input flex-fill"
							tabIndex={0}
							onKeyDown={onKeyDown}
						>
							{generateFragments(content).map((n, i) => (
								<React.Fragment key={i}>{n}</React.Fragment>
							))}
						</div>
						<button className="c-button primary align-self-end" onClick={doSubmit}>
							<IcSend />
						</button>
					</div>
					{auth?.idTag && (
						<AttachmentPreview
							attachmentIds={imageUpload.attachmentIds}
							idTag={auth.idTag}
							onRemove={imageUpload.removeAttachment}
							compact
						/>
					)}
				</div>
			</div>
			{imageUpload.attachment && (
				<ImageUpload
					src={imageUpload.attachment}
					aspects={['', '4:1', '3:1', '2:1', '16:9', '3:2', '1:1']}
					onSubmit={imageUpload.uploadAttachment}
					onCancel={onCancelCrop}
				/>
			)}
		</>
	)
}

///////////////////////
// Conversation list //
///////////////////////

// Group avatar component showing stacked profile pictures
function GroupAvatar({ profiles, max = 3 }: { profiles: Profile[]; max?: number }) {
	const displayProfiles = profiles.slice(0, max)
	const remaining = profiles.length - max

	return (
		<AvatarGroup max={max} className="c-avatar-group-small">
			{displayProfiles.map((profile) => (
				<Avatar key={profile.idTag} size="sm">
					{profile.profilePic ? (
						<img src={profile.profilePic} alt={profile.name || profile.idTag} />
					) : (
						<span className="c-avatar-fallback">
							{(profile.name || profile.idTag).charAt(0).toUpperCase()}
						</span>
					)}
				</Avatar>
			))}
		</AvatarGroup>
	)
}

export function ConversationCard({
	className,
	conversation
}: {
	className?: string
	conversation: Conversation
}) {
	const { t } = useTranslation()
	const [auth] = useAuth()
	const contextIdTag = useCurrentContextIdTag()

	const isGroup = conversation.type === 'group'
	const profile = conversation.profiles[0] || {}

	return (
		<Link
			className={mergeClasses('c-nav-item c-hbox g-2 align-items-center', className)}
			to={`/app/${contextIdTag || auth?.idTag}/messages/${conversation.id}`}
		>
			{isGroup ? (
				<>
					<div className="c-avatar-container pos-relative">
						{conversation.profiles.length > 1 ? (
							<GroupAvatar profiles={conversation.profiles} max={3} />
						) : (
							<Avatar size="md">
								<span className="c-avatar-fallback">
									<IcGroup />
								</span>
							</Avatar>
						)}
					</div>
					<div className="c-vbox fill overflow-hidden">
						<span className="fw-medium text-truncate">
							{conversation.name || t('Unnamed Group')}
						</span>
						<span className="text-muted text-small text-truncate">
							{conversation.memberCount
								? t('{{count}} members', { count: conversation.memberCount })
								: t('Group')}
						</span>
					</div>
				</>
			) : (
				<ProfileCard profile={profile} />
			)}
		</Link>
	)
}

interface ConversationFilter {
	q?: string
	tab: ConversationTab
}

interface ConversationBarProps {
	className?: string
	filter: ConversationFilter
	setFilter: React.Dispatch<React.SetStateAction<ConversationFilter>>
	conversations?: Conversation[]
	activeId?: string
	onCreateGroup: () => void
	pendingInvites?: ActionView[]
	onAcceptInvite?: (invite: ActionView) => void
	onRejectInvite?: (invite: ActionView) => void
}

function ConversationBar({
	className,
	filter,
	setFilter,
	conversations,
	activeId,
	onCreateGroup,
	pendingInvites,
	onAcceptInvite,
	onRejectInvite
}: ConversationBarProps) {
	const { t } = useTranslation()
	const location = useLocation()
	const navigate = useNavigate()
	const [search, setSearch] = React.useState(filter.q || '')

	const setFilterDebounced = React.useCallback(
		debounce(function setFilterD({ q }: { q?: string }) {
			setFilter((filter) => ({ ...filter, q }))
		}, 300),
		[setFilter]
	)

	function onSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
		setSearch(e.target.value)
		setFilterDebounced({ q: e.target.value })
	}

	function onTabChange(tab: ConversationTab) {
		setFilter((filter) => ({ ...filter, tab }))
	}

	// Filter conversations based on selected tab
	const filteredConversations = React.useMemo(() => {
		if (!conversations) return undefined
		switch (filter.tab) {
			case 'direct':
				return conversations.filter((c) => c.type === 'direct')
			case 'groups':
				return conversations.filter((c) => c.type === 'group')
			default:
				return conversations
		}
	}, [conversations, filter.tab])

	return (
		<div className={mergeClasses('c-vbox h-100 g-1', className)}>
			{/* Header panel: Tabs + Search */}
			<div className="c-panel p-2">
				<div className="c-hbox align-items-center g-1 mb-2">
					<Tabs
						value={filter.tab}
						onTabChange={(value) => onTabChange(value as ConversationTab)}
						className="fill"
					>
						<Tab value="all" title={t('All')}>
							<IcConvList className="me-1" />
							{t('All')}
						</Tab>
						<Tab value="direct" title={t('Direct')}>
							<IcDirect className="me-1" />
							{t('Direct')}
						</Tab>
						<Tab value="groups" title={t('Groups')}>
							<IcGroup className="me-1" />
							{t('Groups')}
						</Tab>
					</Tabs>
					<Button
						icon
						primary
						className="flex-shrink-0"
						title={t('Create Group')}
						onClick={onCreateGroup}
					>
						<IcNew />
					</Button>
				</div>
				<div className="c-input-group">
					<input
						type="text"
						className="c-input"
						placeholder={t('Search conversations...')}
						value={search}
						onChange={onSearchChange}
					/>
				</div>
			</div>

			{/* Pending Invitations */}
			{pendingInvites && pendingInvites.length > 0 && (
				<div className="c-panel">
					<div className="c-panel-header p-2">
						<span className="fw-medium">{t('Pending Invitations')}</span>
						<Badge className="ms-2">{pendingInvites.length}</Badge>
					</div>
					<div className="c-nav vertical low">
						{pendingInvites.map((invite) => {
							const inviteContent = invite.content as
								| { groupName?: string }
								| undefined
							return (
								<div
									key={invite.actionId}
									className="c-hbox align-items-center g-2 p-2"
								>
									<IcGroup className="text-muted flex-shrink-0" />
									<div className="c-vbox fill overflow-hidden">
										<span className="fw-medium text-truncate">
											{inviteContent?.groupName || t('Group invitation')}
										</span>
										<span className="text-muted text-small text-truncate">
											{t('From')} {invite.issuer.name || invite.issuer.idTag}
										</span>
									</div>
									<Button
										link
										primary
										title={t('Accept')}
										onClick={() => onAcceptInvite?.(invite)}
									>
										<IcCheck size={16} />
									</Button>
									<Button
										link
										title={t('Reject')}
										onClick={() => onRejectInvite?.(invite)}
									>
										<IcClose size={16} />
									</Button>
								</div>
							)
						})}
					</div>
				</div>
			)}

			{/* List panel */}
			<div className="c-panel c-nav vertical low fill overflow-y-auto">
				{filteredConversations === undefined ? (
					<SkeletonList count={5} showAvatar />
				) : filteredConversations.length === 0 ? (
					<EmptyState
						icon={
							filter.tab === 'groups' ? (
								<IcGroup style={{ fontSize: '2rem' }} />
							) : filter.tab === 'direct' ? (
								<IcDirect style={{ fontSize: '2rem' }} />
							) : (
								<IcConvList style={{ fontSize: '2rem' }} />
							)
						}
						title={
							filter.tab === 'groups'
								? t('No groups yet')
								: filter.tab === 'direct'
									? t('No direct messages')
									: t('No conversations')
						}
						description={
							filter.tab === 'groups'
								? t('Create a group to chat with multiple people')
								: filter.tab === 'direct'
									? t('Connect with someone to start messaging')
									: t('Start a conversation or create a group')
						}
						action={
							filter.tab === 'groups' ? (
								<Button primary onClick={onCreateGroup}>
									<IcNew className="me-1" />
									{t('Create Group')}
								</Button>
							) : undefined
						}
					/>
				) : (
					filteredConversations.map((con) => (
						<ConversationCard
							key={con.id}
							conversation={con}
							className={activeId === con.id ? 'bg bg-container-primary' : undefined}
						/>
					))
				)}
			</div>
		</div>
	)
}

/////////////////////////
// Group Details Panel //
/////////////////////////
interface GroupDetailsPanelProps {
	conversation: Conversation
	members?: ConversationMember[]
	currentUserIdTag: string
	onClose: () => void
	onInvite?: () => void
	onLeave?: () => void
}

function GroupDetailsPanel({
	conversation,
	members,
	currentUserIdTag,
	onClose,
	onInvite,
	onLeave
}: GroupDetailsPanelProps) {
	const { t } = useTranslation()
	const { api } = useApi()
	const dialog = useDialog()
	const navigate = useNavigate()
	const contextIdTag = useCurrentContextIdTag()

	// Get current user's role
	const currentUserMember = members?.find((m) => m.profile.idTag === currentUserIdTag)
	const currentUserRole = currentUserMember?.role || 'member'
	const isAdmin = currentUserRole === 'admin'
	const isModerator = currentUserRole === 'moderator' || isAdmin

	// Role display names
	// Abbreviated role labels for compact display
	const roleLabels: Record<MemberRole, string> = {
		observer: 'Obs',
		member: '', // No badge for regular members
		moderator: 'Mod',
		admin: 'A'
	}
	// Full role names for tooltips
	const roleTitles: Record<MemberRole, string> = {
		observer: t('Observer'),
		member: t('Member'),
		moderator: t('Moderator'),
		admin: t('Admin')
	}

	// Handle leave group
	async function handleLeaveGroup() {
		if (!api || !currentUserMember) return

		const confirmed = await dialog.confirm(
			t('Leave Group'),
			t('Are you sure you want to leave "{{name}}"?', { name: conversation.name })
		)

		if (confirmed) {
			try {
				await api.actions.create({
					type: 'SUBS',
					subType: 'DEL',
					subject: conversation.id,
					audienceTag: currentUserIdTag
				})
				// Navigate away from the group
				navigate(`/app/${contextIdTag || currentUserIdTag}/messages`)
			} catch (err) {
				console.error('Failed to leave group', err)
			}
		}
	}

	return (
		<div className="c-vbox h-100 g-1">
			{/* Header panel */}
			<div className="c-panel p-3">
				<div className="c-hbox align-items-center">
					<div className="c-hbox align-items-center g-2 fill">
						<IcGroup size={24} />
						<h3 className="m-0 text-truncate">{conversation.name}</h3>
					</div>
					<Button link className="lg-hide" onClick={onClose}>
						<IcClose />
					</Button>
				</div>
				{conversation.description && (
					<p className="text-muted mt-2 mb-0">{conversation.description}</p>
				)}
				<div className="c-hbox align-items-center mt-3">
					<span className="fw-medium fill">
						{t('Members')} ({members?.filter((m) => m.status === 'active').length || 0})
						{members && members.some((m) => m.status === 'invited') && (
							<span className="text-muted ms-1">
								+{members.filter((m) => m.status === 'invited').length}{' '}
								{t('invited')}
							</span>
						)}
					</span>
					{isModerator && (
						<Button link title={t('Invite member')} onClick={onInvite}>
							<IcInvite size={18} />
						</Button>
					)}
				</div>
			</div>

			{/* Members list panel */}
			<div className="c-panel c-nav vertical low fill overflow-y-auto">
				{members === undefined ? (
					<SkeletonList count={3} showAvatar />
				) : members.length === 0 ? (
					<span className="text-muted p-2">{t('No members')}</span>
				) : (
					members.map((member) => {
						const isCurrentUser = member.profile.idTag === currentUserIdTag
						const isInvited = member.status === 'invited'
						return (
							<div
								key={member.profile.idTag}
								className={mergeClasses(
									'c-hbox align-items-center g-2 p-2',
									isInvited && 'opacity-70'
								)}
							>
								<div className="fill overflow-hidden">
									<ProfileCard profile={member.profile} className="small" />
								</div>
								{isInvited ? (
									<Badge className="warning" title={t('Invited')}>
										Inv
									</Badge>
								) : (
									member.role !== 'member' && (
										<Badge
											className={mergeClasses(
												member.role === 'admin' && 'primary',
												member.role === 'moderator' && 'secondary'
											)}
											title={roleTitles[member.role]}
										>
											{roleLabels[member.role]}
										</Badge>
									)
								)}
								{isCurrentUser && (
									<Badge className="outline" title={t('You')}>
										✓
									</Badge>
								)}
							</div>
						)
					})
				)}
			</div>

			{/* Actions panel */}
			<div className="c-panel c-vbox g-2 p-3">
				{isAdmin && (
					<Button secondary className="w-100">
						<IcSettings className="me-2" />
						{t('Group Settings')}
					</Button>
				)}
				<Button className="w-100 text-danger" onClick={handleLeaveGroup}>
					<IcLeave className="me-2" />
					{t('Leave Group')}
				</Button>
			</div>
		</div>
	)
}

export function MessagesApp() {
	const { convId } = useParams()
	const navigate = useNavigate()
	const { t } = useTranslation()
	const [appConfig] = useAppConfig()
	const { api, setIdTag } = useApi()
	const [auth] = useAuth()
	const contextIdTag = useCurrentContextIdTag()
	const [showFilter, setShowFilter] = React.useState(!convId)
	const [showDetails, setShowDetails] = React.useState(false)
	const [showCreateGroup, setShowCreateGroup] = React.useState(false)
	const [filter, setFilter] = React.useState<ConversationFilter>({ tab: 'all' })
	const [conversations, setConversations] = React.useState<Conversation[] | undefined>()
	const [conversation, setConversation] = React.useState<Conversation | undefined>()
	const [members, setMembers] = React.useState<ConversationMember[] | undefined>()
	const [msg, setMsg] = React.useState<ActionEvt[] | undefined>()
	const [text, setText] = React.useState('')
	const convRef = React.useRef<HTMLDivElement>(null)
	const [scrollBottom, setScrollBottom] = React.useState(true)

	// Create group form state
	const [groupName, setGroupName] = React.useState('')
	const [groupDescription, setGroupDescription] = React.useState('')
	const [groupIsOpen, setGroupIsOpen] = React.useState(false)
	const [selectedMembers, setSelectedMembers] = React.useState<Profile[]>([])
	const [availableProfiles, setAvailableProfiles] = React.useState<Profile[]>([])
	const [isCreatingGroup, setIsCreatingGroup] = React.useState(false)

	// Invite member state
	const [showInviteMember, setShowInviteMember] = React.useState(false)
	const [selectedInvites, setSelectedInvites] = React.useState<Profile[]>([])
	const [isInviting, setIsInviting] = React.useState(false)

	// Pending invitations (incoming invites for current user)
	const [pendingInvites, setPendingInvites] = React.useState<ActionView[] | undefined>()

	useWsBus({ cmds: ['ACTION'] }, function handleAction(msg) {
		const action = msg.data as ActionEvt & { tempId?: string }
		setMsg((msgs) => {
			if (!msgs) return [action]

			// Match by tempId (optimistic update from same client)
			if (action.tempId) {
				const tempIdx = msgs.findIndex((m) => m.actionId === action.tempId)
				if (tempIdx >= 0) {
					// Update temp ID to final ID
					const updated = [...msgs]
					updated[tempIdx] = { ...updated[tempIdx], actionId: action.actionId }
					return updated
				}
			}

			// Already have by final actionId
			if (msgs.some((m) => m.actionId === action.actionId)) {
				return msgs
			}

			// New message from another client
			return [...msgs, action]
		})
	})

	// Load pending invitations (where I'm the invitee)
	React.useEffect(
		function loadPendingInvites() {
			if (!auth?.idTag || !api) return
			;(async function () {
				try {
					const invites = await api.actions.list({
						type: 'INVT',
						status: 'C' // Only pending confirmations
					})
					// Filter to invites where I'm the audience (invitee)
					const myInvites = (invites as ActionView[]).filter(
						(inv) => inv.audience?.idTag === auth.idTag
					)
					setPendingInvites(myInvites)
				} catch (err) {
					console.error('Failed to load pending invites', err)
					setPendingInvites([])
				}
			})()
		},
		[auth, api]
	)

	// Load conversations (both direct and groups)
	React.useEffect(
		function loadConversations() {
			setConversations(undefined)
			if (!auth || !api) return
			;(async function () {
				try {
					// Load direct conversations (connected profiles)
					const profiles = await api.profiles.list({
						q: filter.q,
						type: 'person',
						connected: true
					})
					const directConvs: Conversation[] = profiles.map((profile) => ({
						id: profile.idTag,
						type: 'direct' as ConversationType,
						profiles: [profile]
					}))

					// Load group conversations (SUBS where I'm a member)
					// Note: We query for SUBS with issuer filter to find
					// subscriptions where current user is the subscriber (issuer)
					let groupConvs: Conversation[] = []
					try {
						const subsActions = await api.actions.list({
							type: 'SUBS',
							issuer: auth.idTag,
							status: 'A'
						})

						// For each subscription, get the CONV details
						for (const subs of subsActions as ActionView[]) {
							if (subs.subject) {
								try {
									// Get the CONV action
									const convAction = await api.actions.get(subs.subject)
									if (convAction && convAction.type === 'CONV') {
										const content = convAction.content as ConvContent
										// Get member count
										const membersRes = await api.actions.list({
											type: 'SUBS',
											subject: subs.subject,
											status: 'A'
										})
										groupConvs.push({
											id: convAction.actionId,
											type: 'group',
											name: content?.name || t('Unnamed Group'),
											description: content?.description,
											profiles: [], // Will load members when opening the group
											memberCount: (membersRes as ActionView[]).length,
											isOpen: false // TODO: Parse from flags
										})
									}
								} catch (err) {
									console.error('Failed to load CONV', subs.subject, err)
								}
							}
						}
					} catch (err) {
						console.error('Failed to load group subscriptions', err)
					}

					// Apply search filter to groups
					if (filter.q) {
						const q = filter.q.toLowerCase()
						groupConvs = groupConvs.filter(
							(g) =>
								g.name?.toLowerCase().includes(q) ||
								g.description?.toLowerCase().includes(q)
						)
					}

					setConversations([...directConvs, ...groupConvs])
				} catch (err) {
					console.error('Failed to load conversations', err)
					setConversations([])
				}
			})()
		},
		[auth, api, filter.q]
	)

	// Load messages for selected conversation
	React.useEffect(
		function loadMessages() {
			setShowFilter(!convId)
			setMsg(undefined)
			setConversation(undefined)
			setMembers(undefined)
			if (!auth || !convId || !api) return
			;(async function () {
				try {
					// Check if convId is a group (actionId format) or direct (idTag format)
					// Action IDs always contain '~' (e.g., a1~hash...), idTags never do
					const isGroupId = convId.includes('~')

					if (isGroupId) {
						// Load group conversation
						const convAction = await api.actions.get(convId)
						if (convAction && convAction.type === 'CONV') {
							const content = convAction.content as ConvContent

							// Load active members (SUBS with status A)
							const membersRes = await api.actions.list({
								type: 'SUBS',
								subject: convId,
								status: 'A'
							})
							const activeMembers: ConversationMember[] = (
								membersRes as ActionView[]
							).map((subs) => ({
								profile: subs.issuer,
								role: getActionRole(subs),
								status: 'active' as MemberStatus,
								actionId: subs.actionId,
								joinedAt: String(subs.createdAt)
							}))

							// Load pending invitations (INVT actions)
							let invitedMembers: ConversationMember[] = []
							try {
								const invitesRes = await api.actions.list({
									type: 'INVT',
									subject: convId
								})
								// Filter to only show pending invites (not yet accepted)
								// INVT audience is the invited user
								const activeIdTags = new Set(
									activeMembers.map((m) => m.profile.idTag)
								)
								invitedMembers = (invitesRes as ActionView[])
									.filter(
										(invt) =>
											invt.audience && !activeIdTags.has(invt.audience.idTag)
									)
									.map((invt) => ({
										profile: invt.audience!,
										role: getActionRole(invt),
										status: 'invited' as MemberStatus,
										actionId: invt.actionId,
										joinedAt: String(invt.createdAt)
									}))
							} catch (err) {
								console.error('Failed to load invitations', err)
							}

							// Combine active members and invited users
							const membersList = [...activeMembers, ...invitedMembers]
							setMembers(membersList)

							setConversation({
								id: convId,
								type: 'group',
								name: content?.name || t('Unnamed Group'),
								description: content?.description,
								profiles: activeMembers.map((m) => m.profile),
								memberCount: activeMembers.length
							})

							// Load messages for group (using parentId - CONV hierarchy)
							const actions = await api.actions.list({
								type: 'MSG',
								parentId: convId
							})
							setMsg(
								(actions as ActionEvt[]).sort(
									(a, b) => dayjs(a.createdAt).unix() - dayjs(b.createdAt).unix()
								)
							)
						}
					} else {
						// Load direct conversation
						const profile = await api.profiles.get(convId)
						const profiles = profile ? [profile] : []

						setConversation({
							id: convId,
							type: 'direct',
							profiles
						})

						// Load messages for direct (using involved)
						const actions = await api.actions.list({
							involved: convId,
							type: 'MSG'
						})
						setMsg(
							(actions as ActionEvt[]).sort(
								(a, b) => dayjs(a.createdAt).unix() - dayjs(b.createdAt).unix()
							)
						)
					}
				} catch (err) {
					console.error('Failed to load messages', err)
					setMsg([])
				}
			})()
		},
		[auth, convId, api]
	)

	// Load available profiles for group creation or invite (excluding self and existing members)
	React.useEffect(
		function loadAvailableProfiles() {
			if ((!showCreateGroup && !showInviteMember) || !auth?.idTag || !api) return
			;(async function () {
				const profiles = await api.profiles.list({
					type: 'person',
					connected: true
				})
				// Filter out current user - they're automatically added as admin
				let filtered = profiles.filter((p) => p.idTag !== auth.idTag)

				// For invite dialog, also filter out existing members
				if (showInviteMember && members) {
					const memberIdTags = new Set(members.map((m) => m.profile.idTag))
					filtered = filtered.filter((p) => !memberIdTags.has(p.idTag))
				}

				setAvailableProfiles(filtered)
			})()
		},
		[showCreateGroup, showInviteMember, auth, api, members]
	)

	// Create group handler
	async function handleCreateGroup() {
		if (!api || !auth || !groupName.trim()) return

		setIsCreatingGroup(true)
		try {
			// Create CONV action
			const convAction = await api.actions.create({
				type: 'CONV',
				content: {
					name: groupName.trim(),
					description: groupDescription.trim() || undefined
				} as unknown as string // API expects string but we send object
				// flags: groupIsOpen ? 'RCO' : 'RCo'  // TODO: Add flags support
			})

			// Invite selected members
			for (const member of selectedMembers) {
				try {
					await api.actions.create({
						type: 'INVT',
						audienceTag: member.idTag,
						subject: convAction.actionId,
						content: {
							role: 'member',
							groupName: groupName.trim()
						} as unknown as string
					})
				} catch (err) {
					console.error('Failed to invite', member.idTag, err)
				}
			}

			// Reset form and close dialog
			setShowCreateGroup(false)
			setGroupName('')
			setGroupDescription('')
			setGroupIsOpen(false)
			setSelectedMembers([])

			// Navigate to new group
			navigate(`/app/${contextIdTag || auth.idTag}/messages/${convAction.actionId}`)

			// Refresh conversation list
			setFilter((f) => ({ ...f }))
		} catch (err) {
			console.error('Failed to create group', err)
		} finally {
			setIsCreatingGroup(false)
		}
	}

	function toggleMemberSelection(profile: Profile) {
		setSelectedMembers((prev) =>
			prev.some((p) => p.idTag === profile.idTag)
				? prev.filter((p) => p.idTag !== profile.idTag)
				: [...prev, profile]
		)
	}

	function toggleInviteSelection(profile: Profile) {
		setSelectedInvites((prev) =>
			prev.some((p) => p.idTag === profile.idTag)
				? prev.filter((p) => p.idTag !== profile.idTag)
				: [...prev, profile]
		)
	}

	// Invite members handler
	async function handleInviteMembers() {
		if (!api || !conversation || selectedInvites.length === 0) return

		setIsInviting(true)
		try {
			for (const profile of selectedInvites) {
				await api.actions.create({
					type: 'INVT',
					audienceTag: profile.idTag,
					subject: conversation.id,
					content: {
						role: 'member',
						groupName: conversation.name
					} as unknown as string
				})
			}
			setShowInviteMember(false)
			setSelectedInvites([])
			// Refresh by re-loading messages (which also loads members)
			setMsg(undefined)
		} catch (err) {
			console.error('Failed to invite members', err)
		} finally {
			setIsInviting(false)
		}
	}

	// Accept pending invitation
	async function handleAcceptInvite(invite: ActionView) {
		if (!api || !auth) return
		try {
			await api.actions.accept(invite.actionId)
			// Remove from pending list
			setPendingInvites((prev) => prev?.filter((i) => i.actionId !== invite.actionId))
			// Navigate to the group
			if (invite.subject) {
				navigate(`/app/${contextIdTag || auth.idTag}/messages/${invite.subject}`)
			}
			// Refresh conversations to show new group
			setFilter((f) => ({ ...f }))
		} catch (err) {
			console.error('Failed to accept invite', err)
		}
	}

	// Reject pending invitation
	async function handleRejectInvite(invite: ActionView) {
		if (!api) return
		try {
			await api.actions.reject(invite.actionId)
			// Remove from pending list
			setPendingInvites((prev) => prev?.filter((i) => i.actionId !== invite.actionId))
		} catch (err) {
			console.error('Failed to reject invite', err)
		}
	}

	function onConvScroll() {
		if (!convRef.current) return

		const bottom =
			convRef.current?.scrollHeight -
			(convRef.current?.scrollTop + convRef.current?.clientHeight)
		//console.log('conv scroll', convRef.current?.scrollTop, convRef.current?.scrollHeight, convRef.current?.clientHeight, bottom)
		if (scrollBottom && bottom > 800) setScrollBottom(false)
		if (!scrollBottom && bottom <= 800) setScrollBottom(true)
	}

	function onConvScrollBottomClick() {
		setScrollBottom(true)
		convRef.current?.scrollTo({
			top: convRef.current.scrollHeight,
			behavior: 'smooth'
		})
	}

	React.useEffect(
		function scrollMessages() {
			//console.log('scroll info', convRef.current?.scrollTop, convRef.current?.scrollHeight, convRef.current?.clientHeight)
			if (scrollBottom)
				convRef.current?.scrollTo({
					top: convRef.current.scrollHeight,
					behavior: 'instant'
				})
		},
		[msg]
	)

	function onSubmit(action: ActionEvt) {
		console.log('onSubmit', action)
		setMsg([...(msg || []), action])
	}

	const isGroup = conversation?.type === 'group'

	return (
		<>
			<Fcd.Container className="g-1">
				{!!auth && (
					<>
						<Fcd.Filter isVisible={showFilter} hide={() => setShowFilter(false)}>
							<ConversationBar
								className="col col-md-4 col-lg-3 h-100"
								filter={filter}
								setFilter={setFilter}
								conversations={conversations}
								activeId={convId}
								onCreateGroup={() => setShowCreateGroup(true)}
								pendingInvites={pendingInvites}
								onAcceptInvite={handleAcceptInvite}
								onRejectInvite={handleRejectInvite}
							/>
						</Fcd.Filter>
						<Fcd.Content
							ref={convRef}
							onScroll={onConvScroll}
							header={
								<div className="c-panel c-hbox align-items-center flex-nowrap g-2 p-2 w-100">
									<Button
										link
										className="md-hide lg-hide p-1 flex-shrink-0"
										onClick={() => setShowFilter(true)}
									>
										<IcConvList />
									</Button>
									{conversation && (
										<div className="c-hbox align-items-center g-2 fill overflow-hidden">
											{isGroup ? (
												<>
													<IcGroup className="flex-shrink-0" />
													<span className="fw-medium text-truncate">
														{conversation.name}
													</span>
													<Badge className="flex-shrink-0">
														{conversation.memberCount}{' '}
														{t('members', {
															count: conversation.memberCount
														})}
													</Badge>
													<Button
														link
														className="lg-hide p-1 flex-shrink-0 ms-auto"
														title={t('Group details')}
														onClick={() => setShowDetails(true)}
													>
														<IcInfo />
													</Button>
												</>
											) : (
												conversation.profiles[0] && (
													<IdentityTag
														idTag={conversation.profiles[0].idTag}
													/>
												)
											)}
										</div>
									)}
								</div>
							}
						>
							{!scrollBottom && (
								<button
									className="c-button float m-1 secondary pos-absolute bottom-0 right-0"
									onClick={onConvScrollBottomClick}
								>
									<IcScrollBottom />
								</button>
							)}
							{!convId ? (
								<EmptyState
									icon={<IcConvList style={{ fontSize: '2.5rem' }} />}
									title={t('Select a conversation')}
									description={t(
										'Choose a contact from the list to start messaging'
									)}
								/>
							) : msg === undefined ? (
								<SkeletonList count={5} showAvatar />
							) : msg.length === 0 ? (
								<EmptyState
									icon={
										isGroup ? (
											<IcGroup style={{ fontSize: '2.5rem' }} />
										) : (
											<IcConvList style={{ fontSize: '2.5rem' }} />
										)
									}
									title={t('No messages yet')}
									description={t('Start the conversation by sending a message!')}
								/>
							) : (
								msg
									.sort((a, b) => +a.createdAt - +b.createdAt)
									.map((action) => (
										<Msg
											key={action.actionId}
											action={action}
											local={action.issuer.idTag === auth?.idTag}
											showSender={isGroup}
										/>
									))
							)}
						</Fcd.Content>

						{/* Group Details Panel */}
						<Fcd.Details isVisible={showDetails} hide={() => setShowDetails(false)}>
							{isGroup && conversation && auth.idTag && (
								<GroupDetailsPanel
									conversation={conversation}
									members={members}
									currentUserIdTag={auth.idTag}
									onClose={() => setShowDetails(false)}
									onInvite={() => setShowInviteMember(true)}
								/>
							)}
						</Fcd.Details>
					</>
				)}
			</Fcd.Container>

			{/* Message Input */}
			{!!auth && !!convId && conversation && (
				<NewMsg className="mt-1" conversation={conversation} onSubmit={onSubmit} />
			)}

			{/* Create Group Dialog */}
			<Modal open={showCreateGroup} onClose={() => setShowCreateGroup(false)} className="p-0">
				<div
					className="c-dialog c-panel emph p-4"
					style={{ maxWidth: '480px', width: '90vw' }}
				>
					<div className="c-hbox align-items-center mb-3">
						<h2 className="fill m-0">{t('Create Group')}</h2>
						<Button link onClick={() => setShowCreateGroup(false)}>
							<IcClose />
						</Button>
					</div>

					<div className="c-vbox g-3">
						{/* Group Name */}
						<div className="c-vbox g-1">
							<label className="fw-medium">{t('Group Name')} *</label>
							<input
								type="text"
								className="c-input"
								placeholder={t('Enter group name...')}
								value={groupName}
								onChange={(e) => setGroupName(e.target.value)}
								autoFocus
							/>
						</div>

						{/* Description */}
						<div className="c-vbox g-1">
							<label className="fw-medium">{t('Description')}</label>
							<textarea
								className="c-input"
								placeholder={t('Optional description...')}
								value={groupDescription}
								onChange={(e) => setGroupDescription(e.target.value)}
								rows={2}
							/>
						</div>

						{/* Open/Closed Toggle */}
						<div className="c-hbox align-items-center g-2">
							<Toggle
								checked={groupIsOpen}
								onChange={(e) => setGroupIsOpen(e.target.checked)}
							/>
							<div className="c-vbox">
								<span className="fw-medium">
									{groupIsOpen ? t('Open group') : t('Closed group')}
								</span>
								<span className="text-muted text-small">
									{groupIsOpen
										? t('Anyone can join without invitation')
										: t('Members must be invited')}
								</span>
							</div>
						</div>

						{/* Member Selection */}
						<div className="c-vbox g-1">
							<label className="fw-medium">{t('Add Members')}</label>
							<div
								className="c-panel secondary p-2 overflow-y-auto"
								style={{ maxHeight: '200px' }}
							>
								{availableProfiles.length === 0 ? (
									<span className="text-muted p-2">
										{t('No contacts available')}
									</span>
								) : (
									availableProfiles.map((profile) => {
										const isSelected = selectedMembers.some(
											(p) => p.idTag === profile.idTag
										)
										return (
											<div
												key={profile.idTag}
												className={mergeClasses(
													'c-hbox align-items-center g-2 p-2 rounded cursor-pointer',
													isSelected && 'bg bg-container-primary'
												)}
												onClick={() => toggleMemberSelection(profile)}
												role="checkbox"
												aria-checked={isSelected}
												tabIndex={0}
												onKeyDown={(e) => {
													if (e.key === 'Enter' || e.key === ' ') {
														e.preventDefault()
														toggleMemberSelection(profile)
													}
												}}
											>
												<div
													className={mergeClasses(
														'c-checkbox',
														isSelected && 'checked'
													)}
												>
													{isSelected && <IcCheck size={14} />}
												</div>
												<ProfileCard profile={profile} />
											</div>
										)
									})
								)}
							</div>
							{selectedMembers.length > 0 && (
								<span className="text-muted text-small">
									{t('{{count}} members selected', {
										count: selectedMembers.length
									})}
								</span>
							)}
						</div>
					</div>

					{/* Actions */}
					<div className="c-hbox justify-content-end g-2 mt-4">
						<Button onClick={() => setShowCreateGroup(false)}>{t('Cancel')}</Button>
						<Button
							primary
							disabled={!groupName.trim() || isCreatingGroup}
							onClick={handleCreateGroup}
						>
							{isCreatingGroup ? (
								<LoadingSpinner size="sm" />
							) : (
								<>
									<IcNew className="me-1" />
									{t('Create Group')}
								</>
							)}
						</Button>
					</div>
				</div>
			</Modal>

			{/* Invite Member Dialog */}
			<Modal
				open={showInviteMember}
				onClose={() => setShowInviteMember(false)}
				className="p-0"
			>
				<div
					className="c-dialog c-panel emph p-4"
					style={{ maxWidth: '400px', width: '90vw' }}
				>
					<div className="c-hbox align-items-center mb-3">
						<h2 className="fill m-0">{t('Invite Members')}</h2>
						<Button link onClick={() => setShowInviteMember(false)}>
							<IcClose />
						</Button>
					</div>

					<div className="c-vbox g-3">
						{/* Member Selection */}
						<div className="c-vbox g-1">
							<label className="fw-medium">{t('Select members to invite')}</label>
							<div
								className="c-panel secondary p-2 overflow-y-auto"
								style={{ maxHeight: '300px' }}
							>
								{availableProfiles.length === 0 ? (
									<span className="text-muted p-2">
										{t('No contacts available to invite')}
									</span>
								) : (
									availableProfiles.map((profile) => {
										const isSelected = selectedInvites.some(
											(p) => p.idTag === profile.idTag
										)
										return (
											<div
												key={profile.idTag}
												className={mergeClasses(
													'c-hbox align-items-center g-2 p-2 rounded cursor-pointer',
													isSelected && 'bg bg-container-primary'
												)}
												onClick={() => toggleInviteSelection(profile)}
												role="checkbox"
												aria-checked={isSelected}
												tabIndex={0}
												onKeyDown={(e) => {
													if (e.key === 'Enter' || e.key === ' ') {
														e.preventDefault()
														toggleInviteSelection(profile)
													}
												}}
											>
												<div
													className={mergeClasses(
														'c-checkbox',
														isSelected && 'checked'
													)}
												>
													{isSelected && <IcCheck size={14} />}
												</div>
												<ProfileCard profile={profile} />
											</div>
										)
									})
								)}
							</div>
							{selectedInvites.length > 0 && (
								<span className="text-muted text-small">
									{t('{{count}} members selected', {
										count: selectedInvites.length
									})}
								</span>
							)}
						</div>
					</div>

					{/* Actions */}
					<div className="c-hbox justify-content-end g-2 mt-4">
						<Button onClick={() => setShowInviteMember(false)}>{t('Cancel')}</Button>
						<Button
							primary
							disabled={selectedInvites.length === 0 || isInviting}
							onClick={handleInviteMembers}
						>
							{isInviting ? (
								<LoadingSpinner size="sm" />
							) : (
								<>
									<IcInvite className="me-1" />
									{t('Send Invites')}
								</>
							)}
						</Button>
					</div>
				</div>
			</Modal>
		</>
	)
}

// vim: ts=4
