// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import type { PageRecord } from '../rtdb/types.js'

interface NotilloEditorContextValue {
	pages: Map<string, PageRecord & { id: string }>
	sourceFileId?: string
}

const NotilloEditorContext = React.createContext<NotilloEditorContextValue>({
	pages: new Map()
})

export const NotilloEditorProvider = NotilloEditorContext.Provider

export function useNotilloEditor() {
	return React.useContext(NotilloEditorContext)
}

// vim: ts=4
