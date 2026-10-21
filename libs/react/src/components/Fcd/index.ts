// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { FcdContainer } from './FcdContainer.js'
import { FcdContent } from './FcdContent.js'
import { FcdDetails } from './FcdDetails.js'
import { FcdFilter } from './FcdFilter.js'

export * from './FcdContainer.js'
export * from './FcdContent.js'
export * from './FcdDetails.js'
export * from './FcdFilter.js'

// Compound export for backward compatibility
export const Fcd = {
	Container: FcdContainer,
	Filter: FcdFilter,
	Content: FcdContent,
	Details: FcdDetails
}

// vim: ts=4
