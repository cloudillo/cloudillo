// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { atom } from 'jotai'

/** The `content` object of a `POST`/`LDOC` minus the commentary — exactly what an
 * editor knows about its own document. `parseLiveDocContent` splits `doc` into
 * `srcIdTag`/`fileId`, so this needs no further shape. */
export interface DocPostIntent {
	doc: string
	contentType: string
	title?: string
}

/** Set by a non‑feed surface (the editor's doc bar, via the `feed:post` bus
 * command) to request the feed app open its composer with that document already
 * attached. FeedApp consumes and clears it (one‑shot, so the back button doesn't
 * re‑trigger). */
export const pendingDocPostAtom = atom<DocPostIntent | undefined>(undefined)

// vim: ts=4
