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

/**
 * React hooks exports
 */

export { usePrelloDocument } from './usePrelloDocument'
export type { UsePrelloDocumentResult } from './usePrelloDocument'

export { useViewObjects, useViewObjectIds } from './useViewObjects'
export { useLayers, useLayerIds } from './useLayers'
export { useViews, useView, useViewIds } from './useViews'
export { useSnappingConfig, useGetParent, useSnapSettings } from './useSnappingConfig'
export type { SnapSettings, UseSnapSettingsResult } from './useSnappingConfig'

// vim: ts=4
