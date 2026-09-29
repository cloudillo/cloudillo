// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * One full-text search hit, rendered identically in the omnibox dropdown and on
 * the `/search` results page.
 *
 * A `ListItem`: the caller supplies the row behaviour — downshift's `getItemProps` in
 * the dropdown, `href` on the results page. It builds a thumbnail URL of its own
 * (`getFileUrl`) and falls back to the type icon when that 404s.
 */

import { getFileUrl } from '@cloudillo/core'
import {
	Highlight,
	Image,
	ListItem,
	type ListItemProps,
	ProfilePicture,
	Text,
	TimeFormat
} from '@cloudillo/react'
import type { SearchHit } from '@cloudillo/types'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuMessageSquare as IcAction } from 'react-icons/lu'

import { getFileIcon } from './apps/files/icons.js'

export interface SearchResultRowProps extends Omit<ListItemProps, 'title'> {
	hit: SearchHit
	/** Compact single-line-ish variant for the omnibox dropdown. */
	compact?: boolean
	/** The node that answered the query; a file's own `ownerTag` wins over it. */
	contextIdTag?: string
}

export const SearchResultRow = React.forwardRef<HTMLLIElement, SearchResultRowProps>(
	function SearchResultRow({ hit, compact, contextIdTag, ...props }, ref) {
		const { t } = useTranslation()

		const isProfile = hit.objTp === 'P'
		const title = hit.title || (isProfile ? hit.objId : t('Untitled'))
		// A profile's only useful meta is its handle, and even that is noise for a profile
		// with no display name — the title already fell back to the tag. `ownerTag` on a
		// 'P' row is the profile's own tag, so `objId` says the same thing more plainly.
		const meta = isProfile
			? hit.title
				? `@${hit.objId}`
				: ''
			: [hit.appId, hit.ownerTag && `@${hit.ownerTag}`, hit.partKind]
					.filter(Boolean)
					.join(' · ')
		// The node holding the file, not the one it is being browsed from. Addressed by
		// *file* id: `/api/files/{id}` resolves its path segment as a file id and picks
		// the variant from the query string.
		const thumbHost = hit.ownerTag || contextIdTag
		// Offered to every file-backed hit, with no content-type allowlist: PDFs and
		// other documents get a `vis.tn` too, and an allowlist would silently drop
		// whatever the thumbnailer learns to handle next. A file with no thumbnail —
		// a folder, a CRDT/RTDB doc, a blob still being processed — 404s and falls
		// back to the type icon.
		const thumbUrl =
			!isProfile && hit.objTp !== 'A' && thumbHost
				? getFileUrl(thumbHost, hit.objId, 'vis.tn')
				: undefined

		// One size in both variants. A compact row still stacks title, meta and snippet
		// — one line each rather than the results page's two — so it clears 2.5rem
		// without growing, and the dropdown scrolls anyway.
		let icon: React.ReactNode
		if (isProfile) {
			icon = <ProfilePicture profile={{ profilePic: hit.profilePic }} srcTag={hit.objId} />
		} else if (hit.objTp === 'A') {
			icon = <IcAction width={24} height={24} />
		} else {
			const Icon = getFileIcon(hit.contentType ?? '', undefined)
			const typeIcon = <Icon width={24} height={24} />
			// `alt=""` — the title beside it already names the file.
			icon = thumbUrl ? (
				<Image
					className="c-search-row-thumb"
					src={thumbUrl}
					alt=""
					maxAttempts={1}
					fallback={typeIcon}
				/>
			) : (
				typeIcon
			)
		}

		return (
			<ListItem
				ref={ref}
				{...props}
				className={compact ? 'c-search-row compact' : 'c-search-row'}
				size="sm"
				leading={icon}
				title={title}
				subtitle={meta || undefined}
				meta={!compact && <TimeFormat time={hit.updatedAt} />}
			>
				{/* A profile's indexed body *is* its idTag, so the snippet would
				    only repeat the title or the handle above. */}
				{!isProfile && hit.snippet && (
					<Text size="sm" emphasis="muted" className="c-search-row-snippet">
						<Highlight text={hit.snippet} matches={hit.snippetMatches} />
					</Text>
				)}
			</ListItem>
		)
	}
)

// vim: ts=4
