// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Below `lg`: the community sheet the dock's context island opens — the mobile half of
 * `CommunityFinder`. Its open state is `sidebarOpenAtom` (`useSidebar()`), which the
 * island toggles and `useContextSwitchNav` clears after a switch.
 */

import { useIsDesktop } from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { useSidebar } from '../context/index.js'
import { CommunityFinder } from './CommunityFinder.js'

export function CommunitySheet() {
	const { t } = useTranslation()
	const { isOpen, close } = useSidebar()
	const isDesktop = useIsDesktop()
	const sheetRef = React.useRef<HTMLDivElement | null>(null)
	const clipRef = React.useRef<HTMLDivElement | null>(null)
	const show = isOpen && !isDesktop

	React.useEffect(() => {
		const sheet = sheetRef.current
		if (!show || !sheet) return

		// Focus the dialog, not the input: no keyboard until the user asks for one.
		sheet.focus()

		function onKey(evt: KeyboardEvent) {
			// This listener runs before an open row menu's own; let Escape close only that.
			if (evt.key === 'Escape' && !document.querySelector('#popper-container .c-menu'))
				close()
		}

		// Lift the sheet by the visualViewport inset; switch to
		// interactive-widget=resizes-content if iOS supports it.
		const vv = window.visualViewport
		function onViewport() {
			if (!vv) return
			const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
			clipRef.current?.style.setProperty('--kb-inset', `${inset}px`)
		}

		document.addEventListener('keydown', onKey)
		vv?.addEventListener('resize', onViewport)
		vv?.addEventListener('scroll', onViewport)
		return () => {
			document.removeEventListener('keydown', onKey)
			vv?.removeEventListener('resize', onViewport)
			vv?.removeEventListener('scroll', onViewport)
			// Hand focus back to the island unless the close moved it somewhere on purpose.
			const active = document.activeElement
			if (!active || active === document.body || sheet.contains(active)) {
				document.querySelector<HTMLElement>('.c-ctx-toggle')?.focus()
			}
		}
	}, [show, close])

	if (!show) return null

	return (
		<>
			<div className="c-community-sheet-backdrop" onClick={close} />
			<div ref={clipRef} className="c-community-sheet-clip">
				<div
					ref={sheetRef}
					className="c-community-sheet"
					role="dialog"
					aria-modal="true"
					aria-label={t('Communities')}
					tabIndex={-1}
				>
					<CommunityFinder variant="sheet" onDone={close} />
				</div>
			</div>
		</>
	)
}

// vim: ts=4
