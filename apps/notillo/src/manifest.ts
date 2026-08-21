// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { AppManifest, IndexRules } from '@cloudillo/core'

import pkg from '../package.json'

/**
 * How the server should index a notillo document for full-text search.
 *
 * Pages (`p`) emit one index row each; blocks (`b`) emit none of their own and
 * fold their text into the body of the page they belong to (`attachTo`). A
 * content match therefore points at a *page*, which is what the `nav=` deep link
 * addresses, not at the whole document.
 *
 * The field codes are `StoredPageRecord` / `StoredBlockRecord` in
 * `src/rtdb/types.ts`; keep the two in step.
 *
 * A block's body is two rules. The first walks the compact inline content once,
 * allowlisting the keys that carry prose: `c` (link and table-cell content),
 * `cells` (a table row), `wt` (a wiki link's page title). Everything else is
 * dropped by omission — hrefs (`l`), wiki-link targets (`wl`), colour codes
 * (`tc`, `bg`, a table cell's `pr.*`), the `"tableContent"` type marker. An
 * allowlist, because a denylist silently indexes whatever key the block schema
 * grows next. `rows` needs no entry: arrays are always descended.
 *
 * The second rule collects tags as `#tag` tokens, matching how the tag cloud
 * reads them. Separate because all rules append to one buffer in declaration
 * order: inlining `tg` would scramble prose reading order, whereas trailing tags
 * belong exactly there.
 *
 * The allowlist structurally cannot reach the style flag: a styled run is stored
 * positionally as `["szöveg", "b"]` (`src/rtdb/transform.ts`), so both slots
 * share one enclosing key and no name can tell them apart. Every flag is a
 * subsequence of `"biusc"`, so `"is"` and `"bus"` are real words that would hit.
 * `prune` below deletes the tuple's tail by *position* before any rule walks the
 * block, which is the one thing `keys` cannot do. `$..c[0:][1:]` covers a block's
 * inline content, a link's `c` and an object-form table cell's `c`;
 * `$..cells[0:][0:][1:]` covers array-form cells, whose content sits one array
 * level deeper. `[1:]` matches nothing on a string or an object, so links, wiki
 * links and tags pass through whole.
 *
 * `[0:]` and not `[*]`: a slice is inert on a non-array, a wildcard descends
 * objects too. A table block keeps `{type:'tableContent', cw, rows}` — an
 * *object* — under the same `c` key an inline block uses for its array, so `[*]`
 * would descend it, reach `rows`, and delete every row but the first.
 *
 * **Editing these rules requires bumping `formatVersion` below.** The server
 * orders the formats it loads by that version and reindexes only when the rules
 * change, so an unbumped edit is invisible wherever the old rules are in effect.
 */
const SEARCH_INDEX_RULES: IndexRules = {
	v: 1,
	parts: [
		// Pages: one searchable row each, linked to their parent so results can
		// show their place in the tree.
		{ kind: 'p', title: ['ti'], tags: ['tg'], parent: 'pp' },
		// Blocks: text folds into the owning page's row, ordered by `o` so the
		// assembled body reads top to bottom. `anchor: 'docId'` records the first
		// matching block's id, which is what a jump-to-block would navigate to.
		{
			kind: 'b',
			attachTo: { kind: 'p', field: 'p' },
			anchor: 'docId',
			order: ['o'],
			// Runs before any body rule, so the `keys` allowlist sees prose only.
			prune: ['$..c[0:][1:]', '$..cells[0:][0:][1:]'],
			body: [
				// One ordered walk, so the assembled body reads as the block does.
				{ path: 'c', extract: 'text', keys: ['c', 'cells', 'wt'] },
				// Tags are metadata, so a separate rule may trail the text.
				{ path: '$..tg', extract: 'string', prefix: '#' },
				// Media blocks keep their text in props, not in a content array.
				'pr.caption',
				'pr.name'
			]
		}
	]
}

// No `islands` declaration here. `documentEmbed` is notillo's own block, but its
// renderer is the shell's own iframe, so it is a built-in: `SITE_BUILTIN_ISLANDS`
// (`libs/core/src/site-islands.ts`) carries it, and built-ins win — `orderedSpecs`
// puts them first and `siteIslandRegistry` keeps the first spec per block type. A
// copy here could never be the one in effect, only a third place to keep in sync.

export const manifest: AppManifest = {
	id: 'notillo',
	name: 'Notillo',
	version: pkg.version,
	kind: 'bundled',
	url: '/apps/notillo/index.html',
	icon: 'book-open',
	description: 'Collaborative wiki and notes',
	contentTypes: [
		{
			mimeType: 'cloudillo/notillo',
			actions: ['view', 'edit', 'create'],
			priority: 'primary',
			importFrom: [{ mimeType: 'text/markdown', label: 'Markdown', extensions: ['.md'] }],
			storeTp: 'RTDB',
			// A hit deep-links to `cl:notillo/<owner>:<fileId>?nav=<pageId>`,
			// which is the launch param `useNotillo` already reads.
			navParam: 'nav',
			// The document format is unchanged; the patch bump records the index
			// rule change. Bundled apps do not register over the wire — their
			// reindex is driven by the bundle's `rules_hash` (backend `format.rs`)
			// — so this version only matters to a packaged copy or an older shell
			// that still PUTs its manifest.
			formatVersion: '1.0.2',
			search: SEARCH_INDEX_RULES
		}
	],
	capabilities: ['rtdb'],
	translations: {
		hu: { description: 'Valós idejű wiki és jegyzetek' }
	}
}

// vim: ts=4
