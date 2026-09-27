// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Small header chip that reflects and manages the current trust state for a
 * foreign profile. Click to open a menu offering session / always / never /
 * clear. Rendered next to the profile name on the profile page header.
 *
 * The chip is not rendered for the user's own profile.
 */

import { Menu, MenuItem, Tag, useToast } from '@cloudillo/react'
import type { ProfileTrust } from '@cloudillo/types'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
	LuEyeOff as IcAnonymous,
	LuShield as IcShield,
	LuShieldCheck as IcShieldCheck,
	LuShieldOff as IcShieldOff
} from 'react-icons/lu'

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
	const [busy, setBusy] = React.useState(false)

	const trust = getEffectiveTrust(idTag)

	// Chip presentation per effective trust level. Session 'X' gets its own
	// label so users can verify that "continue anonymously" actually stuck —
	// otherwise it is indistinguishable from the no-decision default.
	const { label, color, Icon } = (() => {
		switch (trust) {
			case 'always':
				return { label: t('Trusted'), color: 'success' as const, Icon: IcShieldCheck }
			case 'never':
				return { label: t('Never'), color: 'warning' as const, Icon: IcShieldOff }
			case 'S':
				return { label: t('Session auth'), color: 'primary' as const, Icon: IcShield }
			case 'X':
				return {
					label: t('Anonymous (session)'),
					color: 'secondary' as const,
					Icon: IcAnonymous
				}
			default:
				return { label: t('Anonymous'), color: 'secondary' as const, Icon: IcAnonymous }
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

	return (
		<Menu
			trigger={
				<Tag color={color} icon={<Icon size="0.9rem" />} caret>
					{label}
				</Tag>
			}
		>
			<MenuItem label={t('This session')} onClick={() => apply('S')} disabled={busy} />
			<MenuItem label={t('Always')} onClick={() => apply('always')} disabled={busy} />
			<MenuItem label={t('Never')} onClick={() => apply('never')} disabled={busy} />
			<MenuItem
				label={t('Continue anonymously')}
				onClick={() => apply('X')}
				disabled={busy}
			/>
			{(trust === 'always' || trust === 'never') && (
				<MenuItem
					label={t('Clear trust')}
					color="error"
					onClick={() => apply('clear')}
					disabled={busy}
				/>
			)}
		</Menu>
	)
}

// vim: ts=4
