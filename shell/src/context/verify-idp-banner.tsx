// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { useAtom } from 'jotai'
import { useTranslation } from 'react-i18next'

import { LuCircleAlert as IcWarning, LuRefreshCw as IcLoading } from 'react-icons/lu'
import type { TFunction } from 'i18next'
import { Button } from '@cloudillo/react'
import { FetchError } from '@cloudillo/core'

import { activeContextAtom, contextOnboardingAtom } from './atoms'
import { useApiContext } from './hooks'

const POLL_INTERVAL_MS = 60_000
const RESEND_COOLDOWN_MS = 60_000

function formatRemaining(t: TFunction, expiresAt: string): string {
	const ms = new Date(expiresAt).getTime() - Date.now()
	if (ms <= 0) return t('expired')
	const totalMinutes = Math.floor(ms / 60_000)
	const hours = Math.floor(totalMinutes / 60)
	const minutes = totalMinutes % 60
	if (hours > 0) {
		return t('{{hours}}h {{minutes}}m', { hours, minutes })
	}
	return t('{{minutes}}m', { minutes })
}

/**
 * Persistent banner shown across the chrome of a community context whose
 * `ui.onboarding === 'verify-idp'` — i.e. its IDP identity is still in Pending
 * state. Surfaces the auto-deletion deadline and a one-click resend, and polls
 * the IDP status so the banner disappears the moment the activation email is
 * clicked. Renders nothing in any other case (own context, domain-typed
 * community, already-active community).
 */
export function CommunityVerifyIdpBanner() {
	const { t } = useTranslation()
	const [activeContext] = useAtom(activeContextAtom)
	const [contextOnboarding, setContextOnboarding] = useAtom(contextOnboardingAtom)
	const { getClientFor } = useApiContext()

	const [expiresAt, setExpiresAt] = React.useState<string | undefined>()
	const [resendState, setResendState] = React.useState<
		'idle' | 'sending' | 'cooldown' | 'expired'
	>('idle')
	const [, forceTick] = React.useReducer((n: number) => n + 1, 0)
	const cooldownTimerRef = React.useRef<number | undefined>(undefined)

	const idTag = activeContext?.type === 'community' ? activeContext.idTag : undefined
	const isLeader = activeContext?.roles?.includes('leader') ?? false
	const onboarding = idTag ? contextOnboarding[idTag] : undefined
	const visible = isLeader && onboarding === 'verify-idp'

	// 1s ticker for the countdown.
	React.useEffect(() => {
		if (!visible) return
		const id = window.setInterval(forceTick, 1_000)
		return () => window.clearInterval(id)
	}, [visible])

	React.useEffect(() => {
		return () => {
			if (cooldownTimerRef.current !== undefined) {
				window.clearTimeout(cooldownTimerRef.current)
			}
		}
	}, [])

	// Poll idp-status while the banner is up. When status flips to 'active',
	// the backend has already cleared this community's ui.onboarding — reflect
	// that locally so the banner unmounts on next render.
	React.useEffect(() => {
		if (!visible || !idTag) return
		const contextApi = getClientFor(idTag, { auth: 'required' })
		if (!contextApi) return
		let cancelled = false
		const tick = async () => {
			try {
				const res = await contextApi.profile.idpStatus()
				if (cancelled) return
				if (res.expiresAt) setExpiresAt(res.expiresAt)
				if (res.status === 'active') {
					setContextOnboarding((prev) => ({
						...prev,
						[idTag]: res.onboarding ?? null
					}))
				}
			} catch (err) {
				console.warn('community idp-status poll failed:', err)
			}
		}
		tick()
		const intervalId = window.setInterval(tick, POLL_INTERVAL_MS)
		return () => {
			cancelled = true
			window.clearInterval(intervalId)
		}
	}, [visible, idTag, getClientFor, setContextOnboarding])

	if (!visible || !idTag) return null

	async function onResend() {
		if (!idTag || resendState !== 'idle') return
		const contextApi = getClientFor(idTag, { auth: 'required' })
		if (!contextApi) return
		setResendState('sending')
		try {
			const res = await contextApi.profile.resendActivation()
			setExpiresAt(res.expiresAt)
			setResendState('cooldown')
			if (cooldownTimerRef.current !== undefined) {
				window.clearTimeout(cooldownTimerRef.current)
			}
			cooldownTimerRef.current = window.setTimeout(() => {
				cooldownTimerRef.current = undefined
				setResendState((s) => (s === 'cooldown' ? 'idle' : s))
			}, RESEND_COOLDOWN_MS)
		} catch (err: unknown) {
			// IDP returns 410 Gone when Identity.expires_at has already passed.
			if (err instanceof FetchError && err.httpStatus === 410) {
				setResendState('expired')
			} else {
				setResendState('idle')
				console.warn('community activation resend failed:', err)
			}
		}
	}

	const expired =
		resendState === 'expired' || (expiresAt && new Date(expiresAt).getTime() <= Date.now())

	return (
		<div className="c-panel warning d-flex align-items-center g-3 m-2 p-3" role="alert">
			<IcWarning className="flex-shrink-0" size={24} />
			<div className="flex-fill">
				{expired ? (
					<>
						<strong>{t("This community's identity has expired")}</strong>
						<div className="text-muted small">
							{t(
								"It was not activated in time and will not accept new content. Members can still view what's already here."
							)}
						</div>
					</>
				) : (
					<>
						<strong>
							{expiresAt
								? t(
										"This community's identity will be deleted in {{remaining}} if not activated",
										{ remaining: formatRemaining(t, expiresAt) }
									)
								: t("This community's identity has not been activated yet")}
						</strong>
						<div className="text-muted small">
							{t(
								"An activation email was sent. Until it's confirmed, content posted here may be lost. The deadline doesn't change if you resend."
							)}
						</div>
					</>
				)}
			</div>
			<Button
				className="primary"
				onClick={onResend}
				disabled={Boolean(expired) || resendState !== 'idle'}
			>
				{resendState === 'sending' && <IcLoading className="animate-rotate-cw me-2" />}
				{resendState === 'cooldown' ? t('Email sent') : t('Resend activation')}
			</Button>
		</div>
	)
}

/**
 * Hook companion: returns whether content-creation should be disabled in the
 * current context because the community's IDP identity is still pending.
 *
 * Consumers (post composer, file upload buttons, etc.) should treat the
 * returned value as a soft block — the backend doesn't enforce it (per the
 * project decision to keep the gate frontend-only) but the user has just
 * passed their personal onboarding gate, so no determined adversary is
 * involved here. The intent is to stop the user from accumulating content
 * that vanishes when the IDP auto-deletes the unactivated identity.
 */
export function useCommunityContentGate(): boolean {
	const [activeContext] = useAtom(activeContextAtom)
	const [contextOnboarding] = useAtom(contextOnboardingAtom)
	if (activeContext?.type !== 'community') return false
	return contextOnboarding[activeContext.idTag] === 'verify-idp'
}

// vim: ts=4
