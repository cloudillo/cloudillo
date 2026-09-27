// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

import { mergeClasses } from '../utils.js'
import { type AppId, GLYPH_COLOR2, GLYPHS, type GlyphId } from './glyphs.js'

/** Only the sizes the atlas glyphs were drawn and checked at (px, so strokes stay on the grid) */
export type AppIconSize = 'sm' | 'md' | 'lg'
const SIZE_PX: Record<AppIconSize, number> = { sm: 20, md: 32, lg: 56 }

// the squircle tile on a 64 box, and the glyph's 48 box scaled onto it
const TILE = 'M32 0C57 0 64 7 64 32S57 64 32 64 0 57 0 32 7 0 32 0z'
const GLYPH_ON_TILE = 'translate(2 2) scale(1.25)'

interface GlyphIconProps extends Omit<React.SVGAttributes<SVGSVGElement>, 'children'> {
	/** Default `md` (32px) */
	size?: AppIconSize
	/** Fixed-light squircle tile (default); `false` draws the bare glyph for list rows and inline mentions */
	tile?: boolean
	/** Accessible name; without it the icon is decorative */
	label?: string
}

export interface AppIconProps extends GlyphIconProps {
	app: AppId
}

/** Shared by AppIcon and FileTypeIcon */
export const GlyphIcon = React.forwardRef<SVGSVGElement, GlyphIconProps & { glyph: GlyphId }>(
	function GlyphIcon(
		{ glyph, size = 'md', tile = true, label, className, style, ...props },
		ref
	) {
		const px = SIZE_PX[size]
		const markup = { __html: GLYPHS[glyph] }
		return (
			<svg
				ref={ref}
				className={mergeClasses('c-app-icon', tile && 'tile', className)}
				viewBox={tile ? '0 0 64 64' : '0 0 48 48'}
				width={px}
				height={px}
				style={
					{
						'--hue': `var(--h-${glyph})`,
						'--fg2': `var(--p-${GLYPH_COLOR2[glyph]})`,
						...style
					} as React.CSSProperties
				}
				{...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
				{...props}
			>
				{tile ? (
					<>
						<path className="c-app-icon-tile" d={TILE} />
						<g transform={GLYPH_ON_TILE} dangerouslySetInnerHTML={markup} />
					</>
				) : (
					<g dangerouslySetInnerHTML={markup} />
				)}
			</svg>
		)
	}
)

export const AppIcon = React.forwardRef<SVGSVGElement, AppIconProps>(function AppIcon(
	{ app, ...props },
	ref
) {
	return <GlyphIcon ref={ref} glyph={app} {...props} />
})

// vim: ts=4
