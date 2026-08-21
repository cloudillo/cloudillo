// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Every manifest this build ships, checked as one set.
 *
 * A manifest is hand-written data the compiler only checks shallowly, and a typo in
 * one degrades silently: the server rejects the registration and the app's documents
 * stay findable by name only. `formatVersion` is the sharpest edge — it is declared
 * `T.optional(T.string)`, so `'1.0'`, `'v1.0.0'` and `'01.0.0'` all typecheck while
 * `encodeFormatVersion` rejects them, and the only production caller registers
 * fire-and-forget inside a `try/catch`.
 *
 * The shell is the one place that sees every manifest at once, so it is also the only
 * place the cross-app invariants — unique ids, one primary claimant per MIME type,
 * the `cloudillo/<id>` convention — are checkable at all.
 */

import type { AppManifest, ContentTypeHandler } from '@cloudillo/types'
import { encodeFormatVersion, tAppManifest } from '@cloudillo/types'
import * as T from '@symbion/runtype'

import { bundledManifests } from '../bundled-manifests.js'
import { shellManifests } from '../shell-manifests.js'

const manifests: AppManifest[] = [...shellManifests, ...bundledManifests]

/** Every `[manifest, contentType]` pair, flattened for `test.each`. */
const contentTypes: Array<[string, ContentTypeHandler, AppManifest]> = manifests.flatMap((m) =>
	(m.contentTypes ?? []).map(
		(ct) => [`${m.id} ${ct.mimeType}`, ct, m] as [string, ContentTypeHandler, AppManifest]
	)
)

describe.each(manifests.map((m) => [m.id, m] as const))('%s', (_id, manifest) => {
	test('decodes against the shared validator', () => {
		const result = T.decode(tAppManifest, manifest)
		// Compare against `[]` rather than asserting `isOk`, so a failure reports the
		// validator's own path and message instead of a bare `false`.
		expect(T.isOk(result) ? [] : result.err).toEqual([])
	})

	// Internal apps are shell routes, not *illo apps — the viewer claims `image/*` and
	// `application/pdf`, which are nobody's namespace.
	if (manifest.kind !== 'internal') {
		test('claims its own MIME namespace', () => {
			const own = (manifest.contentTypes ?? [])
				.map((ct) => ct.mimeType)
				.filter((mimeType) => mimeType.startsWith('cloudillo/'))
			// The file-to-app mapping is by MIME type, so a mismatch here hands the
			// app's own documents to whichever app the string does name.
			expect(own).toEqual(own.map(() => `cloudillo/${manifest.id}`))
		})
	}
})

test('every app id is unique', () => {
	const ids = manifests.map((m) => m.id)
	expect(ids).toEqual(Array.from(new Set(ids)))
})

test('no MIME type has two primary claimants', () => {
	// Several apps may declare the same MIME type — `buildMimeMap` in
	// `manifest-registry.ts` lets `priority: 'primary'` win. Two of them would make
	// the winner depend on manifest order.
	const primary = contentTypes
		.filter(([, ct]) => ct.priority === 'primary')
		.map(([, ct]) => ct.mimeType)
	expect(primary).toEqual(Array.from(new Set(primary)))
})

describe.each(contentTypes)('%s', (_label, ct, manifest) => {
	if (ct.formatVersion != null) {
		test('declares an encodable format version, distinct from the app version', () => {
			expect(() => encodeFormatVersion(ct.formatVersion!)).not.toThrow()
			// The app version moves every release, the format version only when the
			// search contract does. Equal means one was pasted for the other, and the
			// server would reindex on every release.
			expect(ct.formatVersion).not.toBe(manifest.version)
		})
	}

	if (ct.search) {
		test('says where its documents live', () => {
			// Without it the indexer has no way to read a document of this type.
			expect(ct.storeTp).toBeDefined()
		})
	}
})

// vim: ts=4
