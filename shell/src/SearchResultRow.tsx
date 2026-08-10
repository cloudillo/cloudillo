// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * One full-text search hit, rendered identically in the omnibox dropdown and on
 * the `/search` results page.
 *
 * Purely presentational: no link, no click handler. In the dropdown it is the body of
 * a downshift `<li>` that already owns `getItemProps` and the blur guard; on the
 * results page it is the body of a `<Link>`. Own navigation would fight both.
 */

import { Highlight, mergeClasses, ProfilePicture, TimeFormat } from '@cloudillo/react'
import type { SearchHit } from '@cloudillo/types'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuMessageSquare as IcAction } from 'react-icons/lu'

import { getFileIcon } from './apps/files/icons.js'

export interface SearchResultRowProps {
	hit: SearchHit
	/** Compact single-line-ish variant for the omnibox dropdown. */
	compact?: boolean
	className?: string
}

export function SearchResultRow({ hit, compact, className }: SearchResultRowProps) {
	const { t } = useTranslation()

	const title = hit.title || (hit.objTp === 'P' ? hit.objId : t('Untitled'))
	const meta = [hit.appId, hit.ownerTag && `@${hit.ownerTag}`, hit.partKind]
		.filter(Boolean)
		.join(' · ')

	let icon: React.ReactNode
	if (hit.objTp === 'P') {
		// A hit carries no profilePic, so this is always the unknown avatar — correct,
		// and cheaper than a lookup per row.
		icon = <ProfilePicture profile={{}} srcTag={hit.objId} tiny />
	} else if (hit.objTp === 'A') {
		icon = <IcAction />
	} else {
		const Icon = getFileIcon(hit.contentType ?? '', undefined)
		icon = <Icon width={16} height={16} />
	}

	return (
		<span
			className={mergeClasses(
				'c-hbox align-items-center g-2 c-search-row',
				compact && 'compact',
				className
			)}
		>
			<span className="c-search-row-icon">{icon}</span>
			<span className="c-vbox c-search-row-body">
				<span className="c-search-row-title">{title}</span>
				{meta && <span className="small text-muted c-search-row-meta">{meta}</span>}
				{hit.snippet && (
					<span className="small text-muted c-search-row-snippet">
						<Highlight text={hit.snippet} matches={hit.snippetMatches} />
					</span>
				)}
			</span>
			{!compact && (
				<span className="small text-muted c-search-row-time">
					<TimeFormat time={hit.updatedAt} />
				</span>
			)}
		</span>
	)
}

// vim: ts=4
