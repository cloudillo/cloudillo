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

// Color variants used across components
export type ColorVariant = 'primary' | 'secondary' | 'accent' | 'error' | 'warning' | 'success'

// Container color variants (for backgrounds)
export type ContainerColorVariant =
	| 'container-primary'
	| 'container-secondary'
	| 'container-accent'
	| 'container-error'
	| 'container-warning'
	| 'container-success'

// Elevation levels for panels and containers
export type Elevation = 'low' | 'mid' | 'high'

// Common size variants
export type Size = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

// Button size variants
export type ButtonSize = 'small' | 'default' | 'large'

// Position variants for positioned elements
export type VerticalPosition = 'top' | 'middle' | 'bottom'
export type HorizontalPosition = 'left' | 'center' | 'right'

// Combined position type for toasts etc.
export type Position = `${VerticalPosition}-${HorizontalPosition}`

// Avatar status types
export type AvatarStatus = 'online' | 'offline' | 'busy' | 'away'

// Avatar shape types
export type AvatarShape = 'circle' | 'square' | 'rounded'

// Avatar ring variants
export type AvatarRing = boolean | 'secondary' | 'success'

// Toast variants
export type ToastVariant = 'success' | 'error' | 'warning' | 'info'

// vim: ts=4
