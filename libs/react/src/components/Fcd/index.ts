// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { FcdContainer } from './FcdContainer.js'
import { FcdFilter } from './FcdFilter.js'
import { FcdContent } from './FcdContent.js'
import { FcdDetails } from './FcdDetails.js'

export { FcdContainer } from './FcdContainer.js'
export { FcdFilter } from './FcdFilter.js'
export { FcdContent } from './FcdContent.js'
export { FcdDetails } from './FcdDetails.js'

export type { FcdContainerProps } from './FcdContainer.js'
export type { FcdFilterProps } from './FcdFilter.js'
export type { FcdContentProps } from './FcdContent.js'
export type { FcdDetailsProps } from './FcdDetails.js'

// Compound export for backward compatibility
export const Fcd = {
	Container: FcdContainer,
	Filter: FcdFilter,
	Content: FcdContent,
	Details: FcdDetails
}

// vim: ts=4
