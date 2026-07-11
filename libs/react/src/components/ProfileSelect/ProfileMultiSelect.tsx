// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { Profile } from '@cloudillo/types'
import * as React from 'react'
import { LuX as IcClose } from 'react-icons/lu'

import { useLibTranslation } from '../../i18n.js'
import { Button } from '../Button/index.js'
import { ProfileCard } from '../Profile/index.js'
import { mergeClasses } from '../utils.js'
import { ProfileSelect } from './ProfileSelect.js'

export interface ProfileMultiSelectProps {
	className?: string
	placeholder?: string
	/** Shown below the search when `value` is empty. */
	emptyText?: React.ReactNode
	/** Server-side typeahead source (the underlying Select debounces). */
	listProfiles: (q: string) => Promise<Profile[] | undefined>
	/** Managed profiles (controlled). */
	value: Profile[]
	/** Fired when a search result is picked; never fired for an idTag already in `value`. */
	onAdd: (profile: Profile) => void
	/** Fired by the default remove button, or by the confirm prompt's Remove. */
	onRemove: (profile: Profile) => void
	/** 'chips' (default): inline removable chips. 'list': vertical rows. */
	variant?: 'chips' | 'list'
	/** Rendered after the search input in the same hbox (e.g. default access-level menu). */
	searchAddon?: React.ReactNode
	/** list variant: static rows rendered above the managed rows (e.g. owner row). */
	children?: React.ReactNode
	/** list variant: per-row trailing content replacing the default remove button
	 *  (e.g. AccessLevelMenu — which then owns the remove trigger). */
	renderActions?: (profile: Profile) => React.ReactNode
	/** idTag whose row is replaced by an inline remove-confirmation prompt. */
	confirmingRemove?: string | null
	onCancelRemove?: () => void
	/** Prompt content; defaults to t('Remove {{name}}?', { name: profile.name || profile.idTag }). */
	removePrompt?: (profile: Profile) => React.ReactNode
}

export function ProfileMultiSelect({
	className,
	placeholder,
	emptyText,
	listProfiles,
	value,
	onAdd,
	onRemove,
	variant = 'chips',
	searchAddon,
	children,
	renderActions,
	confirmingRemove,
	onCancelRemove,
	removePrompt
}: ProfileMultiSelectProps) {
	const { t } = useLibTranslation()

	async function filtered(q: string): Promise<Profile[] | undefined> {
		const profiles = await listProfiles(q)
		return profiles?.filter((p) => !value.some((v) => v.idTag === p.idTag))
	}

	function pick(profile: Profile | undefined) {
		if (!profile || value.some((v) => v.idTag === profile.idTag)) return
		onAdd(profile)
	}

	function renderConfirmRow(profile: Profile) {
		return (
			<div key={profile.idTag} className="c-hbox g-2 align-items-center p-2">
				<span className="flex-fill text-small">
					{removePrompt?.(profile) ??
						t('Remove {{name}}?', { name: profile.name || profile.idTag })}
				</span>
				<Button size="small" onClick={onCancelRemove}>
					{t('Cancel')}
				</Button>
				<Button size="small" variant="primary" onClick={() => onRemove(profile)}>
					{t('Remove')}
				</Button>
			</div>
		)
	}

	return (
		<div className={mergeClasses('c-vbox g-1', className)}>
			<div className="c-hbox g-2 align-items-center">
				<div className="flex-fill">
					<ProfileSelect
						placeholder={placeholder}
						listProfiles={filtered}
						onChange={pick}
					/>
				</div>
				{searchAddon}
			</div>
			{variant === 'chips' ? (
				<>
					{children}
					{value.length === 0 ? (
						!!emptyText && <span className="text-muted text-small">{emptyText}</span>
					) : (
						<div className="c-hbox flex-wrap g-1 align-items-center">
							{value.map((profile) =>
								confirmingRemove === profile.idTag ? (
									renderConfirmRow(profile)
								) : (
									<div
										key={profile.idTag}
										className="c-hbox align-items-center g-1"
									>
										<ProfileCard profile={profile} />
										<button
											type="button"
											className="c-link p-1"
											aria-label={t('Remove')}
											onClick={() => onRemove(profile)}
										>
											<IcClose />
										</button>
									</div>
								)
							)}
						</div>
					)}
				</>
			) : (
				<>
					{children}
					{value.map((profile) =>
						confirmingRemove === profile.idTag ? (
							renderConfirmRow(profile)
						) : (
							<div key={profile.idTag} className="c-hbox g-2 align-items-center p-2">
								<div className="flex-fill text-truncate">
									<ProfileCard profile={profile} />
								</div>
								{renderActions ? (
									renderActions(profile)
								) : (
									<button
										type="button"
										className="c-link p-1"
										aria-label={t('Remove')}
										onClick={() => onRemove(profile)}
									>
										<IcClose />
									</button>
								)}
							</div>
						)
					)}
					{value.length === 0 && !!emptyText && (
						<span className="text-muted text-small">{emptyText}</span>
					)}
				</>
			)}
		</div>
	)
}

// vim: ts=4
