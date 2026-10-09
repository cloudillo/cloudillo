// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The island registry — the half of it that is React-free and DOM-free.
 *
 * A published page is inert static HTML apart from **marked elements**, which the
 * shell mounts a live component into:
 *
 * ```html
 * <div data-cl-block="documentEmbed" data-cl-id="b7" data-props='{"fileId":"…"}'>
 *   <!-- static placeholder: correct dimensions, crawler-visible -->
 * </div>
 * ```
 *
 * Three jobs in three places: *declare* (built-ins below, or `contentTypes[].islands`
 * in an app manifest), *serialize* (here plus the publisher's serializer, at publish
 * time) and *render* (`shell/src/site/island-registry.tsx`, at view time). An
 * app-declared island renders through a shell-provided app iframe, so no foreign code
 * enters the shell bundle.
 *
 * The runtype validators live in `@cloudillo/types` because `tAppManifest` references
 * them; re-exported here so `@cloudillo/core` is the one import surface.
 */

import type { SiteIslandSpec } from '@cloudillo/types'
import * as T from '@symbion/runtype'

import type { SiteSourceBlock } from './site.js'
import { escapeHtml, tAnyValue } from './site.js'

export type {
	SiteIslandKind,
	SiteIslandRules,
	SiteIslandShape,
	SiteIslandSpec
} from '@cloudillo/types'
export {
	tSiteIslandKind,
	tSiteIslandRules,
	tSiteIslandShape,
	tSiteIslandSpec
} from '@cloudillo/types'

// ── The marked element ──
//
// The shell's island runtime scans for exactly these three names. Never spell one
// at a use site: the serializer that writes them and the shell that reads them are
// in different packages and must not be able to drift apart.

/** Long block type of the island, which is what the component table is keyed by. */
export const SITE_ISLAND_BLOCK_ATTR = 'data-cl-block'

/**
 * The block's own id, which gives the shell a portal key that survives a content
 * swap — the same block in a re-fetched page keeps the same island.
 */
export const SITE_ISLAND_ID_ATTR = 'data-cl-id'

/** JSON props, baked at publish time. Scalars only; see `siteIslandProps`. */
export const SITE_ISLAND_PROPS_ATTR = 'data-props'

/** CSS selector matching every island on a published page. */
export const SITE_ISLAND_SELECTOR = `[${SITE_ISLAND_BLOCK_ATTR}]`

// ── Built-in declarations ──

/**
 * The block types every content type may carry, declared in code rather than in a
 * manifest because their renderers are the shell's own.
 *
 * `image` is the odd one: `enhance`, so the `<img>` the serializer emitted stays put
 * — it lays out with JS off — and mounting only attaches lightbox behaviour. The
 * other three are `replace`, and carry no `props` list because their props come from
 * resolving `cl-file:` references against a file's renditions, which no declaration
 * can express. `documentEmbed` is declared the way an app would declare one.
 */
export const SITE_BUILTIN_ISLANDS: readonly SiteIslandSpec[] = [
	{ blockType: 'image', kind: 'enhance', shape: 'media' },
	{ blockType: 'video', kind: 'replace', shape: 'media' },
	{ blockType: 'audio', kind: 'replace', shape: 'media' },
	{
		blockType: 'documentEmbed',
		kind: 'replace',
		shape: 'box',
		labelFrom: 'pr.name',
		heightFrom: 'pr.height',
		props: [
			'fileId',
			'name',
			'contentType',
			'appId',
			'navState',
			'width',
			'align',
			'height',
			'sizing',
			'scale',
			'maxH',
			'textScale',
			'lastW',
			'lastH',
			'kind'
		]
	}
]

/** Built-ins first, then declarations in manifest order — the one precedence rule. */
function orderedSpecs(declared?: readonly SiteIslandSpec[]): SiteIslandSpec[] {
	return [...SITE_BUILTIN_ISLANDS, ...(declared ?? []).filter((spec) => spec.blockType)]
}

/**
 * Every island declaration in effect, keyed by block type.
 *
 * **Built-ins win.** A manifest may add block types this build does not know, and
 * may not redefine one it does: an app that could flip `image` from `enhance` to
 * `replace` would be deciding how the site owner's own page is mounted.
 *
 * **Among declared specs, the first in manifest order wins** — hence the `has` guard
 * rather than a plain `set`. Two apps may declare the same `blockType`, and `appId` is
 * stamped per manifest, so picking differently hands app B's iframe the props app A's
 * declaration described.
 */
export function siteIslandRegistry(
	declared?: readonly SiteIslandSpec[]
): Map<string, SiteIslandSpec> {
	const registry = new Map<string, SiteIslandSpec>()
	for (const spec of orderedSpecs(declared)) {
		if (!registry.has(spec.blockType)) registry.set(spec.blockType, spec)
	}
	return registry
}

/**
 * The declaration for one block type, or nothing if it is not an island.
 *
 * The falsy-`blockType` skip in `orderedSpecs` matters here too — an app that
 * declares an empty block type must not become the answer for `''`.
 */
export function siteIslandSpec(
	blockType: string,
	declared?: readonly SiteIslandSpec[]
): SiteIslandSpec | undefined {
	return orderedSpecs(declared).find((spec) => spec.blockType === blockType)
}

// ── Props ──

/** What one island carries into the markup. */
export interface SiteIsland {
	blockType: string
	/** The block's id; the value of `data-cl-id`. */
	blockId: string
	props: Record<string, unknown>
}

/**
 * A dot path read out of a block record, e.g. `pr.name`. Nothing rather than a throw
 * on a path that does not resolve — that case is normal, not an error.
 *
 * `Object.hasOwn` at every step: the path comes from an app *manifest*, i.e. data off
 * the wire, so `labelFrom: 'pr.constructor.name'` would otherwise walk into
 * `Object.prototype` and hand a placeholder a value the block never carried.
 */
export function siteBlockProp(block: SiteSourceBlock, path: string): unknown {
	let value: unknown = block
	for (const segment of path.split('.')) {
		const step = T.decode(T.unknownObject, value)
		if (!T.isOk(step) || !Object.hasOwn(step.ok, segment)) return undefined
		value = (step.ok as Record<string, unknown>)[segment]
	}
	return value
}

/**
 * `data-props` holds JSON a browser parses and a component renders, so only scalars
 * get through — an object or array would let a declaration smuggle a structure the
 * renderer never expected, and no island prop needs one.
 */
const tSiteIslandPropValue = T.union(T.string, T.number, T.boolean)

function scalar(value: unknown): string | number | boolean | undefined {
	// `Number.isFinite` on top of the decode: `T.number` accepts `Infinity`, which
	// `JSON.stringify` turns into `null` — not a scalar by the time the shell reads it.
	const decoded = T.decode(tSiteIslandPropValue, value)
	if (!T.isOk(decoded)) return undefined
	return typeof decoded.ok === 'number' && !Number.isFinite(decoded.ok) ? undefined : decoded.ok
}

/**
 * A positive integer, or nothing — the one shape every numeric island dimension has.
 * **Coercing**, so a stored `"320"` is not collapsed to an intrinsic size.
 *
 * One definition for publisher and shell alike: a second one that did not coerce
 * made images jump on mount.
 *
 * Hand-written rather than a decode, because runtype's `.min()` runs only through the
 * async `T.validate` — `T.decode(T.number.min(1), 0)` answers `ok(0)`.
 */
export function sitePositiveInt(value: unknown): number | undefined {
	const num = Number(value)
	return Number.isFinite(num) && num > 0 ? Math.round(num) : undefined
}

/**
 * The props a declaration names, read off the block's own `pr` map.
 *
 * Copied out as they are. A prop that ends up in an `href`/`src` of the shell's own
 * DOM is checked where it lands — `site/island-registry.tsx` and
 * `site/island-components.tsx` — because that is the only side that knows which key
 * of which island becomes a URL; the container validator can see the `data-props`
 * attribute but not the JSON inside it.
 */
export function siteIslandProps(
	spec: SiteIslandSpec,
	block: SiteSourceBlock
): Record<string, unknown> {
	const props: Record<string, unknown> = {}
	for (const name of spec.props ?? []) {
		const value = scalar(block.pr?.[name])
		if (value !== undefined) props[name] = value
	}
	return props
}

/**
 * The placeholder parameters a declaration points at. The shape itself is rendered
 * by the serializer, the only side with an opinion about HTML.
 */
export interface SiteIslandPlaceholder {
	label?: string
	height?: number
	poster?: string
}

export function siteIslandPlaceholder(
	spec: SiteIslandSpec,
	block: SiteSourceBlock
): SiteIslandPlaceholder {
	const placeholder: SiteIslandPlaceholder = {}

	const label = spec.labelFrom === undefined ? undefined : siteBlockProp(block, spec.labelFrom)
	if (typeof label === 'string' && label) placeholder.label = label

	const height = spec.heightFrom === undefined ? undefined : siteBlockProp(block, spec.heightFrom)
	const px = sitePositiveInt(height)
	if (px !== undefined) placeholder.height = px

	const poster = spec.posterFrom === undefined ? undefined : siteBlockProp(block, spec.posterFrom)
	if (typeof poster === 'string' && poster) placeholder.poster = poster

	return placeholder
}

// ── Attributes ──

/**
 * The three attributes that mark an island, ready to splice into an opening tag —
 * leading space included, so a caller concatenates without thinking about it.
 *
 * `data-props` is written even when empty: its absence would be indistinguishable
 * from a serializer that predates the props contract, and the shell would have to
 * guess. An empty object is unambiguous.
 */
export function renderSiteIslandAttrs(island: SiteIsland): string {
	return (
		` ${SITE_ISLAND_BLOCK_ATTR}="${escapeHtml(island.blockType)}"` +
		` ${SITE_ISLAND_ID_ATTR}="${escapeHtml(island.blockId)}"` +
		` ${SITE_ISLAND_PROPS_ATTR}="${escapeHtml(JSON.stringify(island.props ?? {}))}"`
	)
}

/**
 * The reverse, for the shell reading a marked element back. Never throws: a malformed
 * attribute costs that island its component, not the page.
 */
export function parseSiteIslandProps(json: unknown): Record<string, unknown> | undefined {
	if (typeof json !== 'string' || !json) return undefined
	let parsed: unknown
	try {
		parsed = JSON.parse(json)
	} catch {
		return undefined
	}
	// The envelope only. `T.record(tSiteIslandPropValue)` would refuse the whole map
	// over one bad entry, and the promise here is the opposite: a malformed value
	// costs itself, never the island beside it.
	const envelope = T.decode(T.record(tAnyValue), parsed)
	if (!T.isOk(envelope)) return undefined

	const props: Record<string, unknown> = {}
	for (const [key, value] of Object.entries(envelope.ok)) {
		const s = scalar(value)
		if (s !== undefined) props[key] = s
	}
	return props
}

// vim: ts=4
