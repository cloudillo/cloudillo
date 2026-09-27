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

import { Alert, Button, useToast } from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuShield as IcShield } from 'react-icons/lu'

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
		<Alert
			color="info"
			className="m-2"
			role="status"
			icon={<IcShield />}
			title={t('Authenticate to {{idTag}}?', { idTag })}
			actions={
				<>
					<Button size="sm" color="primary" onClick={handleSession} disabled={busy}>
						{t('This session')}
					</Button>
					<Button size="sm" color="secondary" onClick={handleAlways} disabled={busy}>
						{t('Always')}
					</Button>
					<Button size="sm" color="warning" onClick={handleNever} disabled={busy}>
						{t('Never')}
					</Button>
					<Button size="sm" variant="ghost" onClick={handleAnonymous} disabled={busy}>
						{t('Continue anonymously')}
					</Button>
				</>
			}
		>
			{t(
				'You are browsing anonymously. Authenticating lets them see you viewed them and unlocks content restricted to known viewers.'
			)}
		</Alert>
	)
}

// vim: ts=4
