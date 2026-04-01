// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Hook for getting template prototype objects when in template editing mode.
 * Returns objects with computed positions for rendering on a virtual template canvas.
 */

import * as React from 'react'
import { useY } from 'react-yjs'

import type { Gradient } from '@cloudillo/canvas-tools'
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
	backgroundGradient?: Gradient
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
