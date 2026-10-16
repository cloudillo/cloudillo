// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/** Determinism banners and the engine-failure panel. */

import { Alert, Button, EmptyState, IcError } from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

const reload = () => window.location.reload()

export function Banners({
	readOnlyReason,
	fontsChanged
}: {
	readOnlyReason?: 'engine'
	fontsChanged: boolean
}) {
	const { t } = useTranslation()
	// `fontsChanged` is latched in useLayout; dismissing is UI state only.
	const [fontsDismissed, setFontsDismissed] = React.useState(false)
	return (
		<>
			{readOnlyReason === 'engine' && (
				<Alert
					color="warning"
					compact
					actions={<Button onClick={reload}>{t('Reload')}</Button>}
				>
					{t(
						'A newer version of Pagillo is in use on this publication. Reload to keep editing'
					)}
				</Alert>
			)}
			{fontsChanged && !fontsDismissed && (
				<Alert color="info" compact onDismiss={() => setFontsDismissed(true)}>
					{t('Fonts were updated — line breaks may have changed')}
				</Alert>
			)}
		</>
	)
}

/** Full panel: the worker or WASM failed (`LayoutState.failed`). */
export function EngineStopped({ message }: { message: string }) {
	const { t } = useTranslation()
	React.useEffect(() => console.error('[pagillo] layout engine failed:', message), [message])
	return (
		<EmptyState
			fill
			color="error"
			icon={<IcError />}
			title={t('The layout engine stopped. Your work is saved. Reload.')}
			action={<Button onClick={reload}>{t('Reload')}</Button>}
		/>
	)
}

// vim: ts=4
