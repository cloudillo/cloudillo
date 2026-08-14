// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type * as Types from '@cloudillo/core'
import type { ApiClient } from '@cloudillo/core'
import { Button, ProfilePicture, useApi, useAuth, useToast } from '@cloudillo/react'
import type { ProfileInfo } from '@cloudillo/types'
import { browserSupportsWebAuthn } from '@simplewebauthn/browser'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, Outlet, Route, useLocation, useNavigate, useParams } from 'react-router-dom'

import { DEFAULT_COMMUNITY_ID_TAG } from '../context/constants.js'
import { useCommunitiesList } from '../context/index.js'
import { useNotifications } from '../notifications/state.js'
import type { UsePWA } from '../pwa.js'
import { feedPath, HOME_BASE } from '../routes.js'
import { subscribeNotifications } from '../settings/notifications.js'
import { registerPasskey } from '../settings/passkey.js'
import { useOnboardingDraft } from './draft.js'
import { VerifyIdp } from './verify-idp.js'
import { Welcome } from './welcome.js'

// Forward navigation only records the resume gate (`ui.onboarding`) so a full
// reload returns to the right step. Nothing is committed here — the reversible
// wizard defers every side effect to the Extras Finish handler, which also
// clears the gate.
// Build the path for a step, preserving the refId prefix when present so it
// survives reload. refId-less (gate-redirect) callers fall back to the bare
// shape.
function stepPath(refId: string | undefined, step: string) {
	return refId ? `/onboarding/${refId}/${step}` : `/onboarding/${step}`
}

function next(api: ApiClient | null, refId: string | undefined, location: string) {
	const nextPage = location == 'invites' ? 'extras' : null

	if (api) {
		api.settings.update('ui.onboarding', { value: nextPage })
	}
	// Onboarding always finishes at home — the wizard runs on the user's own tenant.
	return nextPage ? stepPath(refId, nextPage) : feedPath(HOME_BASE)
}

/**
 * The community a pending invite grants access to, or undefined when it grants none.
 *
 * INVT covers two unrelated things: a community invite, whose `subject` is
 * "@<community_id_tag>", and a group-chat invite, whose `subject` is a CONV action id (see
 * `tInvtAction` in @cloudillo/types, and CreateGroupDialog). Only the first names a community,
 * so require the "@" or an explicit community `subjectProfile` — a raw action id must never
 * reach `ui.pinned_communities`, where nothing renders it and so nothing can unpin it.
 *
 * CONN names one only when addressed to a community audience; a person-to-person connection
 * has nothing to add to the sidebar.
 */
function communityInviteTarget(a: Types.ActionView): ProfileInfo | undefined {
	if (a.type === 'INVT') {
		if (a.subjectProfile?.type === 'community') return a.subjectProfile
		if (a.subject?.startsWith('@')) return a.subjectProfile ?? { idTag: a.subject.slice(1) }
		return undefined
	}
	if (a.audience?.type === 'community' && a.audience.idTag) return a.audience
	return undefined
}

// Invites step — presents the operator's auto-connect (CONN) and auto-join
// community invitations (INVT) as default-ON, opt-out toggles held in the
// shared draft, plus a pre-selected "Join the Cloudillo community" card folded
// in at the bottom (suppressed when the inviter already invited the user to the
// default community). Nothing is accepted here; acceptance happens at Finish.
// The page always has content, so it never auto-advances.
function Invites() {
	const { t } = useTranslation()
	const navigate = useNavigate()
	const { api } = useApi()
	const [auth] = useAuth()
	const { refId } = useParams<{ refId?: string }>()
	const [draft, setDraft] = useOnboardingDraft()
	const [loading, setLoading] = React.useState(true)
	const [conns, setConns] = React.useState<Types.ActionView[]>([])
	const [invts, setInvts] = React.useState<Types.ActionView[]>([])
	// True when an invite already covers the default community, so we suppress
	// the folded-in Cloudillo card to avoid offering it twice.
	const [alreadyInvited, setAlreadyInvited] = React.useState(false)

	React.useEffect(
		function loadInvites() {
			if (!api) return
			let cancelled = false
			;(async function () {
				try {
					const [connList, invtList] = await Promise.all([
						api.actions.list({ type: 'CONN', status: ['C'] }),
						api.actions.list({ type: 'INVT', status: ['C'] })
					])
					if (cancelled) return
					// Backend default-scopes to this tenant; additionally drop
					// anything the user issued themselves so only genuine inbound
					// invitations are shown.
					const self = auth?.idTag
					const c = (Array.isArray(connList) ? connList : []).filter(
						(a) => a.issuer.idTag !== self
					)
					const i = (Array.isArray(invtList) ? invtList : [])
						.filter((a) => a.issuer.idTag !== self)
						// Group-chat invites ride the same action type (see
						// communityInviteTarget). The wizard is about communities, so they
						// are ignored here entirely — not shown, not accepted, not pinned.
						// They stay pending server-side and surface in the notification
						// inbox afterwards.
						.filter((a) => !!communityInviteTarget(a))
					// Does an existing invite already cover the default community?
					// If so, suppress the folded-in Cloudillo card below.
					const inviteHasDefault =
						i.some(
							(a) => communityInviteTarget(a)?.idTag === DEFAULT_COMMUNITY_ID_TAG
						) || c.some((a) => a.audience?.idTag === DEFAULT_COMMUNITY_ID_TAG)
					setAlreadyInvited(inviteHasDefault)
					setConns(c)
					setInvts(i)
					// Default every invite ON, but preserve prior toggles when
					// the user returns to this step via Back. Seed the join
					// default-ON when we'll show the Cloudillo card; force it off
					// when the inviter already covered the default community.
					setDraft((d) => {
						const merged = { ...d.invitesChecked }
						// Merged, so a Back-navigation re-run keeps earlier entries.
						const communities = { ...d.inviteCommunities }
						for (const a of [...c, ...i]) {
							if (merged[a.actionId] === undefined) merged[a.actionId] = true
						}
						// Only invites that name a community pin anything.
						for (const a of [...c, ...i]) {
							const target = communityInviteTarget(a)
							if (target?.idTag) communities[a.actionId] = target.idTag
						}
						return {
							...d,
							invitesChecked: merged,
							inviteCommunities: communities,
							join: inviteHasDefault ? false : d.join === undefined ? true : d.join
						}
					})
					setLoading(false)
				} catch (err) {
					console.error('Failed to load onboarding invites:', err)
					if (!cancelled) {
						navigate(next(api, refId, 'invites'), { replace: true })
					}
				}
			})()
			return () => {
				cancelled = true
			}
		},
		[api, navigate, setDraft, refId, auth?.idTag]
	)

	function toggle(actionId: string) {
		setDraft((d) => ({
			...d,
			invitesChecked: { ...d.invitesChecked, [actionId]: !d.invitesChecked[actionId] }
		}))
	}

	function onContinue() {
		navigate(next(api, refId, 'invites'))
	}

	// Skip = decline everything: clear the toggles and the Cloudillo card so
	// Finish accepts nothing.
	function onSkip() {
		setDraft((d) => {
			const cleared = { ...d.invitesChecked }
			for (const a of [...conns, ...invts]) cleared[a.actionId] = false
			// Both halves of the same keyed state, cleared together so they cannot drift.
			// A later Back re-seeds the record from the loader while `invitesChecked`
			// stays false, so nothing is pinned either way.
			return { ...d, invitesChecked: cleared, inviteCommunities: {}, join: false }
		})
		navigate(next(api, refId, 'invites'))
	}

	if (loading) {
		return (
			<div className="c-panel p-4">
				<h1 className="mb-3">{t("You're in!")}</h1>
				<p className="text-muted">{t('Loading…')}</p>
			</div>
		)
	}

	return (
		<div className="c-panel p-4">
			<h1 className="mb-3">{t("You're in!")}</h1>
			<p className="mb-3 text-muted">
				{conns.length || invts.length
					? t('Someone invited you. Choose what to accept — you can change this later.')
					: t('Get started by joining the Cloudillo community.')}
			</p>

			{conns.length > 0 && (
				<>
					<h3 className="mb-1">{t('People')}</h3>
					<p className="text-muted small mb-2">
						{t('These people want to connect with you.')}
					</p>
					<div className="c-panel my-3">
						{conns.map((a) => (
							<label
								key={a.actionId}
								className="c-settings-field"
								style={{ maxWidth: 'none' }}
							>
								<span className="c-hbox align-items-center g-2 flex-fill">
									<ProfilePicture
										profile={a.issuer}
										srcTag={a.issuer.idTag}
										small
									/>
									<span className="flex-fill">
										{t('Connect with {{name}}', {
											name: a.issuer.name || a.issuer.idTag
										})}
										<br />
										<span className="text-muted small">{a.issuer.idTag}</span>
									</span>
								</span>
								<input
									className="c-toggle primary"
									type="checkbox"
									checked={!!draft.invitesChecked[a.actionId]}
									onChange={() => toggle(a.actionId)}
								/>
							</label>
						))}
					</div>
				</>
			)}

			{invts.length > 0 && (
				<>
					<h3 className="mb-1">{t('Communities')}</h3>
					<p className="text-muted small mb-2">
						{t("You've been invited to join these communities.")}
					</p>
					<div className="c-panel my-3">
						{invts.map((a) => {
							// The loader dropped every invite that names no community.
							const target = communityInviteTarget(a)
							if (!target) return null
							return (
								<label
									key={a.actionId}
									className="c-settings-field"
									style={{ maxWidth: 'none' }}
								>
									<span className="c-hbox align-items-center g-2 flex-fill">
										<ProfilePicture
											profile={target}
											srcTag={target.idTag}
											small
										/>
										<span className="flex-fill">
											{t('Join {{name}}', {
												name: target.name || target.idTag
											})}
											<br />
											<span className="text-muted small">{target.idTag}</span>
										</span>
									</span>
									<input
										className="c-toggle primary"
										type="checkbox"
										checked={!!draft.invitesChecked[a.actionId]}
										onChange={() => toggle(a.actionId)}
									/>
								</label>
							)
						})}
					</div>
				</>
			)}

			{!alreadyInvited && (
				<div className="c-panel primary my-3 p-3">
					<h3 className="mb-2">🌐 {t('Join the Cloudillo community')}</h3>
					<p className="text-muted small mb-3">
						{t(
							'Connect with other Cloudillo users, get help, and stay updated on new features.'
						)}
					</p>
					<label className="c-settings-field" style={{ maxWidth: 'none' }}>
						<span className="c-hbox align-items-center g-2 flex-fill">
							<ProfilePicture profile={{}} srcTag={DEFAULT_COMMUNITY_ID_TAG} small />
							<span className="flex-fill">
								{t('Cloudillo community')}
								<br />
								<span className="text-muted small">{DEFAULT_COMMUNITY_ID_TAG}</span>
							</span>
						</span>
						<input
							className="c-toggle primary"
							type="checkbox"
							checked={!!draft.join}
							onChange={(e) => setDraft((d) => ({ ...d, join: e.target.checked }))}
						/>
					</label>
				</div>
			)}

			{/* First reversible step — going back would land on the password
			    screen, so no Back button here. */}
			<div className="c-group g-2">
				<Button className="c-button primary" onClick={onContinue}>
					{t('Continue')}
				</Button>
				<Button className="c-button" onClick={onSkip}>
					{t('Skip')}
				</Button>
			</div>
		</div>
	)
}

// Combined convenience options (notifications + install + passkey). This is the
// wizard's single commit point: the Finish handler applies every deferred
// choice (accept invites, join CONN, notifications, install, passkey), consumes
// the welcome ref, and clears the resume gate. Each step is warn-and-continue
// so one failure never blocks reaching the feed.
function Extras({ pwa }: { pwa: UsePWA }) {
	const { t } = useTranslation()
	const navigate = useNavigate()
	const { api } = useApi()
	const { error: toastError } = useToast()
	const { loadNotifications } = useNotifications()
	const { loadCommunities, pinCommunities } = useCommunitiesList()
	const { refId } = useParams<{ refId?: string }>()
	const [draft, setDraft] = useOnboardingDraft()
	const [finishing, setFinishing] = React.useState(false)
	const [passkeySupported] = React.useState(() => browserSupportsWebAuthn())
	const finishedRef = React.useRef(false)

	const canNotify = pwa.askNotify
	const canInstall = pwa.doInstall
	const canPasskey = passkeySupported
	const nothingToShow = !canNotify && !canInstall && !canPasskey

	async function finish() {
		if (finishedRef.current) return
		finishedRef.current = true
		setFinishing(true)

		// 1. Accept the invites the user kept checked.
		const toAccept = Object.entries(draft.invitesChecked)
			.filter(([, v]) => v)
			.map(([id]) => id)
		// Only what actually succeeded may be pinned, so track outcomes rather than
		// intentions. `api?.` would resolve to undefined without throwing, counting a
		// missing client as a success and skipping the toast — hence the explicit throw.
		const accepted: string[] = []
		for (const actionId of toAccept) {
			try {
				if (!api) throw new Error('API client unavailable')
				await api.actions.accept(actionId)
				accepted.push(actionId)
			} catch (err) {
				console.error('Failed to accept action', actionId, err)
				toastError(
					t('Some invitations could not be accepted. You can retry in your inbox.')
				)
			}
		}

		// 2. Join the Cloudillo community (CONN to the default community).
		let joined = false
		if (draft.join) {
			try {
				if (!api) throw new Error('API client unavailable')
				await api.actions.create({
					type: 'CONN',
					audienceTag: DEFAULT_COMMUNITY_ID_TAG
				})
				joined = true
			} catch (err) {
				console.error('Failed to join community:', err)
				toastError(t('Failed to join community. You can try again later in Settings.'))
			}
		}

		// 2b. Pin the joined communities. loadCommunities() first: favoriteCommunitiesAtom
		// drops pinned idTags missing from communitiesAtom, last loaded before the accepts.
		const pinTags = [
			...accepted
				.map((id) => draft.inviteCommunities[id])
				.filter((tag): tag is string => !!tag),
			...(joined ? [DEFAULT_COMMUNITY_ID_TAG] : [])
		]
		if (pinTags.length) {
			try {
				await loadCommunities()
				pinCommunities(pinTags)
			} catch (err) {
				console.warn('Failed to pin joined communities:', err)
			}
		}

		// 3. Convenience options.
		if (draft.enableNotifications && canNotify) {
			try {
				await subscribeNotifications(api, pwa)
			} catch (err) {
				console.error('Failed to enable notifications:', err)
			}
		}
		if (draft.enableInstall && canInstall) {
			try {
				pwa.doInstall?.()
			} catch (err) {
				console.error('Failed to install app:', err)
			}
		}
		if (draft.enablePasskey && canPasskey && api) {
			try {
				await registerPasskey(api)
			} catch (err) {
				// NotAllowedError = user cancelled the OS prompt; skip silently.
				console.error('Failed to register passkey:', err)
				if (err instanceof Error && err.name !== 'NotAllowedError') {
					toastError(t('Could not set up a passkey. You can add one later in Settings.'))
				}
			}
		}

		// 4. Commit: consume the welcome ref and clear the resume gate.
		if (api) {
			if (refId) {
				try {
					await api.onboarding.complete({ refId })
				} catch (err) {
					console.warn('Failed to complete onboarding (welcome ref):', err)
				}
			}
			try {
				await api.settings.update('ui.onboarding', { value: null })
			} catch (err) {
				console.warn('Failed to clear onboarding gate:', err)
			}
		}

		// 5. Refresh the notification bell from server state now that the gate is
		// cleared. The invites handled in the wizard (accepted ones are gone
		// server-side) were suppressed during onboarding; this loads the true
		// post-onboarding state so the bell never flashes stale, already-handled
		// invitations on the way to the feed.
		try {
			await loadNotifications()
		} catch (err) {
			console.warn('Failed to refresh notifications after onboarding:', err)
		}

		// 6. Done.
		navigate(feedPath(HOME_BASE))
	}

	function onBack() {
		navigate(stepPath(refId, 'invites'))
	}

	const [capabilitiesSettled, setCapabilitiesSettled] = React.useState(false)

	// pwa.doInstall only appears after the async `beforeinstallprompt` event, so
	// `nothingToShow` is not trustworthy on the first render. Give the install
	// prompt a moment to arrive before auto-committing and dropping to the feed.
	React.useEffect(() => {
		const id = setTimeout(() => setCapabilitiesSettled(true), 1500)
		return () => clearTimeout(id)
	}, [])

	// Nothing to offer on this device → still run the single commit (invites,
	// join, ref consume) once, then drop to the feed. finish() is idempotent via
	// finishedRef; deps intentionally omitted.
	React.useEffect(() => {
		if (capabilitiesSettled && nothingToShow) finish()
	}, [capabilitiesSettled, nothingToShow])

	if (nothingToShow) {
		return (
			<div className="c-panel p-4">
				<h1 className="mb-3">{t("You're all set!")}</h1>
				<p className="text-muted">{t('Loading…')}</p>
			</div>
		)
	}

	return (
		<div className="c-panel p-4">
			<h3 className="mb-3">
				{t('A couple more things')} <span className="text-muted">({t('optional')})</span>
			</h3>

			<div className="c-panel my-4">
				{canNotify && (
					<label className="c-settings-field" style={{ maxWidth: 'none' }}>
						<span>
							{t('Enable notifications')}
							<br />
							<span className="text-muted small">
								{t('Know when someone messages you')}
							</span>
						</span>
						<input
							className="c-toggle primary"
							type="checkbox"
							checked={draft.enableNotifications}
							onChange={(e) =>
								setDraft((d) => ({ ...d, enableNotifications: e.target.checked }))
							}
						/>
					</label>
				)}

				{canInstall && (
					<label className="c-settings-field" style={{ maxWidth: 'none' }}>
						<span>
							{t('Add to home screen')}
							<br />
							<span className="text-muted small">
								{t('Quick access on your phone')}
							</span>
						</span>
						<input
							className="c-toggle primary"
							type="checkbox"
							checked={draft.enableInstall}
							onChange={(e) =>
								setDraft((d) => ({ ...d, enableInstall: e.target.checked }))
							}
						/>
					</label>
				)}

				{canPasskey && (
					<label className="c-settings-field" style={{ maxWidth: 'none' }}>
						<span>
							{t('Set up a passkey')}
							<br />
							<span className="text-muted small">
								{t('Sign in without a password next time')}
							</span>
						</span>
						<input
							className="c-toggle primary"
							type="checkbox"
							checked={draft.enablePasskey}
							onChange={(e) =>
								setDraft((d) => ({ ...d, enablePasskey: e.target.checked }))
							}
						/>
					</label>
				)}
			</div>

			<div className="c-group g-2">
				<Button className="c-button" onClick={onBack} disabled={finishing}>
					{t('Back')}
				</Button>
				<Button className="c-button primary" onClick={finish} disabled={finishing}>
					{t('Finish')}
				</Button>
			</div>
		</div>
	)
}

// Legacy routes for backwards compatibility
function Notifications({ pwa: _pwa }: { pwa: UsePWA }) {
	return <Navigate to="/onboarding/extras" />
}

function Install({ pwa: _pwa }: { pwa: UsePWA }) {
	return <Navigate to="/onboarding/extras" />
}

// Note: 'verify-idp' is intentionally excluded from the step indicator. It only
// appears for IDP-typed registrations, runs before the user has set a password,
// and we don't want it to inflate the visible "step X of Y" count for the
// password → invites → extras journey shown to every user. The invites step is
// always present now (it always has content — at minimum the Cloudillo card).
const STEPS = ['welcome', 'invites', 'extras'] as const

// Map an onboarding pathname → step index. verify-idp is intentionally
// excluded from the indicator (returns -1 → indicator hidden). Anything that
// isn't a known trailing step is the welcome page (/onboarding/:refId or legacy
// /onboarding/welcome/:refId) → step 0.
function stepIndexFromPath(pathname: string): number {
	if (/\/extras\/?$/.test(pathname)) return 2
	if (/\/invites\/?$/.test(pathname)) return 1
	if (/\/verify-idp\/?$/.test(pathname)) return -1
	return 0
}

function StepIndicator() {
	const { t } = useTranslation()
	const location = useLocation()

	const currentStep = stepIndexFromPath(location.pathname)
	if (currentStep < 0) return null

	return (
		<div className="c-hbox justify-content-center g-2 mb-3 mt-2">
			{STEPS.map((step, i) => (
				<div
					key={step}
					style={{
						width: '0.625rem',
						height: '0.625rem',
						borderRadius: '50%',
						background: i <= currentStep ? 'var(--col-primary)' : 'var(--col-outline)'
					}}
				/>
			))}
			<span className="text-muted small ms-2">
				{t('Step {{current}} of {{total}}', {
					current: currentStep + 1,
					total: STEPS.length
				})}
			</span>
		</div>
	)
}

/**
 * The wizard chrome, as the `/onboarding` layout route. A layout route rather than a
 * wrapper around a `<Routes>` tree, which is what keeps `StepIndicator` mounted across
 * steps instead of remounting on every navigation.
 */
function Page() {
	return (
		<div className="c-container">
			<div className="row">
				<div className="col-0 col-md-1 col-lg-2" />
				<div className="col col-md-10 col-lg-8">
					<StepIndicator />
					<div className="flex-fill-x">
						<Outlet />
					</div>
				</div>
				<div className="col-0 col-md-1 col-lg-2" />
			</div>
		</div>
	)
}

/**
 * The `/onboarding/…` branch. Context-free and top-level: the backend mails
 * `/onboarding/{ref}` links, and the shape is pinned by the SPA fallback allowlist in
 * `cloudillo-rs/crates/cloudillo/src/routes/static_files.rs`.
 *
 * A plain function, not a component — see `layout.tsx` for why.
 */
export function onboardingRoutes(pwa: UsePWA) {
	return (
		<Route path="onboarding" element={<Page />}>
			{/* refId-scoped steps (refId rides in the URL and survives reload) */}
			<Route path=":refId/verify-idp" element={<VerifyIdp />} />
			<Route path=":refId/invites" element={<Invites />} />
			<Route path=":refId/extras" element={<Extras pwa={pwa} />} />
			{/* refId-less fallbacks for gate/IDP redirects (returning users) */}
			<Route path="verify-idp" element={<VerifyIdp />} />
			<Route path="invites" element={<Invites />} />
			<Route path="extras" element={<Extras pwa={pwa} />} />
			{/* Legacy step routes (static paths; React Router ranks these by
			    specificity over the bare :refId welcome regardless of order) */}
			<Route path="notifications" element={<Notifications pwa={pwa} />} />
			<Route path="install" element={<Install pwa={pwa} />} />
			{/* Legacy welcome-email shape */}
			<Route path="welcome/:refId" element={<Welcome />} />
			{/* Welcome (new email shape): bare /onboarding/:refId. React Router
			    matches by specificity, so the static paths above always win
			    their exact paths; order here is for readability only. */}
			<Route path=":refId" element={<Welcome />} />
		</Route>
	)
}

// vim: ts=4
