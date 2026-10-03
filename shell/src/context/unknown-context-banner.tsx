// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { Alert, Button } from '@cloudillo/react'
import { useAtom } from 'jotai'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuCircleAlert as IcWarning } from 'react-icons/lu'
import { useNavigate } from 'react-router-dom'

import { feedPath, HOME_BASE } from '../routes.js'
import { pendingContextAtom } from './atoms'
import { useHatEntry } from './hat-entry.js'

/**
 * The confirm step for a context the *URL* named and the user never chose.
 *
 * `CtxProvider` refuses to switch into an idTag that is neither the user's own node, nor
 * a community they are in, nor one they have already consented to — `setActiveContext`
 * would mint an identified proxy token, so `https://alice.example/@attacker.tld` would
 * otherwise be enough to announce the user to a stranger's server. It parks the idTag in
 * `pendingContextAtom` instead, and this is what asks. Renders nothing in every other case.
 */
export function UnknownContextBanner() {
	const { t } = useTranslation()
	const [pending, setPending] = useAtom(pendingContextAtom)
	const { enter } = useHatEntry()
	const navigate = useNavigate()
	const [busy, setBusy] = React.useState(false)

	if (!pending) return null

	async function onContinue() {
		if (!pending) return
		setBusy(true)
		try {
			// Pressing this button *is* the user action the trust gate was waiting for; the
			// hat resolves as on any plain entry (remembered hats, or the picker).
			await enter(pending)
			setPending(undefined)
		} catch (err) {
			console.error(`[Context] Failed to open ${pending}:`, err)
			setPending(undefined)
			navigate(feedPath(HOME_BASE), { replace: true })
		} finally {
			setBusy(false)
		}
	}

	function onCancel() {
		setPending(undefined)
		navigate(feedPath(HOME_BASE), { replace: true })
	}

	return (
		<Alert
			color="warning"
			role="alert"
			className="m-2"
			icon={<IcWarning size={24} />}
			title={t('Open {{idTag}}?', { idTag: pending })}
			actions={
				<>
					<Button onClick={onCancel}>{t('Cancel')}</Button>
					<Button color="primary" onClick={onContinue} disabled={busy}>
						{t('Continue')}
					</Button>
				</>
			}
		>
			{t(
				'Continuing identifies you to that server: Cloudillo signs in on your behalf so it can load the page. Only continue if you trust this address.'
			)}
		</Alert>
	)
}

// vim: ts=4
