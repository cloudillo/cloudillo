// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { getFileUrl, getInstanceUrl, idHue, type ProfilePatch } from '@cloudillo/core'
import {
	Avatar,
	Badge,
	Button,
	Center,
	FAB,
	Fcd,
	FileButton,
	HBox,
	Input,
	List,
	ListItem,
	LoadingSpinner,
	Menu,
	MenuDivider,
	MenuItem,
	Nav,
	PageHeader,
	Panel,
	ProfilePicture,
	SearchInput,
	Skeleton,
	SkeletonText,
	Tab,
	Tabs,
	useDialog,
	useToast,
	VBox,
	Image
} from '@cloudillo/react'
import { type ActionView, type CommunityRole, type NewAction, ROLE_LEVELS } from '@cloudillo/types'
import type { TFunction } from 'i18next'
import { useAtom, useSetAtom } from 'jotai'
import React from 'react'
import { useTranslation } from 'react-i18next'
import {
	LuCircleOff as IcBlock,
	LuCamera as IcCamera,
	LuCheck as IcCheck,
	LuChevronDown as IcChevronDown,
	LuX as IcClose,
	LuHandshake as IcConnect,
	LuCopy as IcCopy,
	LuPencil as IcEdit,
	LuLink as IcRef,
	LuUserPlus as IcFollow,
	LuUserCheck as IcFollowsYou,
	LuMessageCircle as IcMessage,
	LuEllipsisVertical as IcMore,
	LuUsers as IcMutual,
	LuPlus as IcPlus,
	LuUserMinus as IcRemoveMember
} from 'react-icons/lu'
import { Route, Routes, useLocation, useParams } from 'react-router-dom'

import 'quill/dist/quill.core.css'
import 'quill/dist/quill.bubble.css'

import { IdentityTag, useApi, useAuth } from '@cloudillo/react'
import type { Profile } from '@cloudillo/types'

import { ComposePanel } from '../apps/feed/index.js'
import { pendingQuoteAtom } from '../apps/feed/quote-intent.js'
import { ActionComp, type ActionEvt, type ActionStat, ComposeTrigger } from '../apps/feed.js'
import { CommunityMap } from '../communities/CommunityMap.js'
import {
	activeContextAtom,
	communitiesAtom,
	useApiContext,
	useCommunitiesList,
	useContextSwitch,
	useCtx,
	useCurrentContextIdTag,
	useProfileTrust
} from '../context/index.js'
import { ImageUpload } from '../image.js'
import { PartnerCommunities } from './partner-communities.js'
import { buildRef } from '../refs.js'
import type { CtxBase } from '../routes.js'
import { messagesPath, profilePath } from '../routes.js'
import { useWsBus } from '../ws-bus.js'
import { ProfileAbout } from './about/ProfileAbout.js'
import { getEffectiveTabs, parseTabConfig, type TabEntry } from './about/types.js'
import { CreateCommunity } from './community.js'
import { InvitationsList } from './community-invitations.js'
import { PendingRequestsList } from './community-requests.js'
import {
	CommunityListPage,
	PeopleHeader,
	PersonListPage,
	ProfileListCard,
	ProfileStatusBadge
} from './identities.js'
import { FilterToggle } from '../ui/FilterToggle.js'
import { InviteMembersDialog } from './invite-members-dialog.js'
import { ProfileHero } from './ProfileHero.js'
import { roleLabels } from './role-labels.js'
import { useConnectCommunity } from '../settings/partners.js'
import { usePorch } from '../lib/porch.js'
import { RoomsTab, useCanCreateRooms } from './rooms-tab.js'
import { describeRelationship } from './relationship.js'
import { TrustBanner } from './TrustBanner.js'
import { TrustChip } from './TrustChip.js'

const REFRESH_ATTEMPTS = 10
const MAX_BACKOFF_MS = 8000
const refreshBackoff = (attempt: number) => Math.min(800 * 2 ** attempt, MAX_BACKOFF_MS)

/**
 * Get the highest role from a list of roles
 * Roles are ordered from lowest to highest: public, follower, supporter, contributor, moderator, leader
 */
function getHighestRole(roles: string[] | undefined): CommunityRole | undefined {
	if (!roles || roles.length === 0) return undefined
	let highest: CommunityRole | undefined
	let highestLevel = -1
	for (const role of roles) {
		const level = ROLE_LEVELS[role as CommunityRole]
		if (level !== undefined && level > highestLevel) {
			highestLevel = level
			highest = role as CommunityRole
		}
	}
	return highest
}

const getRoles = (t: TFunction): { value: CommunityRole; label: string }[] =>
	Object.entries(roleLabels(t)).map(([value, label]) => ({
		value: value as CommunityRole,
		label
	}))

interface FullProfile {
	tnId: number
	idTag: string
	name: string
	type: 'community' | 'person'
	profilePic?: string
	coverPic?: string
	x?: Record<string, string>
	settings?: {
		connectionMode?: 'M' | 'A' | 'I'
		allowFollowers?: boolean
	}
}

/* Old x shape for reference:
	x?: { category, intro, sections, tabConfig }
*/

interface ProfileConnectionCmds {
	onFollow: () => void
	onUnfollow: () => void
	onConnect: () => void
	onDisconnect: () => void
	onBlock: () => void
	onUnblock: () => void
	/** Set when a community I lead (the active context) may connect with this community. */
	connectAs?: { name: string; run: () => void }
}

// The existing relation as a read-only Badge next to the name.
// Its actions live in the Follow button and the ⋯ menu.
function RelationshipBadge({
	localProfile,
	profileType
}: {
	localProfile?: Partial<Profile>
	profileType?: 'person' | 'community'
}) {
	const { t } = useTranslation()
	if (!localProfile) return null

	const rel = describeRelationship({ ...localProfile, type: profileType })
	const [label, icon, color] =
		rel.primary === 'blocked'
			? [t('Blocked'), <IcBlock key="i" />, 'error' as const]
			: rel.primary === 'pending'
				? [t('Request sent'), <IcConnect key="i" />, 'secondary' as const]
				: rel.connected
					? [
							profileType === 'community' ? t('Member') : t('Connected'),
							<IcConnect key="i" />,
							'secondary' as const
						]
					: rel.mutual
						? [t('Mutual'), <IcMutual key="i" />, 'secondary' as const]
						: rel.followsYou
							? [t('Follows you'), <IcFollowsYou key="i" />, 'secondary' as const]
							: []
	if (!label) return null
	return (
		<Badge color={color} icon={icon}>
			{label}
		</Badge>
	)
}

// The one relationship CTA: primary Follow (or Follow back) while not
// following, a quiet Following button (click to unfollow) once followed.
// Nothing when blocked; Unblock lives in the ⋯ menu.
function ProfileFollowButton({
	localProfile,
	profileType,
	cmds
}: {
	localProfile?: Partial<Profile>
	profileType?: 'person' | 'community'
	cmds: ProfileConnectionCmds
}) {
	const { t } = useTranslation()
	const dialog = useDialog()
	if (!localProfile) return null

	const rel = describeRelationship({ ...localProfile, type: profileType })
	if (rel.primary === 'blocked') return null

	async function onUnfollow() {
		if (
			await dialog.confirm(t('Are you sure?'), t('Unfollow this person?'), {
				color: 'error',
				confirmLabel: t('Unfollow')
			})
		)
			cmds.onUnfollow()
	}

	return rel.following ? (
		<Button icon={<IcFollowsYou />} onClick={onUnfollow}>
			{t('Following')}
		</Button>
	) : (
		<Button color="primary" icon={<IcFollow />} onClick={cmds.onFollow}>
			{rel.followsYou ? t('Follow back') : t('Follow')}
		</Button>
	)
}

// Connection/membership actions for the ⋯ menu: establish, cancel, break, or
// unblock — whichever applies to the current relation.
function relationshipMenuItems(
	t: TFunction,
	localProfile: Partial<Profile> | undefined,
	profileType: 'person' | 'community' | undefined,
	cmds: ProfileConnectionCmds
) {
	if (!localProfile) return null
	const isCommunity = profileType === 'community'
	const rel = describeRelationship({ ...localProfile, type: profileType })

	if (rel.primary === 'blocked')
		return <MenuItem icon={<IcBlock />} label={t('Unblock')} onClick={cmds.onUnblock} />
	if (rel.primary === 'pending')
		return (
			<MenuItem
				icon={<IcConnect />}
				label={t('Cancel request')}
				onClick={cmds.onDisconnect}
			/>
		)
	if (rel.connected)
		return (
			<MenuItem
				icon={<IcConnect />}
				label={isCommunity ? t('Leave') : t('Disconnect')}
				onClick={cmds.onDisconnect}
			/>
		)
	return (
		<MenuItem
			icon={<IcConnect />}
			label={isCommunity ? t('Join') : t('Connect')}
			onClick={cmds.onConnect}
		/>
	)
}

// ============================================================================
// Dynamic profile tabs
// ============================================================================

const getTabLabels = (t: TFunction): Record<string, string> => ({
	feed: t('Feed'),
	about: t('About'),
	connections: t('Connections'),
	gallery: t('Gallery'),
	files: t('Files'),
	rooms: t('Rooms')
})

const TAB_ROUTES: Record<string, string> = {
	feed: 'feed',
	about: 'about',
	connections: 'connections',
	gallery: 'gallery',
	files: 'files',
	rooms: 'rooms'
}

function ProfileTabs({
	profile,
	base,
	own,
	isCommunity,
	showRooms
}: {
	profile: FullProfile
	base: CtxBase
	own: boolean
	isCommunity: boolean
	showRooms?: boolean
}) {
	const { t } = useTranslation()
	const tabLabels = React.useMemo(() => getTabLabels(t), [t])
	const tabConfig = parseTabConfig(profile.x)
	// Rooms is not part of the owner's tab config: it shows whenever there is a porch to show
	const tabs: TabEntry[] = [
		...getEffectiveTabs(tabConfig),
		...(showRooms ? [{ id: 'rooms', visible: true, order: Number.POSITIVE_INFINITY }] : [])
	]
	const pathname = useLocation().pathname.replace(/\/$/, '')
	// The own profile is reachable as both `/me` and `/<idTag>`: link within the one in use,
	// or no tab ever matches the URL
	const idPath = profilePath(base, profile.idTag)
	const basePath =
		!own || pathname === idPath || pathname.startsWith(`${idPath}/`)
			? idPath
			: profilePath(base, 'me')
	// The bare profile URL renders About, but route matching is exact
	const atIndex = pathname === basePath

	return (
		<Tabs>
			{tabs
				.filter((tab) => tab.visible)
				.map((tab) => {
					const route = TAB_ROUTES[tab.id]
					if (!route) return null

					let label = tab.label
					if (!label) {
						if (tab.id === 'connections') {
							label = isCommunity ? t('Members') : t('Connections')
						} else {
							label = tabLabels[tab.id] || t(tab.id)
						}
					}

					return (
						<Tab
							key={tab.id}
							href={`${basePath}/${route}`}
							active={tab.id === 'about' && atIndex ? true : undefined}
						>
							{label}
						</Tab>
					)
				})}
		</Tabs>
	)
}

interface ProfilePageProps {
	profile: FullProfile
	setProfile: React.Dispatch<React.SetStateAction<FullProfile | undefined>>
	localProfile?: Partial<Profile>
	setProfileStatus?: React.Dispatch<React.SetStateAction<string | undefined>>
	updateProfile?: (patch: ProfilePatch) => Promise<void>
	profileCmds: ProfileConnectionCmds
	children: React.ReactNode
	/** User's roles in the viewed community (for non-context-switched viewing) */
	communityRoles?: string[]
	/** Function to get proxy token for a target idTag */
	getTokenFor?: (
		idTag: string,
		opts?: { explicit?: boolean }
	) => Promise<{ token: string; roles?: string[] } | null>
	/**
	 * Reload the remote profile after a trust decision (e.g. user just elevated
	 * from anonymous to session auth). Called by the TrustBanner/TrustChip so
	 * cached proxy-token-gated data can refresh.
	 */
	onTrustDecision?: () => void
	/** Show the Rooms tab */
	showRooms?: boolean
}

/**
 * Loading placeholder shaped like the real profile header so the layout does not
 * jump when the profile data + images arrive. Uses the same {@link ProfileHero}
 * as {@link ProfilePage} for matching dimensions.
 */
function ProfileSkeleton() {
	return (
		<Fcd.Container className="g-1">
			<Fcd.Filter collapsed />
			<Fcd.Content>
				<ProfileHero
					cover={<Skeleton variant="rect" width="100%" height={160} />}
					avatar={<Skeleton variant="circle" width="6rem" height="6rem" />}
					header={
						<>
							<Skeleton variant="text" width="40%" height="2rem" />
							<Skeleton variant="text" width="25%" />
						</>
					}
				>
					<HBox gap={2}>
						<Skeleton variant="rounded" width={80} height={32} />
						<Skeleton variant="rounded" width={80} height={32} />
						<Skeleton variant="rounded" width={80} height={32} />
					</HBox>
				</ProfileHero>
				<Panel padding={2} className="mt-2">
					<SkeletonText lines={4} />
				</Panel>
			</Fcd.Content>
			<Fcd.Details></Fcd.Details>
		</Fcd.Container>
	)
}

export function ProfilePage({
	profile,
	setProfile,
	localProfile,
	updateProfile,
	profileCmds,
	children,
	communityRoles = [],
	getTokenFor,
	onTrustDecision,
	showRooms
}: ProfilePageProps) {
	const { t } = useTranslation()
	const [auth, setAuth] = useAuth()
	const toast = useToast()
	const location = useLocation()
	const [activeContext, setActiveContext] = useAtom(activeContextAtom)
	const { getClientFor } = useApiContext()
	const setCommunities = useSetAtom(communitiesAtom)
	const setCommunityProfilePic = React.useCallback(
		(idTag: string, profilePic?: string) => {
			setCommunities((prev) =>
				prev.map((c) => (c.idTag === idTag ? { ...c, profilePic } : c))
			)
		},
		[setCommunities]
	)
	// The context the URL names — `ctx.base` for links, `ctx.idTag` for the tenant.
	const ctx = useCtx()
	const own = auth?.idTag === profile.idTag
	const [coverUpload, setCoverUpload] = React.useState<string | undefined>()
	const [profileUpload, setProfileUpload] = React.useState<string | undefined>()
	const [editMode, setEditMode] = React.useState(false)
	const [nameDraft, setNameDraft] = React.useState(profile.name)

	// Keep the name draft in sync when the profile name changes externally,
	// but never overwrite an in-progress edit.
	React.useEffect(() => {
		if (!editMode) setNameDraft(profile.name)
	}, [profile.name, editMode])

	// Check if user has leader role for community settings access
	// Use communityRoles (from prop, fetched by parent) OR activeContext roles if we're in the viewed community
	const isCommunity = profile.type === 'community'
	const isInViewedCommunity = activeContext?.idTag === profile.idTag
	const userRole = isInViewedCommunity
		? getHighestRole(activeContext?.roles)
		: getHighestRole(communityRoles)
	const canAccessSettings = own || (isCommunity && userRole === 'leader')

	function onCancel() {
		setProfileUpload(undefined)
		setCoverUpload(undefined)
	}

	// Resolve the token strictly from the TARGET host so the home/personal token is
	// never sent to a foreign host. Home target → home token; any foreign target
	// (community or other tenant) → a proxy token scoped to that target.
	async function resolveUploadToken(targetIdTag: string): Promise<string | undefined> {
		if (!auth) return undefined
		if (targetIdTag === auth.idTag) return auth.token
		// Explicit user upload — bypass the profile-trust gate.
		const proxyResult = await getTokenFor?.(targetIdTag, { explicit: true })
		if (!proxyResult?.token) {
			console.error('Failed to get proxy token for upload to', targetIdTag)
			return undefined
		}
		return proxyResult.token
	}

	async function uploadCover(img: Blob) {
		if (!auth) return

		const targetIdTag = profile.idTag
		const token = await resolveUploadToken(targetIdTag)
		if (!token) return

		// Upload
		const request = new XMLHttpRequest()
		request.open('PUT', `${getInstanceUrl(targetIdTag)}/api/me/cover`)
		request.setRequestHeader('Authorization', `Bearer ${token}`)

		request.addEventListener('load', function (_e) {
			if (request.status === 200) {
				try {
					const res = JSON.parse(request.response)
					const coverPic = res.fileId || res
					if (profile) setProfile((p) => (p ? { ...p, coverPic } : p))
					setCoverUpload(undefined)
				} catch (err) {
					console.error('Failed to parse response:', err)
				}
			} else {
				console.error('Upload failed with status:', request.status, request.response)
			}
		})

		request.addEventListener('error', function () {
			console.error('Network error during cover upload')
			setCoverUpload(undefined)
		})

		request.send(img)
		// / Upload
	}

	/**
	 * After a community picture upload, force the caller's HOME-server mirror of
	 * `idTag` to re-sync, and reconcile the recovered picture into the sidebar/list
	 * atom — but accept it ONLY once it differs from `baseline` (the mirror's
	 * profilePic captured BEFORE the upload).
	 *
	 * `put_profile_image` returns a temporary `@<f_id>` and commits the final
	 * `f1~…` into `tenants.profile_pic` asynchronously (variant generation +
	 * FileIdGeneratorTask + TenantImageUpdaterTask). A forced refresh is a safe
	 * no-op returning the OLD id until that commit lands, so polling until the
	 * value CHANGES is exactly "wait until the upload is activated, then sync".
	 *
	 * MUST target the caller's home server (`getClientFor(auth.idTag)` → primary
	 * client), which holds the federated mirror the sidebar reads — not the active
	 * community context. Fire-and-forget; the optimistic value already shows the
	 * new picture, so giving up just defers durability to the next loadCommunities().
	 */
	const reconcileCommunityPicture = React.useCallback(
		async (idTag: string, baseline?: string) => {
			const homeApi = auth?.idTag ? getClientFor(auth.idTag) : null
			if (!homeApi) return
			for (let attempt = 0; attempt < REFRESH_ATTEMPTS; attempt++) {
				try {
					const p = await homeApi.profiles.refresh(idTag)
					if (p?.profilePic && p.profilePic !== baseline) {
						setCommunityProfilePic(idTag, p.profilePic)
						setActiveContext((ctx) =>
							ctx && ctx.idTag === idTag ? { ...ctx, profilePic: p.profilePic } : ctx
						)
						return
					}
				} catch (err) {
					console.warn('community mirror refresh failed', err)
				}
				if (attempt < REFRESH_ATTEMPTS - 1) {
					await new Promise((r) => setTimeout(r, refreshBackoff(attempt)))
				}
			}
		},
		[auth?.idTag, getClientFor, setCommunityProfilePic, setActiveContext]
	)

	async function uploadProfile(img: Blob) {
		if (!auth) return

		const targetIdTag = profile.idTag
		const token = await resolveUploadToken(targetIdTag)
		if (!token) return

		// Authoritative pre-upload mirror picture, so the post-upload refresh accepts
		// only a CHANGED value (never re-writes the stale one). Read from the home
		// server's local mirror row, independent of any optimistic atom state.
		let mirrorBaseline: string | undefined
		if (isCommunity) {
			const homeApi = auth?.idTag ? getClientFor(auth.idTag) : null
			const mirror = homeApi
				? await homeApi.profiles.get(profile.idTag).catch(() => null)
				: null
			mirrorBaseline = mirror?.profilePic
		}

		// Upload
		const request = new XMLHttpRequest()
		request.open('PUT', `${getInstanceUrl(targetIdTag)}/api/me/image`)
		request.setRequestHeader('Authorization', `Bearer ${token}`)

		request.addEventListener('load', function (_e) {
			if (request.status === 200) {
				try {
					const res = JSON.parse(request.response)
					const profilePic = res.fileId || res
					if (profile) setProfile((p) => (p ? { ...p, profilePic } : p))
					// Only update auth state if this is user's own profile
					if (!isCommunity && auth?.tnId == profile.tnId)
						setAuth((a) => (a ? { ...a, profilePic } : a))
					if (isCommunity) {
						// Instant: patch the sidebar/list (and active context) avatar
						// optimistically so it updates immediately.
						setCommunityProfilePic(profile.idTag, profilePic)
						setActiveContext((ctx) =>
							ctx && ctx.idTag === profile.idTag ? { ...ctx, profilePic } : ctx
						)
						// Durable: force the home-server mirror to re-sync so the
						// value survives the next `loadCommunities()` overwrite. The
						// optimistic `profilePic` above is the community's own file id
						// (`@{f_id}`); the mirror refresh reconciles it to the synced
						// local value. Fire-and-forget with internal retry.
						void reconcileCommunityPicture(profile.idTag, mirrorBaseline)
					}
					setProfileUpload(undefined)
				} catch (err) {
					console.error('Failed to parse response:', err)
				}
			} else {
				console.error('Upload failed with status:', request.status, request.response)
			}
		})

		request.addEventListener('error', function () {
			console.error('Network error during profile upload')
			setProfileUpload(undefined)
		})

		request.send(img)
		// / Upload
	}

	function readAsDataUrl(file: File | undefined, set: (url: string) => void) {
		if (!file) return
		const reader = new FileReader()
		reader.onload = (evt) => {
			if (typeof evt.target?.result == 'string') set(evt.target.result)
		}
		reader.readAsDataURL(file)
	}

	async function exitEditMode() {
		const next = nameDraft.trim()
		if (next && next !== profile.name) {
			if (!updateProfile) {
				toast.error(t('Failed to save profile'))
				return // cannot save — keep edit mode open
			}
			try {
				await updateProfile({ name: next })
			} catch (_err) {
				toast.error(t('Failed to save profile'))
				return // keep edit mode open so the user can retry
			}
		} else {
			// Nothing to save (empty or unchanged) — discard the draft edits.
			setNameDraft(profile.name)
		}
		setEditMode(false)
	}

	function cancelEditMode() {
		setNameDraft(profile.name)
		setEditMode(false)
	}

	// The `cl:` reference to this profile route — the sibling of `copyIdTag`,
	// which copies the bare idTag. This route has no `AppDocBar` to carry it.
	async function copyRef() {
		try {
			// `me` only resolves for the copier — spell out whose profile it is.
			const path = location.pathname.replace(
				/^(\/[^/]+\/profile\/)me(?=\/|$)/,
				`$1${profile.idTag}`
			)
			await navigator.clipboard.writeText(buildRef(path, location.search))
			toast.success(t('Reference copied'))
		} catch (err) {
			console.error('[Profile] Failed to copy reference:', err)
			toast.error(t('Failed to copy reference'))
		}
	}

	async function copyIdTag() {
		try {
			await navigator.clipboard.writeText(profile.idTag)
			toast.success(t('Identity tag copied'))
		} catch (_err) {
			toast.error(t('Failed to copy'))
		}
	}

	const rel = localProfile
		? describeRelationship({ ...localProfile, type: profile.type })
		: undefined
	const canBlock = !own && !!auth && !!localProfile && rel?.primary !== 'blocked'
	const canEditImages = canAccessSettings && editMode

	return (
		<Fcd.Container className="g-1">
			<Fcd.Filter collapsed />
			<Fcd.Content>
				{!own && auth && <TrustBanner idTag={profile.idTag} onDecision={onTrustDecision} />}
				<ProfileHero
					cover={
						profile.coverPic ? (
							<Image
								src={getFileUrl(profile.idTag, profile.coverPic, 'vis.hd')}
								alt=""
							/>
						) : undefined
					}
					hue={idHue(profile.idTag)}
					avatar={
						<Avatar
							size="2xl"
							src={
								profile.profilePic
									? getFileUrl(profile.idTag, profile.profilePic, 'vis.sd')
									: undefined
							}
							alt={profile.name}
						/>
					}
					coverAction={
						canEditImages ? (
							<FileButton
								accept="image/*"
								icon={<IcCamera />}
								shape="pill"
								aria-label={t('Change cover photo')}
								onFiles={(files) => readAsDataUrl(files[0], setCoverUpload)}
							/>
						) : undefined
					}
					avatarAction={
						canEditImages ? (
							<FileButton
								accept="image/*"
								icon={<IcCamera />}
								shape="pill"
								aria-label={t('Change profile picture')}
								onFiles={(files) => readAsDataUrl(files[0], setProfileUpload)}
							/>
						) : undefined
					}
					header={
						<PageHeader
							className="auto-bg"
							title={
								editMode ? (
									<Input
										value={nameDraft}
										autoFocus
										onChange={(e) => setNameDraft(e.target.value)}
										onKeyDown={(e) => {
											if (e.key === 'Enter') {
												e.preventDefault()
												exitEditMode()
											} else if (e.key === 'Escape') {
												e.preventDefault()
												cancelEditMode()
											}
										}}
										aria-label={t('Display name')}
									/>
								) : (
									profile.name
								)
							}
							subtitle={
								<HBox gap={1} align="center" wrap>
									<HBox gap={1} align="center">
										<IdentityTag idTag={profile.idTag} />
										<Button
											variant="link"
											size="sm"
											// Keeps the clipboard write inside the click's user-activation
											// window: `Button` otherwise defers the handler past its press
											// animation, and Safari and Firefox refuse the write there.
											immediate
											icon={<IcCopy />}
											aria-label={t('Copy identity tag')}
											onClick={copyIdTag}
										/>
									</HBox>
									{!own && auth && (
										<>
											<TrustChip
												idTag={profile.idTag}
												onChanged={onTrustDecision}
											/>
											<RelationshipBadge
												localProfile={localProfile}
												profileType={profile.type}
											/>
										</>
									)}
								</HBox>
							}
							actions={
								<>
									{canAccessSettings &&
										(editMode ? (
											<>
												<Button
													variant="ghost"
													icon={<IcClose />}
													onClick={cancelEditMode}
												>
													{t('Cancel')}
												</Button>
												<Button
													color="primary"
													icon={<IcCheck />}
													onClick={exitEditMode}
												>
													{t('Done')}
												</Button>
											</>
										) : (
											<Button
												variant="ghost"
												icon={<IcEdit />}
												onClick={() => setEditMode(true)}
											>
												{t('Edit profile')}
											</Button>
										))}
									{auth?.idTag && !own && (
										<>
											{profile.type == 'person' &&
												localProfile?.connected == true && (
													<Button
														href={messagesPath(ctx.base, profile.idTag)}
														icon={<IcMessage />}
													>
														{t('Message')}
													</Button>
												)}
											<ProfileFollowButton
												localProfile={localProfile}
												profileType={profile.type}
												cmds={profileCmds}
											/>
										</>
									)}
									<Menu
										trigger={
											<Button
												variant="ghost"
												icon={<IcMore />}
												aria-label={t('More actions')}
											/>
										}
									>
										<MenuItem
											icon={<IcRef />}
											label={t('Copy reference')}
											onClick={copyRef}
										/>
										{auth?.idTag &&
											!own &&
											relationshipMenuItems(
												t,
												localProfile,
												profile.type,
												profileCmds
											)}
										{profileCmds.connectAs && (
											<MenuItem
												icon={<IcConnect />}
												label={t('Connect {{community}} with {{name}}', {
													community: profileCmds.connectAs.name,
													name: profile.name || profile.idTag
												})}
												onClick={profileCmds.connectAs.run}
											/>
										)}
										{canBlock && (
											<MenuItem
												icon={<IcBlock />}
												label={t('Block')}
												color="error"
												onClick={profileCmds.onBlock}
											/>
										)}
									</Menu>
								</>
							}
						/>
					}
					tabs={
						<ProfileTabs
							profile={profile}
							base={ctx.base}
							own={own}
							isCommunity={isCommunity}
							showRooms={showRooms}
						/>
					}
				/>
				{children}
				{coverUpload && (
					<ImageUpload
						src={coverUpload}
						aspects={['', '4:1', '3:1']}
						onSubmit={uploadCover}
						onCancel={onCancel}
					/>
				)}
				{profileUpload && (
					<ImageUpload
						src={profileUpload}
						aspects={['circle']}
						onSubmit={uploadProfile}
						onCancel={onCancel}
					/>
				)}
			</Fcd.Content>
			<Fcd.Details></Fcd.Details>
		</Fcd.Container>
	)
}

interface ProfileTabProps {
	profile: FullProfile
	updateProfile?: (patch: ProfilePatch) => Promise<void>
	/** User's roles in the viewed community (for non-context-switched viewing) */
	communityRoles?: string[]
	/** Whether this is a community profile (resolved from profile.type or localProfile.type) */
	isCommunity?: boolean
	/** Function to get proxy token for a target idTag */
	getTokenFor?: (
		idTag: string,
		opts?: { explicit?: boolean }
	) => Promise<{ token: string; roles?: string[] } | null>
	/** When set, render a PeopleHeader above the community member list (People page) */
	showPageHeader?: boolean
}

// ProfileAbout is now in ./about/ProfileAbout.tsx

export function ProfileFeed({ profile }: ProfileTabProps) {
	const { api } = useApi()
	const [auth] = useAuth()
	const setPendingQuote = useSetAtom(pendingQuoteAtom)
	const { switchTo } = useContextSwitch()
	const contextIdTag = useCurrentContextIdTag()
	const [feed, setFeed] = React.useState<ActionEvt[] | undefined>()
	const [composeOpen, setComposeOpen] = React.useState(false)
	const [composeMedia, setComposeMedia] = React.useState<
		'image' | 'camera' | 'video' | undefined
	>()
	const ref = React.useRef<HTMLDivElement>(null)
	const [width, setWidth] = React.useState(0)

	React.useEffect(
		function onLoadFeed() {
			if (!api) return
			;(async function () {
				const actions = await api.actions.list({ type: 'POST', audience: profile.idTag })
				console.log('Profile Feed res', actions)
				setFeed(actions)
			})()
		},
		[api]
	)

	React.useLayoutEffect(
		function () {
			if (!ref.current || !api || !auth) return
			function onResize() {
				if (!ref.current) return
				const styles = getComputedStyle(ref.current)
				const w =
					(ref.current?.clientWidth || 0) -
					parseInt(styles.paddingLeft || '0', 10) -
					parseInt(styles.paddingRight || '0', 10)
				if (width != w) setWidth(w)
			}

			onResize()
			window.addEventListener('resize', onResize)

			return function () {
				window.removeEventListener('resize', onResize)
			}
		},
		[auth, api, ref]
	)

	// Patch a stat by engaged action id, applied to every occurrence of that id
	// in the tree — top-level entry AND a repost's subjectAction — merging count
	// fields while preserving per-user fields the patch doesn't carry.
	const patchStat = React.useCallback(function patchStat(
		actionId: string,
		stat: Partial<ActionStat>
	) {
		setFeed((feed) => {
			if (!feed) return feed
			return feed.map((f) => {
				let next = f
				if (f.actionId === actionId) {
					next = { ...next, stat: { ...next.stat, ...stat } }
				}
				if (next.subjectAction?.actionId === actionId) {
					next = {
						...next,
						subjectAction: {
							...next.subjectAction,
							stat: { ...next.subjectAction.stat, ...stat }
						}
					}
				}
				return next
			})
		})
	}, [])

	function onSubmit(action: ActionEvt) {
		setFeed([action, ...(feed || [])])
	}

	return (
		<>
			{!!auth && !composeOpen && (
				<ComposeTrigger
					className="col"
					onOpen={(media) => {
						setComposeMedia(media)
						setComposeOpen(true)
					}}
				/>
			)}
			{!!auth && (
				<ComposePanel
					open={composeOpen}
					onClose={() => {
						setComposeOpen(false)
						setComposeMedia(undefined)
					}}
					onSubmit={onSubmit}
					idTag={profile.idTag !== auth.idTag ? profile.idTag : undefined}
					initialMedia={composeMedia}
					className="col"
				/>
			)}
			{!composeOpen && !!feed && (
				<VBox ref={ref} gap={1}>
					{feed.map((action) => (
						<ActionComp
							key={action.actionId}
							action={action}
							onPatchStat={patchStat}
							hideAudience={profile.idTag}
							srcTag={profile.idTag}
							width={width}
							onQuote={(original, target) => {
								setPendingQuote({ original, target })
								switchTo(contextIdTag ?? auth?.idTag ?? '')
							}}
						/>
					))}
				</VBox>
			)}
		</>
	)
}

// MemberCard component for community member management
interface MemberCardProps {
	member: Profile
	srcTag?: string
	showRoleControls?: boolean
	canChangeRole?: boolean
	onRoleChange?: (idTag: string, role: CommunityRole) => void
	onRemove?: (idTag: string) => void
	actorRoleLevel: number
	/** Tooltip / accessible name of the role dropdown */
	roleHint?: string
}

function MemberCard({
	member,
	srcTag,
	showRoleControls,
	canChangeRole,
	onRoleChange,
	onRemove,
	actorRoleLevel,
	roleHint
}: MemberCardProps) {
	const { t } = useTranslation()
	const dialog = useDialog()
	// `srcTag` is a REAL idTag, not a URL context — it is never a fallback for one.
	const ctx = useCtx()
	const roles = React.useMemo(() => getRoles(t), [t])
	// A leader may assign any role (including leader). Anyone else may only assign
	// roles strictly below their own level — e.g. a moderator cannot create another
	// moderator.
	const assignableRoles = React.useMemo(
		() =>
			actorRoleLevel >= ROLE_LEVELS.leader
				? roles
				: roles.filter((r) => ROLE_LEVELS[r.value] < actorRoleLevel),
		[roles, actorRoleLevel]
	)

	// Get the member's highest role
	const memberRole = getHighestRole(member.roles) || 'follower'

	async function handleRemove() {
		const confirmed = await dialog.confirm(
			t('Remove member'),
			t('Are you sure you want to remove {{name}} from this community?', {
				name: member.name || member.idTag
			}),
			'error'
		)
		if (confirmed && onRemove) {
			onRemove(member.idTag)
		}
	}

	const roleLabel = roles.find((r) => r.value === memberRole)?.label || memberRole

	const showBadge = showRoleControls || memberRole !== 'follower'

	const removeItem = onRemove && (
		<MenuItem
			icon={<IcRemoveMember />}
			label={t('Remove member')}
			color="error"
			onClick={handleRemove}
		/>
	)
	const hasMenu = canChangeRole || (showRoleControls && !!onRemove)

	return (
		<ListItem
			leading={<ProfilePicture profile={member} srcTag={srcTag} />}
			title={member.name}
			subtitle={<IdentityTag className="c-list-item-handle" idTag={member.idTag} />}
			href={profilePath(ctx.base, member.idTag)}
			trailing={
				<>
					<ProfileStatusBadge profile={member} />
					{hasMenu ? (
						<Menu
							trigger={
								<Button
									size="sm"
									variant="soft"
									color="secondary"
									aria-label={roleHint && `${roleHint}: ${roleLabel}`}
								>
									{roleLabel}
									<IcChevronDown />
								</Button>
							}
						>
							{canChangeRole &&
								assignableRoles.map((role) => (
									<MenuItem
										key={role.value}
										label={role.label}
										selected={memberRole === role.value}
										onClick={() => onRoleChange?.(member.idTag, role.value)}
									/>
								))}
							{canChangeRole && onRemove && <MenuDivider />}
							{removeItem}
						</Menu>
					) : (
						showBadge && (
							<Badge variant="outline" color="secondary">
								{roleLabel}
							</Badge>
						)
					)}
				</>
			}
		/>
	)
}

export function ProfileConnections({
	profile,
	communityRoles,
	isCommunity = false,
	showPageHeader = false
}: ProfileTabProps) {
	const { t } = useTranslation()
	const location = useLocation()
	const { getClientFor } = useApiContext()
	const [auth] = useAuth()
	const toast = useToast()
	const [activeContext] = useAtom(activeContextAtom)
	const [profiles, setProfiles] = React.useState<Profile[]>([])
	const [subTab, setSubTab] = React.useState<'active' | 'requests' | 'invitations'>('active')
	const [requestCount, setRequestCount] = React.useState(0)
	const [invitationCount, setInvitationCount] = React.useState(0)
	const [inviteOpen, setInviteOpen] = React.useState(false)
	const [refreshTick, setRefreshTick] = React.useState(0)
	const [showFilter, setShowFilter] = React.useState(false)
	const [search, setSearch] = React.useState('')
	const [roleFilter, setRoleFilter] = React.useState<CommunityRole | 'all'>('all')
	const roles = React.useMemo(() => getRoles(t), [t])

	// Check user's role in community context
	// Use communityRoles prop (from proxy token) OR activeContext roles if we're in the viewed community
	const isInViewedCommunity = activeContext?.idTag === profile.idTag
	const userRole = isInViewedCommunity
		? getHighestRole(activeContext?.roles)
		: getHighestRole(communityRoles)
	const userRoleLevel = userRole ? ROLE_LEVELS[userRole] : 0
	const canManageMembers = isCommunity && userRoleLevel >= ROLE_LEVELS.moderator
	const canChangeRoles = isCommunity && userRoleLevel >= ROLE_LEVELS.moderator

	const triggerRefresh = React.useCallback(() => setRefreshTick((n) => n + 1), [])

	// `connected === true` is the membership signal; 'R' (request pending) and
	// undefined/false are NOT members. The /profiles list also includes
	// invited-but-unaccepted people, so the Active tab and the Invitations
	// "accepted" derivation must filter on this.
	const memberProfiles = React.useMemo(
		() => profiles.filter((p) => p.connected === true),
		[profiles]
	)
	const connectedMemberTags = React.useMemo(
		() => new Set(memberProfiles.map((p) => p.idTag)),
		[memberProfiles]
	)

	const roleCounts = React.useMemo(() => {
		const counts: Record<string, number> = {}
		for (const p of memberProfiles) {
			const r = getHighestRole(p.roles) || 'follower'
			counts[r] = (counts[r] || 0) + 1
		}
		return counts
	}, [memberProfiles])

	const filteredMembers = React.useMemo(() => {
		const q = search.trim().toLowerCase()
		return memberProfiles.filter((p) => {
			if (roleFilter !== 'all' && (getHighestRole(p.roles) || 'follower') !== roleFilter)
				return false
			if (
				q &&
				!(p.name || '').toLowerCase().includes(q) &&
				!p.idTag.toLowerCase().includes(q)
			)
				return false
			return true
		})
	}, [memberProfiles, search, roleFilter])

	React.useEffect(
		function loadConnections() {
			if (!auth) return
			const client = getClientFor(profile.idTag, { auth: 'preferred' })
			if (!client) return
			let cancelled = false
			;(async function () {
				try {
					const profiles = await client.profiles.list({ type: 'person' })
					if (!cancelled) setProfiles(profiles as Profile[])
				} catch (err) {
					console.error('Failed to load member profiles', err)
					if (!cancelled) toast.error(t('Failed to load members'))
				}
			})()
			return () => {
				cancelled = true
			}
		},
		[auth, location.search, refreshTick, profile.idTag, getClientFor, toast, t]
	)

	React.useEffect(
		function loadCounts() {
			if (!isCommunity || !canManageMembers) return
			// Explicit: leader-only management data for a community the user
			// joined; it cannot be read anonymously at all.
			const client = getClientFor(profile.idTag, { explicit: true })
			if (!client) return
			let cancelled = false
			client.actions
				.list({ type: 'CONN', audience: profile.idTag, status: ['C', 'P'] })
				.then((rs) => {
					if (!cancelled) setRequestCount((rs as ActionView[]).length)
				})
				.catch((err) => {
					console.error('Failed to load CONN counts', err)
					if (!cancelled) setRequestCount(0)
				})
			// Home-side INVT copies rest at 'A' (the community keeps them on
			// record for the SUBS/CONN invitation lookup) and INVT acceptance
			// never changes that status, so a status:['C','P'] filter under-counts.
			// Instead, list INVTs for this community (status:['C','P','A']
			// excludes revoked/declined 'D'/'R' server-side) and count as
			// pending those whose invitee is not yet a connected member. This
			// mirrors the Invitations list.
			client.actions
				.list({ type: 'INVT', subject: '@' + profile.idTag, status: ['C', 'P', 'A'] })
				.then((rs) => {
					if (cancelled) return
					const pending = (rs as ActionView[]).filter(
						(a) => !(a.audience?.idTag && connectedMemberTags.has(a.audience.idTag))
					)
					setInvitationCount(pending.length)
				})
				.catch((err) => {
					console.error('Failed to load INVT counts', err)
					if (!cancelled) setInvitationCount(0)
				})
			return () => {
				cancelled = true
			}
		},
		[
			profile.idTag,
			canManageMembers,
			isCommunity,
			refreshTick,
			getClientFor,
			connectedMemberTags
		]
	)

	// Handle role change
	async function handleRoleChange(memberIdTag: string, newRole: CommunityRole) {
		try {
			// Explicit: a user-initiated administrative change.
			const client = getClientFor(profile.idTag, { explicit: true })
			if (!client) throw new Error('No API client for community')
			await client.profiles.adminUpdate(memberIdTag, { roles: [newRole] })
			// Update local state
			setProfiles((prev) =>
				prev.map((p) => (p.idTag === memberIdTag ? { ...p, roles: [newRole] } : p))
			)
			toast.success(t('Role updated'))
		} catch (err) {
			console.error('Failed to update role:', err)
			toast.error(t('Failed to update role'))
		}
	}

	// Handle member removal
	async function handleRemoveMember(memberIdTag: string) {
		try {
			// Explicit: a user-initiated administrative change.
			const client = getClientFor(profile.idTag, { explicit: true })
			if (!client) throw new Error('No API client for community')
			await client.actions.create({
				type: 'CONN',
				subType: 'DEL',
				audienceTag: memberIdTag
			})
			// Remove from local state
			setProfiles((prev) => prev.filter((p) => p.idTag !== memberIdTag))
			toast.success(t('Member removed'))
		} catch (err) {
			console.error('Failed to remove member:', err)
			toast.error(t('Failed to remove member'))
		}
	}

	const activeMembersList = (
		<List variant="divided" aria-label={t('Members')}>
			{filteredMembers.map((p) => {
				const targetLevel = ROLE_LEVELS[getHighestRole(p.roles) || 'follower']
				const isSelf = p.idTag === auth?.idTag
				const canManageThisMember =
					!isSelf && (userRoleLevel > targetLevel || userRoleLevel === ROLE_LEVELS.leader)
				return (
					<MemberCard
						key={p.idTag}
						member={p}
						srcTag={profile.idTag}
						showRoleControls={canManageMembers && canManageThisMember}
						canChangeRole={canChangeRoles && canManageThisMember}
						onRoleChange={
							canChangeRoles && canManageThisMember ? handleRoleChange : undefined
						}
						onRemove={
							canManageMembers && canManageThisMember ? handleRemoveMember : undefined
						}
						actorRoleLevel={userRoleLevel}
					/>
				)
			})}
		</List>
	)

	const filterSidebar = (
		<VBox gap={2} padding={2}>
			<SearchInput
				aria-label={t('Search members')}
				placeholder={t('Search members')}
				value={search}
				onChange={(e) => setSearch(e.target.value)}
			/>
			<Nav vertical aria-label={t('Role')}>
				<Nav.Section label={t('Role')}>
					<Nav.Item
						label={t('All')}
						count={memberProfiles.length}
						active={roleFilter === 'all'}
						onClick={() => setRoleFilter('all')}
					/>
					{roles
						.filter((r) => roleCounts[r.value] > 0)
						.map((r) => (
							<Nav.Item
								key={r.value}
								label={r.label}
								count={roleCounts[r.value]}
								active={roleFilter === r.value}
								onClick={() => setRoleFilter(r.value)}
							/>
						))}
				</Nav.Section>
			</Nav>
		</VBox>
	)

	const pageHeader = (actions?: React.ReactNode) => (
		<PeopleHeader
			variant="community"
			title={t('Members')}
			subtitle={`${profile.name || profile.idTag} · ${memberProfiles.length}`}
			profilePic={profile.profilePic}
			srcTag={profile.idTag}
			actions={actions}
		/>
	)

	// For communities with moderator+ access, show sub-tabs (Active / Requests / Invitations)
	if (isCommunity && canManageMembers) {
		const communityContent = (
			<>
				{/* On the routed page Invite members lives in the PageHeader
				    (FAB below md); embedded in a profile tab it wraps under the tabs. */}
				<HBox gap={2} align="center" wrap className="mb-2">
					<Tabs
						className="flex-fill"
						value={subTab}
						onTabChange={(v) => setSubTab(v as typeof subTab)}
					>
						<Tab value="active">{t('Active')}</Tab>
						<Tab value="requests" count={requestCount || undefined}>
							{t('Requests')}
						</Tab>
						<Tab value="invitations" count={invitationCount || undefined}>
							{t('Invitations')}
						</Tab>
					</Tabs>
					{!showPageHeader && (
						<Button
							color="primary"
							icon={<IcPlus />}
							onClick={() => setInviteOpen(true)}
						>
							{t('Invite members')}
						</Button>
					)}
				</HBox>

				{subTab === 'active' && activeMembersList}
				{subTab === 'requests' && (
					<PendingRequestsList
						communityIdTag={profile.idTag}
						getClientFor={getClientFor}
						onChange={triggerRefresh}
					/>
				)}
				{subTab === 'invitations' && (
					<InvitationsList
						communityIdTag={profile.idTag}
						getClientFor={getClientFor}
						connectedMemberTags={connectedMemberTags}
						onChange={triggerRefresh}
					/>
				)}

				<InviteMembersDialog
					open={inviteOpen}
					onClose={() => setInviteOpen(false)}
					communityIdTag={profile.idTag}
					communityName={profile.name}
					onSent={triggerRefresh}
				/>
			</>
		)

		if (!showPageHeader) {
			return (
				<>
					{communityContent}
					<PartnerCommunities community={profile} />
				</>
			)
		}

		return (
			<>
				<Fcd.Container className="g-1">
					<Fcd.Filter isVisible={showFilter} hide={() => setShowFilter(false)}>
						{subTab === 'active' ? filterSidebar : null}
					</Fcd.Filter>
					<Fcd.Content
						width="reading"
						header={pageHeader(
							<>
								{subTab === 'active' && (
									<FilterToggle onClick={() => setShowFilter(true)} />
								)}
								<Button
									className="sm-hide"
									color="primary"
									icon={<IcPlus />}
									onClick={() => setInviteOpen(true)}
								>
									{t('Invite members')}
								</Button>
							</>
						)}
					>
						{communityContent}
					</Fcd.Content>
				</Fcd.Container>
				<FAB
					className="md-hide lg-hide"
					icon={<IcPlus />}
					aria-label={t('Invite members')}
					onClick={() => setInviteOpen(true)}
				/>
			</>
		)
	}

	// For communities (non-moderators), use MemberCard with no role controls
	if (isCommunity) {
		if (!showPageHeader) {
			return (
				<>
					{activeMembersList}
					<PartnerCommunities community={profile} />
				</>
			)
		}

		return (
			<Fcd.Container className="g-1">
				<Fcd.Filter isVisible={showFilter} hide={() => setShowFilter(false)}>
					{filterSidebar}
				</Fcd.Filter>
				<Fcd.Content
					width="reading"
					header={pageHeader(<FilterToggle onClick={() => setShowFilter(true)} />)}
				>
					{activeMembersList}
				</Fcd.Content>
			</Fcd.Container>
		)
	}

	// My own person tenant: my followers/connections, each with the role I give them
	if (auth?.idTag === profile.idTag) {
		return (
			<List variant="divided" aria-label={t('Connections')}>
				{profiles
					.filter((p) => p.idTag !== auth.idTag && (p.connected === true || p.follower))
					.map((p) => (
						<MemberCard
							key={p.idTag}
							member={p}
							srcTag={profile.idTag}
							canChangeRole
							onRoleChange={handleRoleChange}
							actorRoleLevel={ROLE_LEVELS.leader}
							roleHint={t('Their role with you')}
						/>
					))}
			</List>
		)
	}

	// For other personal profiles, use original ProfileListCard
	return (
		<List variant="divided" aria-label={t('Connections')}>
			{profiles.map((p) => (
				<ProfileListCard key={p.idTag} profile={p} srcTag={profile.idTag} />
			))}
		</List>
	)
}

function ProfileView() {
	const _loc = useLocation()
	const { t } = useTranslation()

	const [auth] = useAuth()
	const [activeContext] = useAtom(activeContextAtom)
	const { api } = useApi()
	const { getTokenFor, getClientFor } = useApiContext()
	const { rememberStoredTrust } = useProfileTrust()
	const dialog = useDialog()
	const connectCommunity = useConnectCommunity()
	const params = useParams()
	const idTag = params.idTag == 'me' ? (auth?.idTag ?? api?.idTag) : params.idTag || auth?.idTag
	const own = idTag == auth?.idTag
	const [profile, setProfile] = React.useState<FullProfile>()
	const [localProfile, setLocalProfile] = React.useState<Partial<Profile>>()
	// Tick to force profile refetch after a trust decision so cached proxy-token-gated
	// content reloads with the new auth state.
	const [trustTick, setTrustTick] = React.useState(0)
	// User's roles in the viewed community (fetched via proxy token)
	const [communityRoles, setCommunityRoles] = React.useState<string[]>([])
	const porch = usePorch(idTag, communityRoles)
	const canCreateRooms = useCanCreateRooms(idTag, communityRoles)
	//console.log('Profile', idTag, profile, 'contextIdTag', contextIdTag)

	// Fetch user's roles when viewing a community profile
	React.useEffect(
		function loadCommunityRoles() {
			if (!idTag || own) {
				setCommunityRoles([])
				return
			}
			// Fetch proxy token to get user's roles in this community
			getTokenFor(idTag)
				.then((result) => {
					if (result?.roles) {
						setCommunityRoles(result.roles)
					} else {
						setCommunityRoles([])
					}
				})
				.catch((err) => {
					console.warn('Profile: failed to fetch community roles:', err)
					setCommunityRoles([])
				})
		},
		[idTag, own, getTokenFor, trustTick]
	)

	React.useEffect(
		function load() {
			if (!idTag) return
			if (!api) return

			if (idTag != profile?.idTag) {
				setProfile(undefined)
				setLocalProfile(undefined)
			}

			let cancelled = false

			if (own) {
				api!.profiles.getOwnFull().then((p) => {
					if (!cancelled) setProfile(p as unknown as FullProfile)
				})
			} else {
				// Trust-gated: ask getTokenFor for a proxy token. The gate returns
				// null for 'never' / 'X' / no decision and a fresh token for
				// 'always' / 'S'. Without this the remote /me/full call is always
				// anonymous and a trust change has no visible effect on the page
				// content until a manual reload.
				getTokenFor(idTag!)
					.then((result) => api!.profiles.getRemoteFull(idTag!, result?.token))
					.then((p) => {
						if (!cancelled) setProfile(p as unknown as FullProfile)
					})
					.catch(() => {
						if (!cancelled) setProfile(undefined)
					})
			}

			if (auth) {
				api!.profiles
					.get(idTag!)
					.then((p) => {
						if (cancelled) return
						setLocalProfile(p ?? {})
						// Populate the stored-trust cache from the local profile row so
						// the fetch gate can answer "always / never / ask" synchronously.
						if (!own && idTag) {
							rememberStoredTrust(idTag, p?.trust ?? null)
						}
					})
					.catch(() => {
						if (!cancelled) setLocalProfile({})
					})
			} else {
				setLocalProfile({})
			}

			return () => {
				cancelled = true
			}
		},
		[api, idTag, profile?.idTag, auth?.idTag, trustTick, own, rememberStoredTrust, getTokenFor]
	)

	// Listen for connection acceptance via WsBus
	const { loadCommunities } = useCommunitiesList()

	useWsBus({ cmds: ['ACTION'] }, (msg) => {
		const action = msg.data as ActionView
		if (action.type === 'CONN' && action.subType === 'ACC') {
			// Connection accepted — update profile if we're viewing the acceptor
			if (action.issuer?.idTag === idTag) {
				setLocalProfile((p) => (p ? { ...p, connected: true } : p))
				// Refresh communities list if it's a community
				if (profile?.type === 'community') {
					loadCommunities()
				}
			}
		}
	})

	// Determine if user can edit this profile (own profile OR community leader)
	const isInViewedCommunity = activeContext?.idTag === profile?.idTag
	const userRole = isInViewedCommunity
		? getHighestRole(activeContext?.roles)
		: getHighestRole(communityRoles)
	const canEdit = own || (profile?.type === 'community' && userRole === 'leader')

	const updateProfile: ProfileTabProps['updateProfile'] = !canEdit
		? undefined
		: async function updateProfile(patch: ProfilePatch) {
				//console.log('updateProfile', patch)
				let res: { profile: unknown } | undefined
				if (own) {
					// Own profile: direct API call
					res = await api?.profiles.updateOwn(patch)
				} else {
					// Community profile: explicit user edit — bypass the profile-trust
					// gate and always fetch the proxy token.
					const proxyResult = await getTokenFor(profile!.idTag, { explicit: true })
					if (!proxyResult?.token) throw new Error('Failed to get proxy token')
					const response = await fetch(`${getInstanceUrl(profile!.idTag)}/api/me`, {
						method: 'PATCH',
						headers: {
							Authorization: `Bearer ${proxyResult.token}`,
							'Content-Type': 'application/json'
						},
						body: JSON.stringify(patch)
					})
					if (!response.ok) throw new Error(`Profile update failed: ${response.status}`)
					const data = await response.json()
					res = data.data ?? data
				}
				// Use response x if available, otherwise optimistic merge
				const responseX = (res?.profile as unknown as FullProfile)?.x
				setProfile((prev) => ({
					...(prev as FullProfile),
					...(res?.profile as unknown as FullProfile),
					x: responseX ?? prev?.x
				}))
			}

	async function onFollow() {
		if (!profile || localProfile?.following) return
		const followAction: NewAction = { type: 'FLLW', audienceTag: profile.idTag }
		await api!.actions.create(followAction)
		setLocalProfile((p) => (p ? { ...p, following: true } : p))
	}

	async function onUnfollow() {
		if (!profile || !localProfile?.following) return
		const unfollowAction: NewAction = {
			type: 'FLLW',
			subType: 'DEL',
			audienceTag: profile.idTag
		}
		await api!.actions.create(unfollowAction)
		setLocalProfile((p) => (p ? { ...p, following: false } : p))
	}

	async function onConnect() {
		if (!profile || localProfile?.connected) return

		let content: string | undefined

		if (profile.type === 'community' && profile.settings?.connectionMode === 'A') {
			// Auto-accept community: simple confirm, no message
			const confirmed = await dialog.confirm(
				t('Join community'),
				t('Do you want to join this community?')
			)
			if (!confirmed) return
			content = ''
		} else {
			// Person or manual-approve community: text dialog with optional message
			const title = profile.type === 'community' ? t('Join request') : t('Connection request')
			const description =
				profile.type === 'community'
					? t('Send a join request to this community?')
					: t('Are you sure you want to send a connection request?')
			content = await dialog.askText(title, description, {
				placeholder: t('Personalize the connection request'),
				multiline: true
			})
			if (content == undefined) return
		}

		const connectAction: NewAction = {
			type: 'CONN',
			audienceTag: profile.idTag,
			content
		}
		await api!.actions.create(connectAction)
		setLocalProfile((p) => (p ? { ...p, connected: 'R' } : p))
	}

	// A leader acting as community A connects A with community B through A's context token;
	// the request is A's, so the page's own relation (`localProfile.connected`) stays as is.
	const actingCommunity =
		activeContext?.type === 'community' &&
		!activeContext.hat &&
		activeContext.roles.includes('leader') &&
		profile?.type === 'community' &&
		profile.idTag !== activeContext.idTag
			? activeContext
			: undefined

	async function onConnectAs() {
		if (!profile || !actingCommunity) return
		const client = getClientFor(actingCommunity.idTag, { explicit: true })
		if (client) await connectCommunity(client, profile)
	}

	async function onDisconnect() {
		if (!profile || !localProfile?.connected) return
		if (
			!(await dialog.confirm(
				t('Cancel connection'),
				t('Are you sure you want to disconnect?')
			))
		)
			return
		const disconnectAction: NewAction = {
			type: 'CONN',
			subType: 'DEL',
			audienceTag: profile.idTag
		}
		await api!.actions.create(disconnectAction)
		setLocalProfile((p) => (p ? { ...p, connected: undefined } : p))
	}

	async function onBlock() {
		if (!profile || localProfile?.status == 'B') return
		const _res = await api!.profiles.updateConnection(profile.idTag, { status: 'B' })
		setLocalProfile((p) => (p ? { ...p, status: 'B' } : p))
	}

	async function onUnblock() {
		if (!profile || localProfile?.status != 'B') return
		const _res = await api!.profiles.updateConnection(profile.idTag, { status: 'A' })
		setLocalProfile((p) => (p ? { ...p, status: 'A' } : p))
	}

	// Determine if this is a community profile
	const isCommunity = profile?.type === 'community'

	if (!profile) {
		return <ProfileSkeleton />
	}

	return (
		<ProfilePage
			profile={profile}
			setProfile={setProfile}
			localProfile={localProfile}
			updateProfile={updateProfile}
			profileCmds={{
				onFollow,
				onUnfollow,
				onConnect,
				onDisconnect,
				onBlock,
				onUnblock,
				connectAs: actingCommunity && { name: actingCommunity.name, run: onConnectAs }
			}}
			communityRoles={communityRoles}
			getTokenFor={getTokenFor}
			onTrustDecision={() => setTrustTick((n) => n + 1)}
			showRooms={!!porch.rooms?.length || canCreateRooms}
		>
			<Routes>
				<Route
					path="/"
					element={<ProfileAbout profile={profile} updateProfile={updateProfile} />}
				/>
				<Route
					path="/about"
					element={<ProfileAbout profile={profile} updateProfile={updateProfile} />}
				/>
				<Route
					path="/feed"
					element={<ProfileFeed profile={profile} updateProfile={updateProfile} />}
				/>
				<Route
					path="/connections"
					element={
						<ProfileConnections
							profile={profile}
							updateProfile={updateProfile}
							communityRoles={communityRoles}
							isCommunity={isCommunity}
						/>
					}
				/>
				<Route
					path="/rooms"
					element={
						<RoomsTab
							idTag={profile.idTag}
							rooms={porch.rooms}
							canCreate={canCreateRooms}
							reload={porch.reload}
						/>
					}
				/>
				<Route path="/*" element={null} />
			</Routes>
		</ProfilePage>
	)
}

export function PeoplePage() {
	const { t } = useTranslation()
	const [auth] = useAuth()
	const [activeContext] = useAtom(activeContextAtom)

	// The URL is the source of truth for which context this page shows. `ctx.isHome`
	// already collapses `~` and the node's own idTag; the signed-in user's own idTag is
	// the personal page too, on a node they are only a guest of.
	const ctx = useCtx()
	const isHomeContext = ctx.isHome || ctx.idTag === auth?.idTag

	// Personal People page: the user's own connections. This is correct immediately,
	// so render it without waiting for the active context to resolve.
	if (isHomeContext) {
		return <PersonListPage />
	}

	// Community People page. On a hard reload, activeContextAtom starts null and is
	// set asynchronously by CtxProvider -> setActiveContext. Until the active
	// context has switched to match THIS community URL, show a spinner. Falling
	// through to PersonListPage here is what caused personal connections to flash
	// before the community members loaded.
	if (activeContext?.type === 'community' && activeContext.idTag === ctx.idTag) {
		const communityProfile = {
			tnId: 0,
			idTag: activeContext.idTag,
			name: activeContext.name,
			type: 'community' as const,
			profilePic: activeContext.profilePic
		}
		return (
			<ProfileConnections
				profile={communityProfile}
				isCommunity
				communityRoles={activeContext.roles}
				showPageHeader
			/>
		)
	}

	return (
		<Center className="w-100 h-100">
			<LoadingSpinner size="lg" label={t('Loading...')} />
		</Center>
	)
}

/**
 * The `profile/…` branch of the context route — **guest-visible**, which is why it is split
 * from `authedProfileRoutes` below: a share link lands anonymous visitors on a profile, and
 * bouncing them to `/login` would break it. The splat is load-bearing — `ProfileView` runs
 * its own descendant `<Routes>` for the sub-pages.
 *
 * A plain function, not a component — see `layout.tsx` for why.
 */
export function profileRoutes() {
	return <Route path="profile/:idTag/*" element={<ProfileView />} />
}

/**
 * The `users` and `communities/…` branches — everything in this file that needs a
 * session. Declared under the route tree's `RequireAuth` guard.
 */
export function authedProfileRoutes() {
	return (
		<>
			<Route path="users" element={<PeoplePage />} />
			<Route path="communities" element={<CommunityListPage />} />
			<Route path="communities/map" element={<CommunityMap />} />
			<Route path="communities/create" element={<CreateCommunity />} />
			<Route path="communities/create/:providerType" element={<CreateCommunity />} />
			<Route path="communities/create/:providerType/:idpStep" element={<CreateCommunity />} />
			<Route
				path="communities/create/:providerType/:idpStep/:provider"
				element={<CreateCommunity />}
			/>
		</>
	)
}

// vim: ts=4
