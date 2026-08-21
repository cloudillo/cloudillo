// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Finding the islands in a published page.
 *
 * The publisher marks the elements the shell is meant to bring to life
 * (`renderSiteIslandAttrs` in `libs/core/src/site-islands.ts`); everything else in a
 * fragment is inert static HTML that must never be re-rendered. This module is the
 * reading half: DOM in, target list out. It resolves no spec and mounts no component
 * — the registry lookup (`getSiteIslands()` in `../manifest-registry.js`) belongs to
 * whoever renders a target.
 */

import {
	parseSiteIslandProps,
	SITE_ISLAND_BLOCK_ATTR,
	SITE_ISLAND_ID_ATTR,
	SITE_ISLAND_PROPS_ATTR,
	SITE_ISLAND_SELECTOR
} from '@cloudillo/core'

/** One marked element, with everything the publisher baked into it. */
export interface IslandTarget {
	/** The marked element itself — a portal container, never re-rendered as JSX. */
	el: HTMLElement
	/** Long block type (`documentEmbed`, `image`, …); the registry's key. */
	blockType: string
	/** The block's own id, as published. Empty when the attribute is missing. */
	blockId: string
	/** `data-props`, scalars only. `{}` when absent or malformed. */
	props: Record<string, unknown>
	/**
	 * React key. `blockId` where it is usable, so the same block in a re-fetched
	 * page keeps its island; positional otherwise, because a duplicate key would
	 * cost one of the two islands its component.
	 */
	key: string
}

/** Every island under `root`, in document order. Never mutates the subtree. */
export function scanIslands(root: ParentNode | null | undefined): IslandTarget[] {
	if (!root) return []

	const targets: IslandTarget[] = []
	const seen = new Set<string>()

	root.querySelectorAll<HTMLElement>(SITE_ISLAND_SELECTOR).forEach((el, i) => {
		const blockType = el.getAttribute(SITE_ISLAND_BLOCK_ATTR)
		if (!blockType) return

		const blockId = el.getAttribute(SITE_ISLAND_ID_ATTR) ?? ''
		const key = blockId && !seen.has(blockId) ? blockId : `${blockType}#${i}`
		seen.add(key)

		targets.push({
			el,
			blockType,
			blockId,
			props: parseSiteIslandProps(el.getAttribute(SITE_ISLAND_PROPS_ATTR)) ?? {},
			key
		})
	})

	return targets
}

// vim: ts=4
