// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * Semver of `@cloudillo/typeset`, written to publication meta (`m.engine`).
 * Layout output may only change together with this version, and the pinned
 * shaping / UAX#14 / hyphenation data below are part of it.
 * Keep in sync with package.json (version and the exact dependency pins).
 */
export const ENGINE_VERSION = '0.8.20'

/** Exact versions of the data-bearing dependencies this engine was built against. */
export const ENGINE_DEPS = {
	harfbuzzjs: '1.6.3',
	'bidi-js': '1.1.0',
	linebreak: '1.1.0',
	hyphen: '1.14.1'
} as const
