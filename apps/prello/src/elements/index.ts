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

import { PrelloElement, ElementProps, ElementEditProps } from '../types'

import * as label from './label'

interface Element<E extends PrelloElement> {
	Component: (props: ElementProps<E>) => JSX.Element
	EditComponent: (props: ElementEditProps<E>) => JSX.Element
	EditGadget: (props: ElementEditProps<E>) => JSX.Element
}

const elements: Record<string, Element<any>> = {
	label: {
		Component: label.Label,
		EditComponent: label.EditLabel,
		EditGadget: label.EditLabelGadget
	}
}

// vim: ts=4
