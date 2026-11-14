// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { onServerVersion } from '@cloudillo/core'
import { Alert, Button, useAuth } from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

/**
 * Offers a reload once the home node reports a different `X-Cloudillo-Version` than the first
 * one seen in this session (the node was upgraded under a running shell). Responses from other
 * nodes — communities included — are ignored. `CLOUDILLO_VERSION` is the shell's own build
 * version, so it is deliberately not the reference.
 */
export function UpdateBanner() {
	const { t } = useTranslation()
	const [auth] = useAuth()
	const homeIdTag = auth?.idTag
	const [updated, setUpdated] = React.useState(false)
	const [dismissed, setDismissed] = React.useState(false)

	React.useEffect(() => {
		if (!homeIdTag) return
		let first: string | undefined
		onServerVersion((idTag, version) => {
			if (idTag !== homeIdTag) return
			if (first === undefined) first = version
			else if (version !== first) setUpdated(true)
		})
		return () => onServerVersion(undefined)
	}, [homeIdTag])

	if (!updated || dismissed) return null

	return (
		<Alert
			color="info"
			role="status"
			className="m-2"
			title={t('A new version is available')}
			onDismiss={() => setDismissed(true)}
			actions={
				<Button color="primary" onClick={() => window.location.reload()}>
					{t('Reload page')}
				</Button>
			}
		/>
	)
}

// vim: ts=4
