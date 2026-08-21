// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Slugs for published pages.
 *
 * A page may carry a fixed `slug`; most do not, and their slug is derived from
 * the title here. The lifecycle around that — freeze the derived value on first
 * publish, keep it thereafter — lives in `publish/index.ts`, which is the only
 * place that knows a publish succeeded.
 */

import { RESERVED_CONTAINER_ROOTS, SITE_ROOT_PATH } from '@cloudillo/core'

/** Longest slug we emit. Long enough to stay readable, short enough for a URL. */
export const MAX_SLUG_LENGTH = 64

/** What a slug typed by hand may contain. */
const SLUG_PATTERN = /^[a-z0-9-]+$/

/**
 * A title reduced to an ASCII URL segment: accents folded, everything else
 * collapsed to a single dash.
 *
 * NFD then stripping the combining marks (as `\p{M}` — never a literal
 * `U+0300`–`U+036F` range, see `siteTagSlug`) folds `Árvíztűrő tükörfúrógép` to
 * `arvizturo-tukorfurogep` instead of dropping the accented letters. What is left is
 * constrained to `[a-z0-9]`, so a script with no Latin decomposition folds away
 * entirely and the page falls back to its pageId in `baseSlug`.
 *
 * Why ASCII at all: `siteTagSlug` in `libs/core/src/site.ts` owns that argument.
 */
export function slugify(title: string): string {
	const slug = title
		.normalize('NFD')
		.replace(/\p{M}/gu, '')
		.toLowerCase()
		.replace(/['’]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, MAX_SLUG_LENGTH)
		.replace(/-+$/, '')
	return slug
}

/** Why a hand-typed slug is not usable, for the property panel to phrase. */
export type SlugProblem = 'chars' | 'edges'

/**
 * Check a slug the author typed; `undefined` means it is fine. Reports rather than
 * normalises — a field that rewrites what was typed under the author is worse.
 */
export function slugProblem(slug: string): SlugProblem | undefined {
	if (!SLUG_PATTERN.test(slug)) return 'chars'
	if (slug.startsWith('-') || slug.endsWith('-')) return 'edges'
	return undefined
}

/**
 * Which names a page may not mint for itself, which depends on how deep it sits.
 *
 * At the container root the whole of `RESERVED_CONTAINER_ROOTS` is off limits: the
 * container writes tag entries and `SITE_NOT_FOUND_ENTRY` into `files` *after* the
 * page loop, so a top-level page that minted `404` would have its fragment silently
 * replaced. Deeper down only `index` is reserved — `blog/404.part.html` collides with
 * nothing, while `blog/index.part.html` is still that directory's root.
 */
function isReserved(slug: string, atContainerRoot: boolean): boolean {
	return atContainerRoot ? RESERVED_CONTAINER_ROOTS.includes(slug) : slug === SITE_ROOT_PATH
}

/**
 * A stored slug reduced to something emittable, or `''` when nothing survives.
 *
 * A conforming value passes through apart from the length cap, which `slugProblem`
 * does not check — the panel must not refuse a long slug mid-typing, but the
 * container must not carry one. Anything else folds through `slugify`, turning a
 * stored `a/b` into `a-b` and `../../x` into `x` rather than letting either reach a
 * path.
 */
function storedSlug(stored: string | undefined): string {
	if (!stored) return ''
	if (slugProblem(stored)) return slugify(stored)
	return stored.slice(0, MAX_SLUG_LENGTH).replace(/-+$/, '')
}

/**
 * The name a page asks for: its stored slug folded into something emittable, or
 * failing that its title, or failing that its pageId.
 *
 * Before the reserved guard and the sibling dedup, which is what makes it the right
 * value for the publish gate to judge: `uniqueSlug` renames a page asking for a
 * reserved name, so a gate reading the *resolved* slug would go silent on exactly
 * the condition it exists to report.
 */
export function baseSlug(pageId: string, title: string, slug: string | null | undefined): string {
	return storedSlug(slug?.trim()) || slugify(title) || pageId.toLowerCase()
}

/**
 * The slug for one page, made unique among its siblings.
 *
 * `taken` holds the slugs already used under this parent, updated in place.
 * Collisions get a numeric suffix rather than being dropped — two pages genuinely
 * can share a title, and losing one silently is the worse failure.
 *
 * **Every value this returns matches `SLUG_PATTERN`**, whatever was stored. The
 * property panel is the only *writer* that checks, so a slug that reached the record
 * another way arrives here unchecked — and a stored `a/b` would escape the sibling
 * dedup (`taken` compares whole slugs) and then collide in the container's `files`
 * map, silently replacing another page's fragment. The pageId fallback is lowercased
 * for the same reason: `shortId` draws from `[0-9a-zA-Z]`, which `SLUG_PATTERN` does
 * not admit. The gate reports the same condition against the *stored* value; this is
 * the net under that, not a substitute for it.
 *
 * `atContainerRoot` says which reserved set applies — see `isReserved`.
 */
export function uniqueSlug(
	pageId: string,
	title: string,
	slug: string | null | undefined,
	taken: Set<string>,
	atContainerRoot: boolean
): string {
	const base = baseSlug(pageId, title, slug)
	// The suffix loop below re-derives from `base`, not from `candidate`, so `404`
	// becomes `404-page` and a further collision gives `404-2` — neither reserved.
	let candidate = isReserved(base, atContainerRoot) ? `${base}-page` : base
	for (let n = 2; taken.has(candidate); n++) {
		candidate = `${base}-${n}`
	}
	taken.add(candidate)
	return candidate
}

// vim: ts=4
