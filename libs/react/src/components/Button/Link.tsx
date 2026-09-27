// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

import { createComponent } from '../utils.js'
import { Button, type LabeledButtonProps } from './Button.js'

export interface LinkProps extends Omit<LabeledButtonProps, 'variant' | 'href'> {
	href: string
}

/** Text link — Button `variant="link"` with a required `href` */
export const Link = createComponent<HTMLAnchorElement, LinkProps>('Link', (props, ref) => (
	<Button {...props} variant="link" ref={ref as React.Ref<HTMLButtonElement>} />
))

// vim: ts=4
