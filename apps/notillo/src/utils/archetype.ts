// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The archetype half of page creation.
 *
 * A page's `childKind` says what a *child* of it is, so adding a post under a blog
 * page is one step rather than two — create the child, and it is already a `post`.
 * The publisher reads the same field when it hands an archetype down the tree
 * (`publish/tree.ts`), so the creation scaffold and the published layout cannot
 * disagree.
 *
 * An explicit property rather than a table keyed on the parent's own archetype: an
 * archetype frames a page and says nothing about its children, and the author is the
 * one who knows whether a page collects posts or notes.
 *
 * Kept out of `rtdb/page-ops.ts` on purpose: that module talks to RTDB and
 * nothing else, and the site code has no business in it.
 */

import { DEFAULT_ARCHETYPE, knownArchetype } from '../publish/render/index.js'
import type { PageRecord } from '../rtdb/types.js'

/**
 * What a new child of this page is created as, or nothing when it is the default.
 *
 * Absent means "inherited" in the record (`rtdb/types.ts`), so writing `kind: 'page'`
 * explicitly would only add noise a reader has to discount. An archetype this build
 * has never heard of is not written either: the scaffold may only create pages whose
 * layout it can name.
 *
 * A page created at root level, or unfiled, has no parent to ask and passes
 * `undefined`, which yields `undefined`.
 */
export function childKindFor(parent: PageRecord | undefined): string | undefined {
	const kind = parent?.childKind
	return kind && knownArchetype(kind) && kind !== DEFAULT_ARCHETYPE ? kind : undefined
}

// `ARCHETYPE_NAMES`, `knownArchetype` and `DEFAULT_ARCHETYPE` all live beside
// `tSiteArchetypeName` in `publish/render/archetypes.ts` — one declaration of the
// closed set, which is what the panel's select, the publisher's layout lookup and
// the creation scaffold above all read.
export {
	ARCHETYPE_NAMES,
	DEFAULT_ARCHETYPE,
	knownArchetype,
	type SiteArchetypeName
} from '../publish/render/index.js'

// vim: ts=4
