// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { AnchorPlacement } from '@cloudillo/react'
import type { TFunction } from 'i18next'

import { type CtxBase, feedPath, filesPath } from '../routes.js'

export interface TourStep {
	/** `data-tour` value of the element to spotlight; none = centered */
	target?: string
	/** Route to open before looking for the target */
	route?: string
	title: string
	body: string
}

export function tourSteps(t: TFunction, base: CtxBase): TourStep[] {
	return [
		{
			title: t('Welcome to Cloudillo'),
			body: t('A quick look around: where things are and what they do. It takes a minute.')
		},
		{
			target: 'nav',
			title: t('Your apps'),
			body: t('Feed, files, messages and the rest of your apps are always within reach here.')
		},
		{
			target: 'feed-compose',
			route: feedPath(base),
			title: t('Share a post'),
			body: t(
				'Write a post, add photos or documents, and choose who can see it. Posts from people and communities you follow show up below.'
			)
		},
		{
			target: 'files-create',
			route: filesPath(base),
			title: t('Create and upload'),
			body: t(
				'Start a new document, spreadsheet, presentation or whiteboard, or upload files. Everything is stored on your own node.'
			)
		},
		{
			target: 'context',
			title: t('Your space and communities'),
			body: t(
				'Switch between your personal space and the communities you belong to. Each one has its own feed, files and apps.'
			)
		},
		{
			target: 'search',
			title: t('Search'),
			body: t('Find people, communities, posts and files.')
		},
		{
			target: 'messages',
			title: t('Messages'),
			body: t('Private conversations and group chats.')
		},
		{
			target: 'notifications',
			title: t('Notifications'),
			body: t('Invitations, connection requests and other things that need your attention.')
		},
		{
			target: 'user-menu',
			title: t('Your account'),
			body: t(
				'Your profile, your card and settings live here. You can also take this tour again from this menu.'
			)
		},
		{
			title: t("You're all set"),
			body: t('Enjoy Cloudillo!')
		}
	]
}

/** The first `[data-tour=id]` that is actually rendered (rail and dock both stay in the DOM). */
export function findTourTarget(id: string, root: ParentNode = document): Element | null {
	for (const el of root.querySelectorAll(`[data-tour="${CSS.escape(id)}"]`)) {
		if (el.getClientRects().length > 0) return el
	}
	return null
}

/** Room the bubble needs above/below the target before we put it at the side instead */
const BUBBLE_ROOM = 220

/**
 * Where the bubble goes. Desktop (`floating`): anchored next to the target; popper only flips
 * to the opposite side, so a viewport-tall target needs a side placement. Narrow screens: a bar
 * on the side away from the target. No target: centered.
 */
export function bubbleLayout(
	rect: DOMRect | null,
	floating: boolean,
	vw: number,
	vh: number
): { placement?: AnchorPlacement; mode?: string } {
	if (!rect) return { mode: 'centered' }
	if (!floating) return { mode: rect.top + rect.height / 2 > vh / 2 ? 'bar top' : 'bar bottom' }
	let placement: AnchorPlacement
	if (vh - rect.bottom >= BUBBLE_ROOM) placement = 'bottom'
	else if (rect.top >= BUBBLE_ROOM) placement = 'top'
	else if (rect.left > vw - rect.right) placement = 'left-start'
	else placement = 'right-start'
	return { placement }
}

// vim: ts=4
