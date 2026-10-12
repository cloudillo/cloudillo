// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Ids of the Y.Doc maps. Plain string aliases (not branded): ids come straight out of
 * `Y.Map` keys, so a brand would only add casts at every call site.
 *
 * Main-thread only (imports the `@cloudillo/core` barrel); worker-bound modules
 * (`stored-types`, `runtime-types`, `type-converters`) must not import this file.
 */

export type StyleId = string
export type MasterId = string
export type SectionId = string
export type StoryId = string
export type FrameId = string
export type RegionId = string

export { randomId as newId } from '@cloudillo/core'

// vim: ts=4
