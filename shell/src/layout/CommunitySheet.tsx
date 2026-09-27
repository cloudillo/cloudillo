// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Below `lg`: the community sheet the dock's context island opens — the mobile half of
 * `CommunityFinder`. Its open state is `sidebarOpenAtom` (`useSidebar()`), which the
 * island toggles and `useContextSwitchNav` clears after a switch. The modal `<dialog>`
 * hands focus back to the island on close.
 */

import { BottomSheet, useIsDesktop } from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { useSidebar } from '../context/index.js'
import { CommunityFinder } from './CommunityFinder.js'

export function CommunitySheet() {
	const { t } = useTranslation()
	const { isOpen, close } = useSidebar()
	const isDesktop = useIsDesktop()

	return (
		<BottomSheet
			showBackdrop
			snapPoint={isOpen && !isDesktop ? 'full' : 'closed'}
			onSnapChange={(snap) => {
				if (snap === 'closed') close()
			}}
			aria-label={t('Communities')}
		>
			<CommunityFinder variant="sheet" onDone={close} />
		</BottomSheet>
	)
}

// vim: ts=4
