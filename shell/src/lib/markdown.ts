// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { marked } from 'marked'
import Turndown from 'turndown'

marked.use({ async: false })

export function mdToHtml(md: string): string {
	if (!md) return ''
	return marked.parse(md) as string
}

const turndown = new Turndown()

export function htmlToMd(html: string): string {
	if (!html) return ''
	return turndown.turndown(html)
}

// vim: ts=4
