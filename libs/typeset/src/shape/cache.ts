// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { FontRef } from '../display-list.js'
import type { Fx } from '../fixed.js'
import { type ShapeOptions, type ShapedRun, shapeRun } from './hb.js'

/** Plain LRU: a Map re-inserted on every hit, oldest key evicted first. */
export class LruCache<K, V> {
	private map = new Map<K, V>()

	constructor(private max: number) {}

	get(key: K): V | undefined {
		const v = this.map.get(key)
		if (v !== undefined) {
			this.map.delete(key)
			this.map.set(key, v)
		}
		return v
	}

	set(key: K, value: V): void {
		this.map.delete(key)
		this.map.set(key, value)
		if (this.map.size > this.max) this.map.delete(this.map.keys().next().value as K)
	}
}

/**
 * `shapeRun` behind an LRU keyed `(sha256, size, features, lang, direction, text)`.
 * The returned arrays are shared between hits — callers must not mutate them.
 */
export function createShapeCache(max = 16384): typeof shapeRun {
	const cache = new LruCache<string, ShapedRun>(max)
	return (ref: FontRef, sizeFx: Fx, text: string, opts: ShapeOptions = {}) => {
		const key = `${ref.sha256}|${sizeFx}|${(opts.features ?? []).join(',')}|${opts.lang ?? ''}|${opts.direction ?? ''}|${text}`
		let run = cache.get(key)
		if (!run) {
			run = shapeRun(ref, sizeFx, text, opts)
			cache.set(key, run)
		}
		return run
	}
}
