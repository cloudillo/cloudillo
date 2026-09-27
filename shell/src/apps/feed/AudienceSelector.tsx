// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import {
	Button,
	Menu,
	MenuDivider,
	MenuItem,
	ProfilePicture,
	Text,
	useAuth
} from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuCheck as IcCheck, LuChevronDown as IcChevron } from 'react-icons/lu'

import { useCommunitiesList } from '../../context/index.js'

/** A possible audience (wall) for a post or repost. */
export interface AudienceTarget {
	idTag: string
	name?: string
	profilePic?: string
	kind: 'me' | 'community'
	/** Set when the requesting tenant already has an active REPOST of the
	 * original to this target — drives the ✓ badge. Resolved from the post's
	 * `stat.ownRepostIds` map. */
	repostId?: string
}

export interface AudienceSelectorProps {
	target: AudienceTarget
	/** The quoted action's `stat.ownRepostIds` — drives the informational ✓
	 * badge guarding against accidental duplicate reposts. */
	ownRepostIds?: Record<string, string>
	onChange: (target: AudienceTarget) => void
}

/**
 * Top-left "posting to …" audience selector for repost compose. A plain
 * {@link Menu} (no search) of the user's prioritised contexts: own
 * wall first, then pinned communities, then other memberships, with thin
 * dividers between the three groups.
 */
export function AudienceSelector({ target, ownRepostIds, onChange }: AudienceSelectorProps) {
	const { t } = useTranslation()
	const [auth] = useAuth()
	const { communities, favorites, pinnedIdTags } = useCommunitiesList()

	const { me, pinned, others, currentUnknown, resolved } = React.useMemo(() => {
		const withRepost = (tgt: AudienceTarget): AudienceTarget => ({
			...tgt,
			repostId: ownRepostIds?.[tgt.idTag]
		})
		const me = withRepost({
			idTag: auth?.idTag ?? '',
			name: auth?.name,
			profilePic: auth?.profilePic,
			kind: 'me'
		})
		const pinned = favorites
			.filter((c) => !c.isPending)
			.map((c) =>
				withRepost({
					idTag: c.idTag,
					name: c.name,
					profilePic: c.profilePic,
					kind: 'community'
				})
			)
		const others = communities
			.filter((c) => !c.isPending && !pinnedIdTags.includes(c.idTag))
			.map((c) =>
				withRepost({
					idTag: c.idTag,
					name: c.name,
					profilePic: c.profilePic,
					kind: 'community'
				})
			)
		const known = new Set([
			me.idTag,
			...pinned.map((c) => c.idTag),
			...others.map((c) => c.idTag)
		])
		const all = [me, ...pinned, ...others]
		const resolved = all.find((t) => t.idTag === target.idTag) ?? withRepost({ ...target })
		const currentUnknown = known.has(target.idTag) ? undefined : resolved
		return { me, pinned, others, currentUnknown, resolved }
	}, [
		auth?.idTag,
		auth?.name,
		auth?.profilePic,
		communities,
		favorites,
		pinnedIdTags,
		ownRepostIds,
		target.idTag
	])

	function row(tgt: AudienceTarget) {
		return (
			<MenuItem
				key={tgt.idTag}
				icon={<ProfilePicture profile={tgt} srcTag={tgt.idTag} size="xs" />}
				label={tgt.name || tgt.idTag}
				selected={tgt.idTag === target.idTag}
				onClick={() => onChange(tgt)}
				trailing={
					<>
						{tgt.kind === 'me' && (
							<Text size="sm" emphasis="muted">
								{t('(you)')}
							</Text>
						)}
						{tgt.repostId && (
							<IcCheck
								className="text-primary"
								aria-label={t('Already reposted to {{name}}', {
									name: tgt.name || tgt.idTag
								})}
							/>
						)}
					</>
				}
			/>
		)
	}

	return (
		<Menu
			placement="bottom-start"
			trigger={
				<Button variant="ghost" color="secondary" size="sm" aria-label={t('Post to')}>
					<ProfilePicture profile={resolved} srcTag={resolved.idTag} size="xs" />
					{resolved.name || resolved.idTag}
					<IcChevron />
				</Button>
			}
		>
			{currentUnknown && row(currentUnknown)}
			{currentUnknown && <MenuDivider />}
			{row(me)}
			{pinned.length > 0 && <MenuDivider />}
			{pinned.map(row)}
			{others.length > 0 && <MenuDivider />}
			{others.map(row)}
		</Menu>
	)
}

// vim: ts=4
