// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Unified engagement dialog: lists the individual users behind a post's
 * reaction chips and repost counter, loaded from the audience tenant. Each row
 * shows a signature-verification status; connections/followed identities are
 * verified automatically in the background, everyone else gets a Verify button.
 */

import { getFileUrl } from '@cloudillo/core'
import {
	Button,
	Dialog,
	EmptyState,
	LoadingSpinner,
	SkeletonList,
	Tab,
	Tabs,
	useApi,
	useAuth
} from '@cloudillo/react'
import type { ActionView } from '@cloudillo/types'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
	LuUsers as IcEmpty,
	LuShieldX as IcInvalid,
	LuShieldQuestion as IcNoKey,
	LuShieldOff as IcUnavailable,
	LuShieldCheck as IcVerified
} from 'react-icons/lu'
import { Link } from 'react-router-dom'

import { HOME_CONTEXT, useApiContext, useUrlContextIdTag } from '../../context/index.js'
import { getReactionEmoji, getReactionLabel } from './reactions.js'
import { useAutoVerifySet, useEngagement } from './useEngagement.js'
import {
	cacheProfileKeys,
	getCachedProfileKeys,
	tokenMatchesAction,
	type VerifyStatus,
	verifyActionToken
} from './verifyAction.js'

// 'unavailable' — no token on the action (backend flag off / older data).
// 'unchecked'   — has token but not auto-verified; user can press Verify.
// 'pending'     — verification in progress.
// the rest mirror VerifyStatus.
type RowStatus = 'unavailable' | 'unchecked' | 'pending' | VerifyStatus

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

	const { reactions, reactionGroups, reposts, loading, error, reload } = useEngagement(
		subjectActionId,
		audienceTag,
		open
	)
	const autoVerifySet = useAutoVerifySet(open)

	const [activeTab, setActiveTab] = React.useState<string>(initialTab)
	const [statuses, setStatuses] = React.useState<Map<string, RowStatus>>(new Map())

	// Reset the active tab whenever the dialog is (re)opened against a new target.
	React.useEffect(() => {
		if (open) setActiveTab(initialTab)
	}, [open, initialTab])

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
					if (auth?.idTag && issuerIdTag === auth.idTag) {
						// Own identity: a tenant's own keys live in its auth store,
						// not in any federated remote-profile cache, and the browser
						// reaches its own node through the authenticated profile path
						// rather than the cross-tenant "remote" fetch. Read them
						// directly so the viewer can verify their own actions.
						keys = await api!.profiles.getOwnFull()
					} else {
						const tok = await getTokenFor(issuerIdTag, { explicit: true })
						keys = await api!.profiles.getRemoteFull(issuerIdTag, tok?.token)
					}
					cacheProfileKeys(issuerIdTag, keys)
				} catch {
					return 'error'
				}
			}
			// REACT tokens carry the subject post's audience (the `audienceTag` prop).
			// REPOST tokens carry the repost's OWN explicitly-set audience (boost →
			// reposter, wall-repost → community), so verify each repost against its
			// own audience.
			const expectedAudienceTag =
				action.type === 'REPOST'
					? (action.audience?.idTag ?? action.issuer.idTag)
					: audienceTag
			const result = await verifyActionToken(token, keys, {
				issuerIdTag,
				subjectActionId,
				audienceTag: expectedAudienceTag
			})
			return result.status
		},
		[api, getTokenFor, subjectActionId, audienceTag, auth?.idTag]
	)

	// Background auto-verify: after the lists load, walk rows whose issuer is in
	// the auto-verify set sequentially (one remote key fetch at a time). The list
	// renders immediately; statuses fill in. Aborts on close/unmount.
	React.useEffect(() => {
		if (!open || loading) return
		if (autoVerifySet === undefined) return
		const all = [...reactions, ...reposts]
		if (!all.length) return

		const init = new Map<string, RowStatus>()
		for (const a of all) {
			init.set(
				a.actionId,
				!a.token
					? 'unavailable'
					: autoVerifySet.has(a.issuer.idTag)
						? 'pending'
						: 'unchecked'
			)
		}
		setStatuses(init)

		// Per-run flag captured in this closure: when deps change, the old run's
		// cleanup flips its own `cancelled`, leaving the new run's untouched (a
		// shared ref would get reset to false by the re-run and let a stale loop
		// resume). Mirrors the pattern in useEngagement.ts.
		let cancelled = false
		;(async () => {
			for (const a of all) {
				if (cancelled) return
				if (!a.token || !autoVerifySet.has(a.issuer.idTag)) continue
				const status = await fetchKeysAndVerify(a)
				if (cancelled) return
				setStatuses((prev) => new Map(prev).set(a.actionId, status))
			}
		})()

		return () => {
			cancelled = true
		}
	}, [open, loading, reactions, reposts, autoVerifySet, fetchKeysAndVerify])

	const onVerify = React.useCallback(
		async (action: ActionView) => {
			setStatuses((prev) => new Map(prev).set(action.actionId, 'pending'))
			const status = await fetchKeysAndVerify(action)
			setStatuses((prev) => new Map(prev).set(action.actionId, status))
		},
		[fetchKeysAndVerify]
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
		<Dialog
			open
			dismissable
			title={t('Reactions')}
			onClose={onClose}
			className="c-engagement-dialog"
		>
			<Tabs value={activeTab} onTabChange={setActiveTab} className="mb-2 c-engagement-tabs">
				<Tab value="all">
					{t('All')} {reactions.length > 0 && <small>{reactions.length}</small>}
				</Tab>
				{reactionGroups.map((g) => (
					<Tab key={g.key} value={g.key} title={getReactionLabel(t, g.key)}>
						{getReactionEmoji(g.key)} <small>{g.actions.length}</small>
					</Tab>
				))}
				<Tab value="reposts">
					{t('Reposts')} {reposts.length > 0 && <small>{reposts.length}</small>}
				</Tab>
			</Tabs>

			<div className="c-engagement-list overflow-y-auto">
				{loading ? (
					<SkeletonList count={5} />
				) : error ? (
					<EmptyState
						title={t('Could not load')}
						description={error.message}
						action={
							<Button variant="primary" onClick={reload}>
								{t('Retry')}
							</Button>
						}
					/>
				) : rows.length === 0 ? (
					<EmptyState
						icon={<IcEmpty />}
						title={
							activeTab === 'reposts' ? t('No reposts yet') : t('No reactions yet')
						}
					/>
				) : (
					rows.map((action) => (
						<EngagementRow
							key={action.actionId}
							action={action}
							audienceTag={audienceTag}
							status={statuses.get(action.actionId) ?? 'unavailable'}
							emoji={showEmoji ? getReactionEmoji(action.subType ?? '') : undefined}
							onVerify={onVerify}
							onClose={onClose}
						/>
					))
				)}
			</div>
		</Dialog>
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
	const urlContext = useUrlContextIdTag()
	const issuer = action.issuer
	const picUrl =
		auth && issuer.profilePic
			? getFileUrl(audienceTag || auth.idTag || '', issuer.profilePic, 'vis.pf')
			: undefined

	return (
		<div className="c-engagement-row c-hbox align-items-center g-2">
			<Link
				to={`/profile/${urlContext || HOME_CONTEXT}/${issuer.idTag}`}
				className="c-hbox align-items-center g-2 flex-fill text-decoration-none"
				onClick={onClose}
			>
				{picUrl ? (
					<img className="c-engagement-avatar" src={picUrl} alt="" />
				) : (
					<div
						className="c-engagement-avatar c-engagement-avatar--empty"
						aria-hidden="true"
					>
						{(issuer.name || issuer.idTag).slice(0, 1).toUpperCase()}
					</div>
				)}
				<div className="c-vbox flex-fill" style={{ minWidth: 0 }}>
					<span className="c-engagement-name">{issuer.name || issuer.idTag}</span>
					<small className="c-engagement-tag text-muted">@{issuer.idTag}</small>
				</div>
			</Link>
			{emoji && (
				<span className="c-engagement-emoji" aria-hidden="true">
					{emoji}
				</span>
			)}
			<VerifyBadge status={status} onVerify={() => onVerify(action)} />
		</div>
	)
}

function VerifyBadge({ status, onVerify }: { status: RowStatus; onVerify: () => void }) {
	const { t } = useTranslation()

	switch (status) {
		case 'pending':
			return (
				<span className="c-engagement-status" title={t('Checking signature…')}>
					<LoadingSpinner size="xs" />
				</span>
			)
		case 'verified':
			return (
				<span
					className="c-engagement-status text-success c-hbox align-items-center g-1"
					title={t('Signature verified')}
				>
					<IcVerified />
				</span>
			)
		case 'invalid':
			return (
				<span className="c-engagement-status c-engagement-status--invalid text-danger c-hbox align-items-center g-1">
					<IcInvalid />
					<small>{t('Invalid signature')}</small>
				</span>
			)
		case 'no-key':
			return (
				<span
					className="c-engagement-status text-muted c-hbox align-items-center g-1"
					title={t('No matching key published')}
				>
					<IcNoKey />
				</span>
			)
		case 'unavailable':
			return (
				<span className="c-engagement-status text-muted" title={t('Signature unavailable')}>
					<IcUnavailable />
				</span>
			)
		default:
			// 'unchecked' or 'error' — offer an explicit Verify action.
			return (
				<Button
					size="small"
					variant="secondary"
					className="c-engagement-verify-btn"
					onClick={onVerify}
				>
					{t('Verify')}
				</Button>
			)
	}
}

// vim: ts=4
