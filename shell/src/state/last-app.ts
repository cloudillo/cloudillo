// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { atomWithStorage } from 'jotai/utils'

/**
 * The app last launched from the rail's "Other" popover, surfaced as an extra rail
 * slot so a one-off trip into the overflow doesn't have to be repeated.
 *
 * Per-device and global across contexts, like `recentContextsAtom`: syncing it would
 * need a `SettingDefinition` in the backend for something a second device has no
 * opinion about anyway.
 */
export const lastAppAtom = atomWithStorage<string | null>('cloudillo:last-app', null)

// vim: ts=4
