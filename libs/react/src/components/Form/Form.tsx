// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

import { createComponent } from '../utils.js'

export interface FormProps extends React.FormHTMLAttributes<HTMLFormElement> {
	children?: React.ReactNode
}

/** A plain `<form>`: submit-on-Enter and native validation, no styling of its own */
export const Form = createComponent<HTMLFormElement, FormProps>('Form', (props, ref) => (
	<form ref={ref} {...props} />
))

// vim: ts=4
