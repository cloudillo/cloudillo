// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Below `lg`: the community sheet the dock's context island opens — the mobile half of
 * `CommunityFinder`. Its open state is `sidebarOpenAtom` (`useSidebar()`), which the
 * island toggles and `useContextSwitchNav` clears after a switch. The modal `<dialog>`
 * hands focus back to the island on close.
 */

import { BottomSheet, Button, HatVia, HBox, Text, useIsDesktop } from '@cloudillo/react'
import { useAtomValue } from 'jotai'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { activeContextAtom, useSidebar } from '../context/index.js'
import { useHatEntry } from '../context/hat-entry.js'
import { ContextAvatar } from '../ui/ContextChip.js'
import { CommunityFinder } from './CommunityFinder.js'

/** The worn hat of the active context: "B via ▣ A" and "Change identity". */
function WornHat({ onDone }: { onDone: () => void }) {
	const { t } = useTranslation()
	const activeContext = useAtomValue(activeContextAtom)
	const { changeHat } = useHatEntry()
	const hat = activeContext?.hat
	if (!activeContext || !hat) return null

	return (
		<HBox gap={2} align="center" className="p-2">
			<ContextAvatar
				idTag={activeContext.idTag}
				profilePic={activeContext.profilePic}
				hat={hat}
			/>
			<Text size="sm" className="flex-fill">
				<HatVia
					name={activeContext.name}
					hat={{
						idTag: hat.idTag,
						name: hat.name ?? hat.idTag,
						profilePic: hat.profilePic
					}}
				/>
			</Text>
			<Button
				variant="link"
				size="sm"
				onClick={() => {
					onDone()
					changeHat(activeContext.idTag).catch((err) =>
						console.error('[CommunitySheet] Change identity failed:', err)
					)
				}}
			>
				{t('Change identity')}
			</Button>
		</HBox>
	)
}

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
			<WornHat onDone={close} />
			<CommunityFinder variant="sheet" onDone={close} />
		</BottomSheet>
	)
}

// vim: ts=4
