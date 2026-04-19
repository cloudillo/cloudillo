// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Small header chip that reflects and manages the current trust state for a
 * foreign profile. Click to open a popover offering session / always / never /
 * clear. Rendered next to the profile name on the profile page header.
 *
 * The chip is not rendered for the user's own profile.
 */

import * as React from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import {
	LuShield as IcShield,
	LuShieldCheck as IcShieldCheck,
	LuShieldOff as IcShieldOff,
	LuEyeOff as IcAnonymous
} from 'react-icons/lu'

import { useToast } from '@cloudillo/react'
import type { ProfileTrust } from '@cloudillo/types'

import { useProfileTrust } from '../context/index.js'

interface TrustChipProps {
	idTag: string
	/**
	 * Called after any trust decision. Callers typically refetch the profile
	 * view so the new auth state is reflected immediately — both unlocks (now
	 * authenticated) and locks (must drop previously-rendered private content).
	 */
	onChanged?: () => void
}

export function TrustChip({ idTag, onChanged }: TrustChipProps): React.ReactElement | null {
	const { t } = useTranslation()
	const { getEffectiveTrust, setSessionTrust, setStoredTrust } = useProfileTrust()
	const { error: toastError } = useToast()
	const [open, setOpen] = React.useState(false)
	const [busy, setBusy] = React.useState(false)
	const wrapperRef = React.useRef<HTMLDivElement>(null)
	const menuRef = React.useRef<HTMLDivElement>(null)
	const [menuPos, setMenuPos] = React.useState<{ top: number; left: number } | null>(null)
	const menuId = React.useId()

	// Position the portal-anchored menu below the chip and clamp it to the
	// viewport. The callback re-runs whenever the menu opens, scrolls, or
	// resizes. Menu width is only known after the element mounts, so the
	// first call uses 0 (left = chip's x) and a second pass — triggered by
	// the ref callback below — re-clamps with the measured width.
	const updateMenuPos = React.useCallback(() => {
		if (!wrapperRef.current) return
		const rect = wrapperRef.current.getBoundingClientRect()
		const menuWidth = menuRef.current?.offsetWidth ?? 0
		const maxLeft = Math.max(8, window.innerWidth - menuWidth - 8)
		const left = Math.min(rect.left, maxLeft)
		const top = rect.bottom + 4
		setMenuPos((prev) =>
			prev && prev.left === left && prev.top === top ? prev : { top, left }
		)
	}, [])

	// Keep position synced with scroll/resize while open.
	React.useLayoutEffect(() => {
		if (!open) return
		updateMenuPos()
		window.addEventListener('resize', updateMenuPos)
		window.addEventListener('scroll', updateMenuPos, true)
		return () => {
			window.removeEventListener('resize', updateMenuPos)
			window.removeEventListener('scroll', updateMenuPos, true)
		}
	}, [open, updateMenuPos])

	// Ref callback: fires with the menu element once it is attached, then we
	// re-measure so the width-clamp in updateMenuPos can run against the real
	// size instead of the zero-width first pass.
	const menuRefCallback = React.useCallback(
		(node: HTMLDivElement | null) => {
			menuRef.current = node
			if (node) updateMenuPos()
		},
		[updateMenuPos]
	)

	React.useEffect(() => {
		if (!open) return
		const onClickOutside = (e: MouseEvent) => {
			const target = e.target as Node
			if (wrapperRef.current?.contains(target)) return
			if (menuRef.current?.contains(target)) return
			setOpen(false)
		}
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') setOpen(false)
		}
		window.addEventListener('mousedown', onClickOutside)
		window.addEventListener('keydown', onKey)
		return () => {
			window.removeEventListener('mousedown', onClickOutside)
			window.removeEventListener('keydown', onKey)
		}
	}, [open])

	const trust = getEffectiveTrust(idTag)

	// Chip presentation per effective trust level. Session 'X' gets its own
	// label so users can verify that "continue anonymously" actually stuck —
	// otherwise it is indistinguishable from the no-decision default.
	const { label, variant, Icon } = (() => {
		switch (trust) {
			case 'always':
				return { label: t('Trusted'), variant: 'success', Icon: IcShieldCheck }
			case 'never':
				return { label: t('Never'), variant: 'warning', Icon: IcShieldOff }
			case 'S':
				return { label: t('Session auth'), variant: 'primary', Icon: IcShield }
			case 'X':
				return {
					label: t('Anonymous (session)'),
					variant: 'secondary',
					Icon: IcAnonymous
				}
			default:
				return { label: t('Anonymous'), variant: 'secondary', Icon: IcAnonymous }
		}
	})()

	const apply = async (action: 'S' | 'X' | 'clear' | ProfileTrust) => {
		setBusy(true)
		try {
			if (action === 'S' || action === 'X') {
				setSessionTrust(idTag, action)
			} else if (action === 'always' || action === 'never') {
				await setStoredTrust(idTag, action)
			} else if (action === 'clear') {
				await setStoredTrust(idTag, null)
			}
			setOpen(false)
			// Always refetch: an unlock should reload with the authenticated
			// view; a lock ('never' / 'X') must drop previously-rendered
			// authenticated content so the user's opt-out takes effect
			// immediately instead of waiting for navigation.
			onChanged?.()
		} catch (err) {
			console.error('Failed to apply trust change:', err)
			toastError(t('Failed to update trust preference'))
		} finally {
			setBusy(false)
		}
	}

	const menu = open && menuPos && (
		<div
			ref={menuRefCallback}
			id={menuId}
			className="c-menu"
			style={{ position: 'fixed', top: menuPos.top, left: menuPos.left }}
			role="menu"
		>
			<button
				type="button"
				role="menuitem"
				className="c-menu-item"
				onClick={() => apply('S')}
				disabled={busy}
			>
				{t('This session')}
			</button>
			<button
				type="button"
				role="menuitem"
				className="c-menu-item"
				onClick={() => apply('always')}
				disabled={busy}
			>
				{t('Always')}
			</button>
			<button
				type="button"
				role="menuitem"
				className="c-menu-item"
				onClick={() => apply('never')}
				disabled={busy}
			>
				{t('Never')}
			</button>
			<button
				type="button"
				role="menuitem"
				className="c-menu-item"
				onClick={() => apply('X')}
				disabled={busy}
			>
				{t('Continue anonymously')}
			</button>
			{(trust === 'always' || trust === 'never') && (
				<button
					type="button"
					role="menuitem"
					className="c-menu-item danger"
					onClick={() => apply('clear')}
					disabled={busy}
				>
					{t('Clear trust')}
				</button>
			)}
		</div>
	)

	return (
		<div ref={wrapperRef} className="d-inline-block">
			<button
				type="button"
				className={`c-tag c-trust-chip ${variant} g-1`}
				onClick={() => setOpen((v) => !v)}
				aria-haspopup="menu"
				aria-expanded={open}
				aria-controls={open ? menuId : undefined}
			>
				<Icon size="0.9rem" />
				<span>{label}</span>
			</button>
			{menu && createPortal(menu, document.body)}
		</div>
	)
}

// vim: ts=4
