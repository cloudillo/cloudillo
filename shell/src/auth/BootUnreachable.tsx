// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import {
	ActionBar,
	Button,
	Dialog,
	DialogContainer,
	IcRefresh,
	IcWarning,
	Text
} from '@cloudillo/react'
import { atom } from 'jotai'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

/**
 * The host the boot id-tag probe could not reach, set by `runBootSequence` instead of
 * `setAuth(null)` so an outage never looks like a sign-out.
 */
export const bootUnreachableAtom = atom<string | undefined>(undefined)

// A reload is the only clean re-run: `boot.ts` latches a module-level `booted` flag.
function reload() {
	window.location.reload()
}

/** Full-page boot halt shown while the server cannot be reached. */
export function BootUnreachable({ host }: { host: string }) {
	const { t } = useTranslation()

	React.useEffect(() => {
		window.addEventListener('online', reload)
		return () => window.removeEventListener('online', reload)
	}, [])

	return (
		<>
			<Dialog
				open
				size="sm"
				dismissable={false}
				icon={<IcWarning size={32} className="text-warning" />}
				title={t("Can't reach the server")}
				footer={
					<ActionBar>
						<Button color="primary" icon={<IcRefresh />} onClick={reload}>
							{t('Retry')}
						</Button>
					</ActionBar>
				}
			>
				<Text as="p">{t("Can't reach {{host}}. Check your connection.", { host })}</Text>
			</Dialog>
			{/* The shell's own DialogContainer is not mounted while this screen replaces it. */}
			<DialogContainer />
		</>
	)
}

// vim: ts=4
