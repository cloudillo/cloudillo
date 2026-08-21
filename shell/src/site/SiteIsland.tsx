// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * What gets portalled into a marked element.
 *
 * The seam between the scanner (`islands.ts`, pure DOM read) and the registry:
 * a block type either has a live renderer or it does not, and when it does not
 * this returns `null` and the publisher's static placeholder stays exactly as
 * the server painted it. That is the intended degraded state — an unmounted
 * island is a readable figure, a link or an `<img>`, never a gap.
 *
 * Container clearing lives in `prepareIslandContainers` below and not in a
 * `useLayoutEffect` inside the portal's subtree: that would run *after*
 * `createPortal` appended its children and wipe them out with the placeholder.
 */

import * as React from 'react'

import { getSiteIslands } from '../manifest-registry.js'
import { SiteIslandContainerContext } from './island-components.js'
import { siteIslandComponent } from './island-registry.js'
import type { IslandTarget } from './islands.js'

export function SiteIsland({ target }: { target: IslandTarget }) {
	const Component = siteIslandComponent(target.blockType)
	if (!Component) return null

	return (
		<SiteIslandContainerContext.Provider value={target.el}>
			<Component blockType={target.blockType} blockId={target.blockId} props={target.props} />
		</SiteIslandContainerContext.Provider>
	)
}

/**
 * Empty the containers of the `replace` islands that are about to be mounted.
 *
 * Call it after scanning and **before** the portals render — i.e. in the same
 * effect that adopts the content, ahead of the `setIslands` that mounts them.
 * Narrow on both sides: only `replace`, because an `enhance` island's `<img>` *is*
 * the content; and only where a renderer exists, so a declared-but-unimplemented
 * block type keeps its placeholder rather than losing it to an island that never
 * arrives.
 */
export function prepareIslandContainers(targets: readonly IslandTarget[]): void {
	if (!targets.length) return

	const specs = getSiteIslands()
	for (const target of targets) {
		if (specs.get(target.blockType)?.kind !== 'replace') continue
		if (!siteIslandComponent(target.blockType)) continue
		target.el.replaceChildren()
	}
}

// vim: ts=4
