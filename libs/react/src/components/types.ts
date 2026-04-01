// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

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
export type ButtonSize = 'compact' | 'small' | 'default' | 'large'

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
