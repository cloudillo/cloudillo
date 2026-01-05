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

export { usePrezilloDocument } from './usePrezilloDocument'
export type { UsePrezilloDocumentResult } from './usePrezilloDocument'

export { useViewObjects, useViewObjectIds, useVisibleViewObjects } from './useViewObjects'
export { useVisibleViews } from './useVisibleViews'
export { useViews } from './useViews'
export { useSnappingConfig, useGetParent, useSnapSettings } from './useSnappingConfig'
export type { SnapSettings, UseSnapSettingsResult } from './useSnappingConfig'

export { useImageHandler } from './useImageHandler'
export type { UseImageHandlerOptions } from './useImageHandler'

export { usePalette, usePaletteValue } from './usePalette'
export type { UsePaletteReturn } from './usePalette'

export { useTemplateGuides, guideToSnapTargets } from './useTemplateGuides'
export type { UseTemplateGuidesResult } from './useTemplateGuides'

export { useTemplateObjects } from './useTemplateObjects'
export type { TemplateEditingContext } from './useTemplateObjects'

export { useTemplates } from './useTemplates'
export type { TemplateWithUsage, UseTemplatesResult } from './useTemplates'

export { useLockableProperty } from './useLockableProperty'
export type { UseLockablePropertyResult } from './useLockableProperty'

// vim: ts=4
