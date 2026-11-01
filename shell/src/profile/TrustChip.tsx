// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * Small chip that reflects and manages whether I reveal my identity to a
 * foreign profile. Click to open a menu offering session / always / never /
 * anonymous / clear. Rendered next to the TrustBanner at the top of the
 * profile page; hidden while no decision exists (the TrustBanner shows then).
 *
 * The chip is not rendered for the user's own profile.
 */

import { Menu, MenuItem, Tag, useToast } from '@cloudillo/react'
import type { ProfileTrust } from '@cloudillo/types'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { useProfileTrust } from '../context/index.js'
import { IcAnonymous, IcPrivacy, IcViewer } from '../icons.js'

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
	if (trust == null) return null

	// Viewer-centric and neutral: what the other side sees of me, not a verdict on them.
	// Session vs stored is shown by the `selected` item in the menu.
	const { label, Icon } =
		trust === 'X'
			? { label: t('Anonymous to them'), Icon: IcAnonymous }
			: trust === 'never'
				? { label: t('Never reveal me'), Icon: IcPrivacy }
				: { label: t('Visible to them'), Icon: IcViewer }

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
				<Tag color="secondary" icon={<Icon size="0.9rem" />} caret>
					{label}
				</Tag>
			}
		>
			<MenuItem
				label={t('This session')}
				selected={trust === 'S'}
				onClick={() => apply('S')}
				disabled={busy}
			/>
			<MenuItem
				label={t('Always')}
				selected={trust === 'always'}
				onClick={() => apply('always')}
				disabled={busy}
			/>
			<MenuItem
				label={t('Never')}
				selected={trust === 'never'}
				onClick={() => apply('never')}
				disabled={busy}
			/>
			<MenuItem
				label={t('Continue anonymously')}
				selected={trust === 'X'}
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
