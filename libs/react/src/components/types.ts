// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

// Color variants used across components
export type ColorVariant =
	| 'primary'
	| 'secondary'
	| 'accent'
	| 'neutral'
	| 'info'
	| 'error'
	| 'warning'
	| 'success'

// Elevation levels for panels and containers
export type Elevation = 'low' | 'mid' | 'high'

// Common size variants
export type Size = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

// Position variants for positioned elements
export type VerticalPosition = 'top' | 'middle' | 'bottom'
export type HorizontalPosition = 'left' | 'center' | 'right'

// Combined position type for toasts etc.
export type Position = `${VerticalPosition}-${HorizontalPosition}`

// Avatar status types
export type AvatarStatus = 'online' | 'offline' | 'busy' | 'away' | 'pending'

// Avatar sizes: the common scale plus Avatar-only hero sizes
export type AvatarSize = Size | '2xl' | '3xl'

// Avatar shape types (`square`/`rounded` are legacy, kept for compatibility)
export type AvatarShape = 'circle' | 'squircle' | 'square' | 'rounded'

// Avatar ring variants
export type AvatarRing = boolean | 'secondary' | 'success'

// Toast variants
export type ToastVariant = 'success' | 'error' | 'warning' | 'info'

// vim: ts=4
