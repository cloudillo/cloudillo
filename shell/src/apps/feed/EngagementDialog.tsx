// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * Unified engagement dialog: lists the individual users behind a post's
 * reaction chips and repost counter, loaded from the audience tenant. Each row
 * shows a signature-verification status. Logged in, the home node verifies every
 * row whose issuer it already knows in one batch (`POST /actions/verify`); the rest, and
 * every row for a guest, get a Verify button (a guest verifies in the browser).
 */

import {
	actionContextTag,
	Badge,
	Button,
	Dialog,
	EmptyState,
	HatVia,
	HBox,
	hatRingClass,
	Icon,
	List,
	ListItem,
	LoadingSpinner,
	PersonHover,
	ProfilePicture,
	SkeletonList,
	Tab,
	Tabs,
	Text,
	Tooltip,
	useApi,
	useAuth
} from '@cloudillo/react'
import type { VerifyTokenResult } from '@cloudillo/core'
import type { ActionView } from '@cloudillo/types'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { useApiContext, useCtx } from '../../context/index.js'
import {
	IcInvalid,
	IcPeople,
	IcSignatureUnavailable,
	IcUnverified,
	IcVerified
} from '../../icons.js'
import { profilePath } from '../../routes.js'
import { getReactionEmoji, getReactionLabel } from './reactions.js'
import { useEngagement } from './useEngagement.js'
import {
	cacheProfileKeys,
	getCachedProfileKeys,
	homeVerified,
	tokenMatchesAction,
	type VerifyExpect,
	type VerifyStatus,
	verifyActionToken
} from './verifyAction.js'

// 'unavailable' — no token on the action (backend flag off / older data).
// 'unchecked'   — has token but not auto-verified; user can press Verify.
// 'pending'     — verification in progress.
// the rest mirror VerifyStatus.
type RowStatus = 'unavailable' | 'unchecked' | 'pending' | VerifyStatus

/** Most tokens per `POST /actions/verify` (backend cap). */
const VERIFY_CHUNK = 100

/**
 * A home-node result as a row status: the signature checked there, the claims here on the
 * same token bytes. An issuer the node doesn't know yet keeps the Verify button.
 */
function serverStatus(
	res: VerifyTokenResult | undefined,
	token: string,
	expect: VerifyExpect
): RowStatus {
	switch (res?.status) {
		case undefined:
			return 'error'
		case 'unknown':
			return 'unchecked'
		case 'verified':
			return homeVerified(res, token, expect) ? 'verified' : 'invalid'
		case 'invalid':
			return 'invalid'
		default:
			return 'error'
	}
}

export interface EngagementDialogProps {
	subjectActionId: string
	audienceTag: string
	initialTab: 'all' | 'reposts' | (string & {})
	open: boolean
	onClose: () => void
}

export function EngagementDialog({
	subjectActionId,
	audienceTag,
	initialTab,
	open,
	onClose
}: EngagementDialogProps) {
	const { t } = useTranslation()
	const { api } = useApi()
	const [auth] = useAuth()
	const { getTokenFor } = useApiContext()
	const homeTag = auth?.idTag
	// Home client explicitly: plain useApi() follows apiAtom, which may name a community.
	const { api: homeApi } = useApi(homeTag ?? null)

	const { reactions, reactionGroups, reposts, loading, error, reload } = useEngagement(
		subjectActionId,
		audienceTag,
		open
	)

	const [activeTab, setActiveTab] = React.useState<string>(initialTab)
	const [statuses, setStatuses] = React.useState<Map<string, RowStatus>>(new Map())

	// Reset the active tab whenever the dialog is (re)opened against a new target.
	React.useEffect(() => {
		if (open) setActiveTab(initialTab)
	}, [open, initialTab])

	// REACT tokens carry the subject post's audience (the `audienceTag` prop); REPOST tokens
	// their OWN explicit audience (boost → reposter, wall-repost → community).
	const expectFor = React.useCallback(
		(action: ActionView): VerifyExpect => ({
			issuerIdTag: action.issuer.idTag,
			subjectActionId,
			audienceTag: action.type === 'REPOST' ? actionContextTag(action) : audienceTag
		}),
		[subjectActionId, audienceTag]
	)

	// Fetch the issuer's published keys (cached for the session) and verify the
	// action's signature. `subjectActionId` is cross-checked against payload.sub.
	const fetchKeysAndVerify = React.useCallback(
		async (action: ActionView): Promise<RowStatus> => {
			const token = action.token
			if (!token) return 'unavailable'
			const issuerIdTag = action.issuer.idTag
			// Cheap integrity bind before any crypto.
			if (!(await tokenMatchesAction(token, action.actionId))) return 'invalid'
			let keys = getCachedProfileKeys(issuerIdTag)
			if (!keys) {
				try {
					const tok = await getTokenFor(issuerIdTag, { explicit: true })
					keys = await api!.profiles.getRemoteFull(issuerIdTag, tok?.token)
					cacheProfileKeys(issuerIdTag, keys)
				} catch {
					return 'error'
				}
			}
			const result = await verifyActionToken(token, keys, expectFor(action))
			return result.status
		},
		[api, getTokenFor, expectFor]
	)

	// Logged in, forced: sync the issuer's profile on the home node, then verify there.
	const syncAndVerify = React.useCallback(
		async (action: ActionView): Promise<RowStatus> => {
			const token = action.token
			if (!token) return 'unavailable'
			if (!(await tokenMatchesAction(token, action.actionId))) return 'invalid'
			try {
				const [res] = await homeApi!.actions.verify([token], { sync: true })
				return serverStatus(res, token, expectFor(action))
			} catch {
				return 'error'
			}
		},
		[homeApi, expectFor]
	)

	// Logged in: every row with a token goes to the home node in batches; it verifies
	// those whose issuer it knows and answers `unknown` (→ Verify button) for the rest.
	React.useEffect(() => {
		if (!open || loading || !homeTag || !homeApi) return
		const all = [...reactions, ...reposts]
		if (!all.length) return

		setStatuses(new Map(all.map((a) => [a.actionId, a.token ? 'pending' : 'unavailable'])))

		let cancelled = false
		;(async () => {
			const rows: ActionView[] = []
			const bad: string[] = []
			for (const a of all) {
				if (!a.token) continue
				if (await tokenMatchesAction(a.token, a.actionId)) rows.push(a)
				else bad.push(a.actionId)
			}
			if (cancelled) return
			if (bad.length) {
				setStatuses((prev) => {
					const next = new Map(prev)
					for (const id of bad) next.set(id, 'invalid')
					return next
				})
			}
			for (let i = 0; i < rows.length; i += VERIFY_CHUNK) {
				const chunk = rows.slice(i, i + VERIFY_CHUNK)
				let res: VerifyTokenResult[] = []
				try {
					res = await homeApi.actions.verify(chunk.map((a) => a.token!))
				} catch {
					// Every row of the chunk falls back to 'error' (Verify button).
				}
				if (cancelled) return
				setStatuses((prev) => {
					const next = new Map(prev)
					chunk.forEach((a, j) => {
						next.set(a.actionId, serverStatus(res[j], a.token!, expectFor(a)))
					})
					return next
				})
			}
		})()

		return () => {
			cancelled = true
		}
	}, [open, loading, reactions, reposts, homeTag, homeApi, expectFor])

	// Guest: every row with a token gets a Verify button.
	React.useEffect(() => {
		if (!open || loading || homeTag) return
		setStatuses(
			new Map(
				[...reactions, ...reposts].map((a) => [
					a.actionId,
					a.token ? 'unchecked' : 'unavailable'
				])
			)
		)
	}, [open, loading, reactions, reposts, homeTag])

	const onVerify = React.useCallback(
		async (action: ActionView) => {
			setStatuses((prev) => new Map(prev).set(action.actionId, 'pending'))
			const status = homeTag ? await syncAndVerify(action) : await fetchKeysAndVerify(action)
			setStatuses((prev) => new Map(prev).set(action.actionId, status))
		},
		[homeTag, syncAndVerify, fetchKeysAndVerify]
	)

	if (!open) return null

	const rows: ActionView[] =
		activeTab === 'all'
			? reactions
			: activeTab === 'reposts'
				? reposts
				: reactions.filter((a) => a.subType === activeTab)
	const showEmoji = activeTab === 'all'

	return (
		<Dialog open dismissable title={t('Reactions')} onClose={onClose}>
			<Tabs value={activeTab} onTabChange={setActiveTab} className="mb-2">
				<Tab value="all">
					{t('All')} {reactions.length > 0 && <CountBadge count={reactions.length} />}
				</Tab>
				{reactionGroups.map((g) => (
					<Tab key={g.key} value={g.key} aria-label={getReactionLabel(t, g.key)}>
						{getReactionEmoji(g.key)} <CountBadge count={g.actions.length} />
					</Tab>
				))}
				<Tab value="reposts">
					{t('Reposts')} {reposts.length > 0 && <CountBadge count={reposts.length} />}
				</Tab>
			</Tabs>

			{loading ? (
				<SkeletonList count={5} />
			) : error ? (
				<EmptyState
					title={t('Could not load')}
					description={error.message}
					action={
						<Button color="primary" onClick={reload}>
							{t('Retry')}
						</Button>
					}
				/>
			) : rows.length === 0 ? (
				<EmptyState
					icon={<IcPeople />}
					title={activeTab === 'reposts' ? t('No reposts yet') : t('No reactions yet')}
				/>
			) : (
				<List scroll>
					{rows.map((action) => (
						<EngagementRow
							key={action.actionId}
							action={action}
							audienceTag={audienceTag}
							status={statuses.get(action.actionId) ?? 'unavailable'}
							emoji={showEmoji ? getReactionEmoji(action.subType ?? '') : undefined}
							onVerify={onVerify}
							onClose={onClose}
						/>
					))}
				</List>
			)}
		</Dialog>
	)
}

function CountBadge({ count }: { count: number }) {
	return (
		<Badge size="sm" variant="soft">
			{count}
		</Badge>
	)
}

interface EngagementRowProps {
	action: ActionView
	audienceTag: string
	status: RowStatus
	emoji?: string
	onVerify: (action: ActionView) => void
	onClose: () => void
}

function EngagementRow({
	action,
	audienceTag,
	status,
	emoji,
	onVerify,
	onClose
}: EngagementRowProps) {
	const [auth] = useAuth()
	const urlContext = useCtx().base
	const issuer = action.issuer
	// Gate on the resolved tag, not on `auth` — this dialog is guest-reachable
	// (the reaction/repost chips that open it are not auth-gated).
	const picIdTag = audienceTag || auth?.idTag

	return (
		<ListItem
			href={profilePath(urlContext, issuer.idTag)}
			onClick={onClose}
			leading={
				// ProfilePicture forwards no ref, so the HBox is the trigger
				<PersonHover idTag={issuer.idTag}>
					<HBox>
						<ProfilePicture
							className={hatRingClass(action.hat)}
							profile={issuer}
							srcTag={picIdTag}
							size="sm"
						/>
					</HBox>
				</PersonHover>
			}
			title={<HatVia hat={action.hat} srcTag={picIdTag} name={issuer.name || issuer.idTag} />}
			subtitle={`@${issuer.idTag}`}
			trailing={
				<HBox align="center" gap={2}>
					{emoji && (
						<Text size="lg" aria-hidden="true">
							{emoji}
						</Text>
					)}
					<VerifyBadge status={status} onVerify={() => onVerify(action)} />
				</HBox>
			}
		/>
	)
}

function StatusIcon({
	icon,
	label,
	color
}: {
	icon: React.ComponentType<React.SVGAttributes<SVGElement>>
	label: string
	color?: 'success' | 'error'
}) {
	return (
		<Tooltip content={label}>
			<Icon as={icon} label={label} color={color} tabIndex={0} />
		</Tooltip>
	)
}

function VerifyBadge({ status, onVerify }: { status: RowStatus; onVerify: () => void }) {
	const { t } = useTranslation()

	switch (status) {
		case 'pending':
			return <LoadingSpinner size="xs" label={t('Checking signature…')} />
		case 'verified':
			return <StatusIcon icon={IcVerified} color="success" label={t('Signature verified')} />
		case 'invalid':
			return (
				<Badge color="error" variant="soft" icon={<IcInvalid />}>
					{t('Invalid signature')}
				</Badge>
			)
		case 'no-key':
			return <StatusIcon icon={IcUnverified} label={t('No matching key published')} />
		case 'unavailable':
			return <StatusIcon icon={IcSignatureUnavailable} label={t('Signature unavailable')} />
		default:
			// 'unchecked' or 'error' — offer an explicit Verify action.
			return (
				<Button size="sm" color="secondary" onClick={onVerify}>
					{t('Verify')}
				</Button>
			)
	}
}

// vim: ts=4
