// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

export const HOME_CONTEXT = '~'

// The platform's default community offered during onboarding.
export const DEFAULT_COMMUNITY_ID_TAG = 'cloudillo.net'

// No section list belongs here: the route tree (`ShellRoutes` in `shell/src/layout.tsx`)
// is the only place a section name is written down, and `isContextSegment` in `routes.ts`
// recognises a context segment by its `@` sigil without one.
