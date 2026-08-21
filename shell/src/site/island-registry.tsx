// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The island registry's component table — the half that needs React.
 *
 * The declarative side is `@cloudillo/core`'s `site-islands.ts`; this is the other
 * end of that contract, and it lives in the shell because the shell is the only thing
 * that mounts an island.
 *
 * **There is one lookup path.** Built-ins register through the same table an app's
 * renderer would, so mounting never branches on "is this a built-in?".
 *
 * A component is handed exactly what the marked element carried and nothing else — no
 * editor, no document, no bus. Every prop is untrusted, and anything used as a URL
 * goes through `safeHref`: the page runs on the site owner's own origin.
 *
 * Mounting lives in `SiteIsland.tsx`; the `image` and `documentEmbed` renderers, which
 * need a shell-side embed hook, live in `island-components.tsx` and register here.
 */

import { safeHref, sitePositiveInt, tAnyValue } from '@cloudillo/core'
import * as T from '@symbion/runtype'
import * as React from 'react'

/** What a marked element on a published page carries, parsed. */
export interface SiteIslandProps {
	blockType: string
	/** `data-cl-id` — the block's own id, stable across a content swap. */
	blockId: string
	/** `data-props`, baked at publish time. Scalars only. */
	props: Record<string, unknown>
}

export type SiteIslandComponent = React.ComponentType<SiteIslandProps>

const components = new Map<string, SiteIslandComponent>()

/**
 * Registers the live renderer for a block type. Idempotent by block type — a later
 * registration replaces an earlier one, which is what lets the shell override a
 * built-in without a second table to consult.
 */
export function registerSiteIsland(blockType: string, component: SiteIslandComponent): void {
	components.set(blockType, component)
}

/** The renderer for a block type, or nothing — in which case the placeholder stays. */
export function siteIslandComponent(blockType: string): SiteIslandComponent | undefined {
	return components.get(blockType)
}

// ── Built-in renderers ──

/**
 * `data-props` is JSON off a published page, decoded once per island. All optional
 * and unknown ones `'drop'`, so another generation's props leave the player
 * renderable. The dimensions stay `unknown` because `sitePositiveInt` coerces — a
 * stored `"320"` published at 320px must mount at 320px too.
 */
const tPlayerProps = T.struct({
	src: T.optional(T.string),
	poster: T.optional(T.string),
	width: T.optional(tAnyValue),
	height: T.optional(tAnyValue),
	previewWidth: T.optional(tAnyValue)
})
const DECODE_OPTS = { unknownFields: 'drop' } as const

/**
 * A `replace` island: the static placeholder is a link to the file, and this swaps
 * a real player in. `controls` and nothing else — a published page has no player
 * chrome of its own, and the browser's is the one a reader already knows.
 */
function SiteVideoIsland({ props }: SiteIslandProps) {
	const decoded = T.decode(tPlayerProps, props, DECODE_OPTS)
	const player = T.isOk(decoded) ? decoded.ok : undefined
	const src = safeHref(player?.src)
	if (!src) return null
	// `width`/`height` stay the intrinsic aspect reservation; `previewWidth` is the
	// size the author dragged the block to, the same one the static poster carries.
	const previewWidth = sitePositiveInt(player?.previewWidth)
	return (
		<video
			className="cl-site-video-player"
			src={src}
			poster={safeHref(player?.poster)}
			width={sitePositiveInt(player?.width)}
			height={sitePositiveInt(player?.height)}
			style={previewWidth ? { width: `${previewWidth}px` } : undefined}
			controls
			playsInline
			preload="metadata"
		/>
	)
}

function SiteAudioIsland({ props }: SiteIslandProps) {
	const decoded = T.decode(tPlayerProps, props, DECODE_OPTS)
	const src = safeHref(T.isOk(decoded) ? decoded.ok.src : undefined)
	if (!src) return null
	return <audio className="cl-site-audio-player" src={src} controls preload="metadata" />
}

registerSiteIsland('video', SiteVideoIsland)
registerSiteIsland('audio', SiteAudioIsland)

// vim: ts=4
