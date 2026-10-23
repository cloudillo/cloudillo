// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

export const HOME_CONTEXT = '~'

// No section list belongs here: the route tree (`ShellRoutes` in `shell/src/layout.tsx`)
// is the only place a section name is written down, and `isContextSegment` in `routes.ts`
// recognises a context segment by its `@` sigil without one.
