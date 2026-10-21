// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import type { PageDL } from '../display-list.js'
import type { Fx } from '../fixed.js'
import type { Box, StyleDef, Story } from '../model.js'
import { type ItemizeEnv, itemizeParagraph } from '../text/itemize.js'
import { fillRegion } from './fill.js'

/**
 * Lay out one story into one region rectangle, page after page. Synchronous: call
 * `initHarfBuzz()` and `loadParagraphFaces(story.paragraphs, …)` first. `pubLang` is the
 * publication language used when a paragraph style sets none.
 */
export function layoutStory(
	story: Story,
	styles: Record<string, StyleDef>,
	region: Box,
	page: { w: Fx; h: Fx },
	env: ItemizeEnv,
	pubLang = ''
): PageDL[] {
	const paras = story.paragraphs.map((p) => itemizeParagraph(p, styles, env, pubLang))
	return fillRegion(story, paras, region, page, env)
}
