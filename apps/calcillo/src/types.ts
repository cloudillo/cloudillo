// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

export type PrelloElement = Record<string, never>

export interface PrelloElementState {
	bbox: { x: number; y: number; width: number; height: number }
}

export interface ElementProps<E extends PrelloElement, _S = undefined> {
	element: E
	//state: S
	//setState: React.Dispatch<React.SetStateAction<S>>
	onClick?: (evt: React.MouseEvent<SVGGraphicsElement>) => void
}

export interface ElementEditProps<E extends PrelloElement, S = undefined>
	extends ElementProps<E, S> {
	//setElement: React.Dispatch<React.SetStateAction<E>>
	setElement: (element: E) => void
}

// vim: ts=4
