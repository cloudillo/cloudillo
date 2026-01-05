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
 * Hook for getting template prototype objects when in template editing mode.
 * Returns objects with computed positions for rendering on a virtual template canvas.
 */

import * as React from 'react'
import { useY } from 'react-yjs'

import type { TemplateId, YPrezilloDocument, PrezilloObject } from '../crdt'
import { getTemplatePrototypeObjects, getTemplate } from '../crdt'

export interface TemplateEditingContext {
	/** Objects to render (prototype objects) */
	objects: PrezilloObject[]
	/** Template dimensions for canvas bounds */
	templateWidth: number
	templateHeight: number
	/** Template background */
	backgroundColor?: string
	backgroundGradient?: any
}

/**
 * Get all prototype objects for a template, positioned for rendering.
 * Used when in template editing mode.
 */
export function useTemplateObjects(
	doc: YPrezilloDocument,
	templateId: TemplateId | null
): TemplateEditingContext | null {
	const objects = useY(doc.o)
	const templates = useY(doc.tpl)
	const prototypeArrays = useY(doc.tpo)

	return React.useMemo(() => {
		if (!templateId) return null

		const template = getTemplate(doc, templateId)
		if (!template) return null

		const prototypeObjects = getTemplatePrototypeObjects(doc, templateId)

		return {
			objects: prototypeObjects,
			templateWidth: template.width,
			templateHeight: template.height,
			backgroundColor: template.backgroundColor,
			backgroundGradient: template.backgroundGradient
		}
	}, [doc, objects, templates, prototypeArrays, templateId])
}

// vim: ts=4
