// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

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
