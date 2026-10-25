// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { type BadgeLevel, type BadgeSlot, communityName, isBadge } from '@cloudillo/types'
import * as React from 'react'

import { useLibTranslation } from '../../i18n.js'
import {
	IcBadgeBronze,
	IcBadgeDiamond,
	IcBadgeGold,
	IcBadgeSilver,
	IcBadgeStandard
} from '../../icons.js'
import { Popover } from '../Popover/index.js'
import { ProfilePicture } from '../Profile/ProfilePicture.js'
import { Tooltip } from '../Tooltip/index.js'
import { mergeClasses } from '../utils.js'

type TFn = (key: string, options?: Record<string, unknown>) => string

/** English label of a badge. Literal `t()` calls so `l-scan` extracts them. */
export function badgeLabel(slot: BadgeSlot, level: BadgeLevel, t: TFn): string {
	switch (`${slot}:${level}`) {
		case 'STD:verified':
			return t('Verified')
		case 'STD:trusted':
			return t('Trusted')
		case 'PAT:bronze':
			return t('Bronze patron')
		case 'PAT:silver':
			return t('Silver patron')
		case 'PAT:gold':
			return t('Gold patron')
		case 'PAT:diamond':
			return t('Diamond patron')
		default:
			return level
	}
}

/** One badge as the components take it: batch-served (`ProfileBadge`) or verified from a token. */
export interface CommunityBadgeData {
	community: { idTag: string; name?: string; profilePic?: string }
	slot: BadgeSlot
	level: BadgeLevel
	/** Unix seconds */
	exp: number
	/** From a community the viewer does not know: muted, dashed outline. */
	unknown?: boolean
	/** Node serving the community picture: the home node for batch badges, the issuer on the profile page. In a row it overrides the row's `srcTag`. */
	srcTag?: string
}

export interface CommunityBadgeProps extends CommunityBadgeData {
	/** Height in px. Default 18. */
	size?: number
	className?: string
}

/** The community's name with its idTag: anyone can pick a name, only the idTag identifies. */
export function communityText(community: { idTag: string; name?: string }): string {
	const name = communityName(community)
	return name ? `${name} (@${community.idTag})` : `@${community.idTag}`
}

function useBadgeText(b: CommunityBadgeData) {
	const { t } = useLibTranslation()
	const label = badgeLabel(b.slot, b.level, t)
	const text = t('{{badge}} · {{community}}', {
		badge: label,
		community: communityText(b.community)
	})
	return {
		label,
		text: b.unknown ? `${text}\n${t("From a community you don't know")}` : text
	}
}

/** Patron tiers differ by shape, not only colour. */
const PATRON_GLYPH: Record<string, React.ComponentType> = {
	bronze: IcBadgeBronze,
	silver: IcBadgeSilver,
	gold: IcBadgeGold,
	diamond: IcBadgeDiamond
}

function badgeGlyph(slot: BadgeSlot, level: BadgeLevel): React.ComponentType {
	return (slot === 'PAT' && PATRON_GLYPH[level]) || IcBadgeStandard
}

/** A badge's tinted glyph chip without the community: for level pickers next to a label. */
export function BadgeGlyph({
	slot,
	level,
	size = 18
}: {
	slot: BadgeSlot
	level: BadgeLevel
	size?: number
}) {
	const Glyph = badgeGlyph(slot, level)
	return (
		<span
			aria-hidden="true"
			className={mergeClasses(
				'c-community-badge',
				isBadge(slot, level) && `c-community-badge--${level}`
			)}
			style={{ '--cb-size': `${size}px` } as React.CSSProperties}
		>
			<span className="c-community-badge__glyph">
				<Glyph />
			</span>
		</span>
	)
}

/** A tinted pill: tier-shaped patron glyph (medal, star, crown, gem) or standing shield, then the community's avatar. */
export function CommunityBadge({ size = 18, srcTag, className, ...b }: CommunityBadgeProps) {
	const { text } = useBadgeText(b)
	const Glyph = badgeGlyph(b.slot, b.level)

	return (
		<Tooltip content={text} describe={false}>
			<span
				role="img"
				aria-label={text}
				className={mergeClasses(
					'c-community-badge',
					isBadge(b.slot, b.level) && `c-community-badge--${b.level}`,
					b.unknown && 'c-community-badge--unknown',
					className
				)}
				style={{ '--cb-size': `${size}px` } as React.CSSProperties}
			>
				<span className="c-community-badge__glyph" aria-hidden="true">
					<Glyph />
				</span>
				<span className="c-community-badge__avatar" aria-hidden="true">
					<ProfilePicture profile={b.community} size="xs" srcTag={srcTag} />
				</span>
			</span>
		</Tooltip>
	)
}

function LabelledBadge({ badge, size, srcTag }: { badge: CommunityBadgeData } & RowCommon) {
	const { label } = useBadgeText(badge)
	return (
		<span className="c-community-badge-item">
			<CommunityBadge {...badge} size={size} srcTag={srcTag} />
			<span className="c-community-badge-item__text">
				<span className="c-community-badge-item__label">{label}</span>
				<span className="c-community-badge-item__community">
					{communityText(badge.community)}
				</span>
			</span>
		</span>
	)
}

interface RowCommon {
	/** Diameter of each badge in px. */
	size?: number
	srcTag?: string
}

export interface CommunityBadgeRowProps extends RowCommon {
	badges: readonly CommunityBadgeData[]
	/** Show this many, then a "+n" button opening the full list. Unset: all, wrapping. */
	max?: number
	/** Each badge with its label and community name. */
	labelled?: boolean
	className?: string
}

/** A row of community badges; renders nothing when empty. */
export function CommunityBadgeRow({
	badges,
	max,
	size = 18,
	srcTag,
	labelled,
	className
}: CommunityBadgeRowProps) {
	const { t } = useLibTranslation()
	if (!badges.length) return null
	const shown = max != null && badges.length > max ? badges.slice(0, max) : badges
	const rest = badges.length - shown.length

	return (
		<span
			className={mergeClasses(
				'c-community-badge-row',
				labelled && 'c-community-badge-row--labelled',
				className
			)}
		>
			{shown.map((b) =>
				labelled ? (
					<LabelledBadge
						key={`${b.community.idTag}:${b.slot}`}
						badge={b}
						size={size}
						srcTag={b.srcTag ?? srcTag}
					/>
				) : (
					<CommunityBadge
						key={`${b.community.idTag}:${b.slot}`}
						{...b}
						size={size}
						srcTag={b.srcTag ?? srcTag}
					/>
				)
			)}
			{rest > 0 && (
				<Popover
					trigger={
						<button
							type="button"
							className="c-community-badge-more"
							aria-label={t('{{count}} more badges', { count: rest })}
						>
							+{rest}
						</button>
					}
				>
					<CommunityBadgeRow
						className="c-community-badge-row--popover"
						badges={badges}
						size={20}
						srcTag={srcTag}
						labelled
					/>
				</Popover>
			)}
		</span>
	)
}

// vim: ts=4
