// This file is part of the Cloudillo Platform.
// Copyright (C) 2024  Szilárd Hajba
//
// Cloudillo is free software: you can redistribute it and/or modify
// it under the terms of the GNU Lesser General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Lesser General Public License for more details.
//
// You should have received a copy of the GNU Lesser General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

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
