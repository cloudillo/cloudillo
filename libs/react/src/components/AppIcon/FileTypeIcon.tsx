// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

import { type AppIconProps, GlyphIcon } from './AppIcon.js'
import { type GlyphId, isAppId } from './glyphs.js'

export interface FileTypeIconProps extends Omit<AppIconProps, 'app'> {
	/** MIME type; `cloudillo/<app>` draws that app's icon, unknown types the generic glyph */
	contentType?: string
}

// contentType comes from federated metadata, so only known ids may pick a glyph
function fileTypeGlyph(contentType = ''): GlyphId {
	if (contentType.startsWith('cloudillo/')) {
		const id = contentType.slice('cloudillo/'.length)
		if (id === 'folder') return 'folder'
		if (isAppId(id)) return id
		return 'generic'
	}
	if (contentType.startsWith('image/')) return 'image'
	if (contentType.startsWith('video/')) return 'video'
	if (contentType === 'application/pdf') return 'pdf'
	return 'generic'
}

export const FileTypeIcon = React.forwardRef<SVGSVGElement, FileTypeIconProps>(
	function FileTypeIcon({ contentType, ...props }, ref) {
		return <GlyphIcon ref={ref} glyph={fileTypeGlyph(contentType)} {...props} />
	}
)

// vim: ts=4
