// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { Button } from '@cloudillo/react'
import { useAtom } from 'jotai'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuCircleAlert as IcWarning } from 'react-icons/lu'
import { useNavigate } from 'react-router-dom'

import { feedPath, HOME_BASE } from '../routes.js'
import { pendingContextAtom } from './atoms'
import { useApiContext } from './hooks'

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
	const { setActiveContext } = useApiContext()
	const navigate = useNavigate()
	const [busy, setBusy] = React.useState(false)

	if (!pending) return null

	async function onContinue() {
		if (!pending) return
		setBusy(true)
		try {
			// The explicit path, the same one the sidebar switcher takes — pressing this
			// button *is* the user action the trust gate was waiting for.
			await setActiveContext(pending)
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
		<div className="c-panel warning d-flex align-items-center g-3 m-2 p-3" role="alert">
			<IcWarning className="flex-shrink-0" size={24} />
			<div className="flex-fill">
				<strong>{t('Open {{idTag}}?', { idTag: pending })}</strong>
				<div className="text-muted small">
					{t(
						'Continuing identifies you to that server: Cloudillo signs in on your behalf so it can load the page. Only continue if you trust this address.'
					)}
				</div>
			</div>
			<Button onClick={onCancel}>{t('Cancel')}</Button>
			<Button className="primary" onClick={onContinue} disabled={busy}>
				{t('Continue')}
			</Button>
		</div>
	)
}

// vim: ts=4
