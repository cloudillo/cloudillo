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
 * Hook for getting all templates with usage data for the templates row.
 */

import * as React from 'react'
import { useY } from 'react-yjs'

import type { TemplateId, YPrezilloDocument, Template, PrezilloObject } from '../crdt'
import { getAllTemplates, getViewsUsingTemplate, getTemplatePrototypeObjects } from '../crdt'

export interface TemplateWithUsage extends Template {
	/** Number of views using this template */
	usageCount: number
	/** Number of prototype objects in this template */
	objectCount: number
}

export interface UseTemplatesResult {
	/** All templates with usage data */
	templates: TemplateWithUsage[]
	/** Get usage count for a specific template */
	getTemplateUsageCount: (templateId: TemplateId) => number
	/** Get prototype objects for a specific template */
	getTemplateObjects: (templateId: TemplateId) => PrezilloObject[]
}

/**
 * Get all templates with usage information.
 * Used for rendering the templates row on the canvas.
 */
export function useTemplates(doc: YPrezilloDocument): UseTemplatesResult {
	const templates = useY(doc.tpl)
	const views = useY(doc.v)
	const prototypeArrays = useY(doc.tpo)

	// Compute templates with usage data
	const templatesWithUsage = React.useMemo(() => {
		const allTemplates = getAllTemplates(doc)

		return allTemplates.map((template): TemplateWithUsage => {
			const usageCount = getViewsUsingTemplate(doc, template.id).length
			const objectCount = getTemplatePrototypeObjects(doc, template.id).length

			return {
				...template,
				usageCount,
				objectCount
			}
		})
	}, [doc, templates, views, prototypeArrays])

	// Helper to get usage count for a template
	const getTemplateUsageCount = React.useCallback(
		(templateId: TemplateId): number => {
			return getViewsUsingTemplate(doc, templateId).length
		},
		[doc, views]
	)

	// Helper to get prototype objects for a template
	const getTemplateObjectsCb = React.useCallback(
		(templateId: TemplateId): PrezilloObject[] => {
			return getTemplatePrototypeObjects(doc, templateId)
		},
		[doc, prototypeArrays]
	)

	return {
		templates: templatesWithUsage,
		getTemplateUsageCount,
		getTemplateObjects: getTemplateObjectsCb
	}
}

// vim: ts=4
