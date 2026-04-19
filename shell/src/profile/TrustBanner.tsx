// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Inline banner surfaced on the profile page when a passive read would otherwise
 * leak the user's identity to a foreign profile.
 *
 * Shown when the effective trust for the profile is `null` — i.e. the user has
 * not yet recorded a session ('S'/'X') or stored ('always'/'never') decision.
 * Offers the four trust choices: session, always, never, continue anonymously.
 *
 * Picking anything persists the decision (or session flag) via
 * `useProfileTrust()`, which causes this banner to hide on the next render.
 */

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuShield as IcShield } from 'react-icons/lu'

import { useToast } from '@cloudillo/react'

import { useProfileTrust } from '../context/index.js'

interface TrustBannerProps {
	idTag: string
	/**
	 * Fired after any decision. Callers typically refetch so the new auth
	 * state is reflected immediately — both unlocks (now authenticated) and
	 * locks (must drop any previously-rendered private content).
	 */
	onDecision?: () => void
}

export function TrustBanner({ idTag, onDecision }: TrustBannerProps): React.ReactElement | null {
	const { t } = useTranslation()
	const { getEffectiveTrust, setSessionTrust, setStoredTrust } = useProfileTrust()
	const { error: toastError } = useToast()
	const [busy, setBusy] = React.useState(false)

	if (getEffectiveTrust(idTag) !== null) {
		return null
	}

	const handleSession = () => {
		setSessionTrust(idTag, 'S')
		onDecision?.()
	}

	const handleAlways = async () => {
		setBusy(true)
		try {
			await setStoredTrust(idTag, 'always')
			onDecision?.()
		} catch (err) {
			console.error('Failed to persist Always trust:', err)
			toastError(t('Failed to update trust preference'))
		} finally {
			setBusy(false)
		}
	}

	const handleNever = async () => {
		setBusy(true)
		try {
			await setStoredTrust(idTag, 'never')
			onDecision?.()
		} catch (err) {
			console.error('Failed to persist Never trust:', err)
			toastError(t('Failed to update trust preference'))
		} finally {
			setBusy(false)
		}
	}

	const handleAnonymous = () => {
		setSessionTrust(idTag, 'X')
		onDecision?.()
	}

	return (
		<div className="c-alert info m-2" role="status">
			<div className="c-alert-icon">
				<IcShield />
			</div>
			<div className="c-alert-content">
				<h3 className="c-alert-title">{t('Authenticate to {{idTag}}?', { idTag })}</h3>
				<div className="c-alert-message">
					{t(
						'You are browsing anonymously. Authenticating lets them see you viewed them and unlocks content restricted to known viewers.'
					)}
				</div>
				<div className="c-alert-actions">
					<button
						type="button"
						className="c-button primary small"
						onClick={handleSession}
						disabled={busy}
					>
						{t('This session')}
					</button>
					<button
						type="button"
						className="c-button secondary small"
						onClick={handleAlways}
						disabled={busy}
					>
						{t('Always')}
					</button>
					<button
						type="button"
						className="c-button warning small"
						onClick={handleNever}
						disabled={busy}
					>
						{t('Never')}
					</button>
					<button
						type="button"
						className="c-button link small"
						onClick={handleAnonymous}
						disabled={busy}
					>
						{t('Continue anonymously')}
					</button>
				</div>
			</div>
		</div>
	)
}

// vim: ts=4
