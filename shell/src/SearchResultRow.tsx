// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * One full-text search hit, rendered identically in the omnibox dropdown and on
 * the `/search` results page.
 *
 * No link, no click handler. In the dropdown it is the body of a downshift `<li>`
 * that already owns `getItemProps` and the blur guard; on the results page it is the
 * body of a `<Link>`. Own navigation would fight both. It does build a thumbnail URL
 * of its own (`getFileUrl`) and remembers, per URL, which thumbnails 404ed.
 */

import { getFileUrl } from '@cloudillo/core'
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
	/** The node that answered the query; a file's own `ownerTag` wins over it. */
	contextIdTag?: string
}

export function SearchResultRow({ hit, compact, className, contextIdTag }: SearchResultRowProps) {
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
		: [hit.appId, hit.ownerTag && `@${hit.ownerTag}`, hit.partKind].filter(Boolean).join(' · ')
	// The node holding the file, not the one it is being browsed from. Addressed by
	// *file* id: `/api/files/{id}` resolves its path segment as a file id and picks
	// the variant from the query string.
	const thumbHost = hit.ownerTag || contextIdTag
	// Offered to every file-backed hit, with no content-type allowlist: PDFs and
	// other documents get a `vis.tn` too, and an allowlist would silently drop
	// whatever the thumbnailer learns to handle next. A file with no thumbnail —
	// a folder, a CRDT/RTDB doc, a blob still being processed — 404s, and the
	// `onError` below falls back to the type icon. The `<img>` is lazy, so the
	// request waits until the row nears the viewport and an off-screen 404 costs
	// nothing.
	const thumbUrl =
		!isProfile && hit.objTp !== 'A' && thumbHost
			? getFileUrl(thumbHost, hit.objId, 'vis.tn')
			: undefined
	// Keyed by URL, not a bare boolean: the omnibox reuses these rows across
	// queries, and a stale `true` would hide a thumbnail that does exist.
	const [failedThumb, setFailedThumb] = React.useState<string | undefined>(undefined)

	// One size in both variants. A compact row still stacks title, meta and snippet
	// — one line each rather than the results page's two — so it clears 2.5rem
	// without growing, and the dropdown scrolls anyway.
	let icon: React.ReactNode
	if (isProfile) {
		icon = <ProfilePicture profile={{ profilePic: hit.profilePic }} srcTag={hit.objId} />
	} else if (hit.objTp === 'A') {
		icon = <IcAction width={24} height={24} />
	} else if (thumbUrl && failedThumb !== thumbUrl) {
		// `alt=""` — the title beside it already names the file.
		icon = (
			<img
				className="c-search-row-thumb"
				src={thumbUrl}
				alt=""
				loading="lazy"
				decoding="async"
				onError={() => setFailedThumb(thumbUrl)}
			/>
		)
	} else {
		const Icon = getFileIcon(hit.contentType ?? '', undefined)
		icon = <Icon width={24} height={24} />
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
				{meta && <span className="text-sm text-muted c-search-row-meta">{meta}</span>}
				{/* A profile's indexed body *is* its idTag, so the snippet would
				    only repeat the title or the handle above. */}
				{!isProfile && hit.snippet && (
					<span className="text-sm text-muted c-search-row-snippet">
						<Highlight text={hit.snippet} matches={hit.snippetMatches} />
					</span>
				)}
			</span>
			{!compact && (
				<span className="text-sm text-muted c-search-row-time">
					<TimeFormat time={hit.updatedAt} />
				</span>
			)}
		</span>
	)
}

// vim: ts=4
