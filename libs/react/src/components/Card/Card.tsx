// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { renderSurface, type SurfaceProps } from '../Panel/Panel.js'
import { createComponent } from '../utils.js'

export interface CardProps extends SurfaceProps {
	/** Hover styling only; prefer `href`/`onClick`, which make the card a link/button */
	interactive?: boolean
}

export const Card = createComponent<HTMLDivElement, CardProps>(
	'Card',
	({ interactive, ...props }, ref) => renderSurface('c-card', 3, 'base', props, ref, interactive)
)

// vim: ts=4
