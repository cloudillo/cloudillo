// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

import type { ListingPage } from '../publish/listing.js'
import type { PageRecord } from '../rtdb/types.js'

interface NotilloEditorContextValue {
	pages: Map<string, PageRecord & { id: string }>
	/**
	 * `pages` adapted to `selectListing`'s input, built once per snapshot.
	 *
	 * Here rather than inside the block because K `index` blocks on a page would
	 * otherwise each build their own copy of the whole page set, and because
	 * `selectListing` memoizes its parent→children index on the array's *identity* —
	 * which only holds if every block is handed the same array.
	 */
	listingPages: readonly ListingPage[]
	sourceFileId?: string
	/** The page being edited — what an `index` block lists relative to. */
	pageId?: string
	/** Tenant owning the document's files, for resolving a listed page's social image. */
	ownerTag?: string
	/** The document's access token, so a non-Public image still loads in the preview. */
	token?: string
	/**
	 * The page served at the mount root, if this document has one.
	 *
	 * A listing needs it: the published tree folds the home page's own children and
	 * the top-level pages into one bucket, so which bucket a page is listed under
	 * depends on it (`listingParentId` in `publish/listing.ts`). Without it an
	 * `index` block on the home page reads "Nothing to list yet" here and lists the
	 * whole site once published.
	 */
	homePageId?: string
	/** Write access to the document, whether or not the editor is currently interactive */
	canWrite?: boolean
}

const NotilloEditorContext = React.createContext<NotilloEditorContextValue>({
	pages: new Map(),
	listingPages: []
})

export const NotilloEditorProvider = NotilloEditorContext.Provider

export function useNotilloEditor() {
	return React.useContext(NotilloEditorContext)
}

// vim: ts=4
