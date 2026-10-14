// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Publication templates: styles + page layouts + a section whose story holds empty
 * styled paragraphs with ghost prompts (`ph`) — never sample text — and empty image frames
 * (no `fileId`). Applied in one transaction, only while `secs` is empty.
 *
 * Style names stay English: "Apply style set" matches styles by name across documents.
 * Prompts and layout names go through the caller's `t` (creator's UI language).
 */

import type * as Y from 'yjs'
import { getSuggestedBodyFonts } from '@cloudillo/fonts'
import { FALLBACK_FACE_FAMILY } from '@cloudillo/fonts/metadata'
import { type Align, type Fx, type ParagraphProps, ptToFx as pt } from '@cloudillo/typeset'

import { setMeta } from './crdt/document'
import { newFrameMap, newMasterMap, newSectionMap } from './crdt/entities'
import { addFrame } from './crdt/frame-ops'
import { type MasterId, newId, type SectionId } from './crdt/ids'
import type { PageSize } from './crdt/runtime-types'
import { createStory, type SeedParagraph } from './crdt/story-ops'
import type { StoredFrame, StoredSection, StoredStyle, YPagilloDocument } from './crdt/stored-types'
import { applyStyleSet } from './crdt/style-ops'
import { FULL_CROP } from './crdt/entities'
import { PAGE_SIZES } from './crdt/type-converters'

export type TemplateId = 'simple' | 'two-col' | 'hero' | 'newsletter' | 'report' | 'flyer' | 'blank'
export type PagePreset = keyof typeof PAGE_SIZES
export type Orientation = 'portrait' | 'landscape'

/** Gallery order; `name` is an English i18n key (translate at display). */
export const TEMPLATES: { id: TemplateId; name: string }[] = [
	{ id: 'simple', name: 'Simple page' },
	{ id: 'two-col', name: '2 column' },
	{ id: 'hero', name: 'Hero + content' },
	{ id: 'newsletter', name: 'Newsletter' },
	{ id: 'report', name: 'Report' },
	{ id: 'flyer', name: 'Flyer' },
	{ id: 'blank', name: 'Blank' }
]

export interface TemplateOptions {
	/** A preset or a custom portrait-or-landscape size (Fx). */
	size: PagePreset | PageSize
	orientation: Orientation
	/** Publication language (`m.lang`): the creator's UI language. */
	lang: string
	/** Translator for prompts and layout names (i18next `t`). */
	t?: (s: string) => string
}

/** Page size in the given orientation. */
export function pageSize(size: PagePreset | PageSize, orientation: Orientation): PageSize {
	const { w, h } = typeof size === 'string' ? PAGE_SIZES[size] : size
	const [short, long] = w < h ? [w, h] : [h, w]
	return orientation === 'portrait' ? { w: short, h: long } : { w: long, h: short }
}

interface Look {
	heading: string
	weight: number
	/** Body size, pt. */
	size: number
	/** Title size, pt. */
	title: number
	align?: Align
}

type StyleKey = 'body' | 'title' | 'subtitle' | 'h1' | 'h2' | 'h3' | 'quote' | 'caption'

function styleSet(l: Look): Record<StyleKey, StoredStyle> {
	const s = l.size
	const sized = (size: number, k: number) => ({ size: pt(size), leading: pt(size * k) })
	const plain = { align: 'left', hyphenate: false } as const
	const head = { ...plain, font: l.heading, weight: l.weight, keepNext: true }
	return {
		body: {
			k: 'p',
			name: 'Body',
			props: {
				font: getSuggestedBodyFonts(l.heading)[0] ?? FALLBACK_FACE_FAMILY,
				...sized(s, 1.4),
				spaceAfter: pt(s * 0.6),
				align: l.align ?? 'left',
				hyphenate: l.align === 'justify'
			}
		},
		title: {
			k: 'p',
			name: 'Title',
			basedOn: 'body',
			props: { ...head, ...sized(l.title, 1.1), spaceAfter: pt(s), spanColumns: true }
		},
		subtitle: {
			k: 'p',
			name: 'Subtitle',
			basedOn: 'body',
			props: {
				...plain,
				...sized(s * 1.4, 1.3),
				color: '#555555',
				spaceAfter: pt(s * 1.6),
				spanColumns: true
			}
		},
		h1: {
			k: 'p',
			name: 'Heading 1',
			basedOn: 'body',
			props: {
				...head,
				...sized(s * 2, 1.2),
				spaceBefore: pt(s * 1.6),
				spaceAfter: pt(s * 0.7),
				tocLevel: 1
			}
		},
		h2: {
			k: 'p',
			name: 'Heading 2',
			basedOn: 'h1',
			props: {
				...sized(s * 1.5, 1.2),
				spaceBefore: pt(s * 1.3),
				spaceAfter: pt(s * 0.5),
				tocLevel: 2
			}
		},
		h3: {
			k: 'p',
			name: 'Heading 3',
			basedOn: 'h1',
			props: {
				...sized(s * 1.2, 1.25),
				spaceBefore: pt(s),
				spaceAfter: pt(s * 0.4),
				tocLevel: 3
			}
		},
		quote: {
			k: 'p',
			name: 'Quote',
			basedOn: 'body',
			props: { ...plain, italic: true, indentStart: pt(s * 1.6), indentEnd: pt(s * 1.6) }
		},
		caption: {
			k: 'p',
			name: 'Caption',
			basedOn: 'body',
			props: { ...plain, ...sized(s * 0.8, 1.3), color: '#555555', spaceAfter: pt(s * 0.4) }
		}
	}
}

/** Margins in pt: top, bottom, inside, outside. */
type MarginsPt = [number, number, number, number]

interface Ctx {
	w: Fx
	h: Fx
	t: (s: string) => string
	p: (style: StyleKey, ph?: string, po?: Partial<ParagraphProps>) => SeedParagraph
	master: (name: string, margins: MarginsPt, cols?: number, gutterPt?: number) => MasterId
	section: (
		first: MasterId,
		rest: MasterId,
		paras: SeedParagraph[],
		extra?: Partial<StoredSection>
	) => SectionId
	/** Empty image frame on the section's first page. */
	image: (sec: SectionId, x: Fx, y: Fx, w: Fx, h: Fx, wrap: 'tb' | 'box') => void
	frame: (frame: StoredFrame, opts: { paras?: SeedParagraph[]; master?: MasterId }) => void
}

interface TemplateDef {
	look: Look
	build: (c: Ctx) => void
}

const TEMPLATE_DEFS: Record<TemplateId, TemplateDef> = {
	simple: {
		look: { heading: 'Merriweather', weight: 700, size: 11, title: 28 },
		build: ({ t, p, master, section }) => {
			const m = master(t('Page'), [64, 64, 60, 60])
			section(m, m, [
				p('title', t('Title')),
				p('subtitle', t('Subtitle')),
				p('body', t('Start writing…'))
			])
		}
	},
	'two-col': {
		look: { heading: 'Playfair Display', weight: 700, size: 10, title: 36, align: 'justify' },
		build: ({ t, p, master, section }) => {
			const m = master(t('Two columns'), [56, 56, 54, 54], 2, 24)
			section(m, m, [
				p('title', t('Title')),
				p('subtitle', t('A sentence or two that sums up the story')),
				p('body', t('Start writing…'))
			])
		}
	},
	hero: {
		look: { heading: 'Montserrat', weight: 700, size: 11, title: 34 },
		build: ({ w, h, t, p, master, section, image }) => {
			const m = master(t('Page'), [56, 56, 54, 54])
			const sec = section(m, m, [
				p('title', t('Headline')),
				p('subtitle', t('Introduce your story in a sentence or two')),
				p('body', t('Start writing…'))
			])
			image(sec, pt(54), pt(56), w - pt(108), Math.round((h - pt(112)) * 0.4), 'tb')
		}
	},
	newsletter: {
		look: { heading: 'Oswald', weight: 700, size: 9.5, title: 48, align: 'justify' },
		build: ({ w, h, t, p, master, section, image }) => {
			const m = master(t('Three columns'), [40, 40, 40, 40], 3, 18)
			const sec = section(m, m, [
				p('title', t('Newsletter title')),
				p('subtitle', t('Issue number · date')),
				p('h2', t('Lead story headline')),
				p('body', t('Write your lead story…')),
				p('h2', t('Second story headline')),
				p('body', t('Write a shorter story…'))
			])
			const ih = Math.round((h - pt(80)) * 0.3)
			image(sec, pt(40), h - pt(40) - ih, w - pt(80), ih, 'tb')
		}
	},
	report: {
		look: { heading: 'Crimson Pro', weight: 600, size: 10.5, title: 36 },
		build: ({ w, h, t, p, master, section, frame }) => {
			const cover = master(t('Cover'), [216, 72, 72, 72])
			const page = master(t('Report page'), [72, 72, 72, 72])
			const sec = section(cover, page, [
				p('title', t('Report title')),
				p('subtitle', t('Subtitle or summary')),
				p('body', t('Author · date')),
				p('h1', t('First chapter'), { breakBefore: 'page' }),
				p('body', t('Start writing…'))
			])
			// Page number footer on every report page.
			frame(
				{
					t: 'txt',
					anchor: { sec, page: 0 },
					x: pt(72),
					y: h - pt(48),
					w: w - pt(144),
					h: pt(18),
					rot: 0,
					z: 0,
					wrap: { mode: 'none', off: 0 },
					data: { story: '' }
				},
				{
					master: page,
					paras: [
						{
							...p('caption', undefined, { align: 'center' }),
							embed: { field: 'page' }
						}
					]
				}
			)
		}
	},
	flyer: {
		look: { heading: 'Bebas Neue', weight: 400, size: 13, title: 72 },
		build: ({ w, h, t, p, master, section, image }) => {
			const m = master(t('Page'), [48, 48, 48, 48])
			const sec = section(
				m,
				m,
				[
					p('title', t('Event name')),
					p('subtitle', t('Date · time · place')),
					p('body', t('Tell people why they should come…')),
					p('body', t('Tickets, contact or website'))
				],
				{ maxPages: 1 }
			)
			image(sec, 0, 0, w, Math.round(h * 0.45), 'tb')
		}
	},
	blank: {
		look: { heading: 'Poppins', weight: 600, size: 11, title: 28 },
		build: ({ t, p, master, section }) => {
			const m = master(t('Page'), [64, 64, 60, 60])
			section(m, m, [p('body', t('Start writing…'))])
		}
	}
}

/** A template's style set, for "Apply style set from template…" (`applyStyleSet`). */
export function templateStyleSet(id: TemplateId): Record<string, StoredStyle> {
	return styleSet(TEMPLATE_DEFS[id].look)
}

/** Transaction origin of `applyTemplate`: not the local clientID, so undo never reverts it. */
export const TEMPLATE_ORIGIN = 'pagillo-template'

/**
 * Apply a template to an empty publication in one transaction. Returns false (and writes
 * nothing) if `secs` is no longer empty, e.g. a collaborator applied one first. Not undoable
 * (`TEMPLATE_ORIGIN`): undo leaves `secs` out, so it would strand the doc in a blank state.
 */
export function applyTemplate(
	yDoc: Y.Doc,
	doc: YPagilloDocument,
	id: TemplateId,
	opts: TemplateOptions
): boolean {
	const { w, h } = pageSize(opts.size, opts.orientation)
	const t = opts.t ?? ((s: string) => s)
	const def = TEMPLATE_DEFS[id]
	let applied = false
	yDoc.transact(() => {
		if (doc.secs.length) return
		const s = applyStyleSet(yDoc, doc, styleSet(def.look))
		def.build({
			w,
			h,
			t,
			p: (style, ph, po) => {
				const seed: SeedParagraph = { ps: s[style] }
				if (ph) seed.ph = ph
				if (po) seed.po = po
				return seed
			},
			master: (name, [mt, mb, mi, mo], cols = 1, gutterPt = 0) => {
				const mid = newId()
				doc.ms.set(
					mid,
					newMasterMap({
						name,
						w,
						h,
						margins: { t: pt(mt), b: pt(mb), in: pt(mi), out: pt(mo) },
						cols,
						gutter: pt(gutterPt),
						regions: []
					})
				)
				return mid
			},
			section: (first, rest, paras, extra = {}) => {
				const sid = newId()
				doc.s.set(
					sid,
					newSectionMap({
						start: 'any',
						...extra,
						story: createStory(doc, paras),
						first,
						rest
					})
				)
				doc.secs.push([sid])
				return sid
			},
			image: (sec, x, y, iw, ih, wrap) => {
				doc.f.set(
					newId(),
					newFrameMap({
						t: 'img',
						anchor: { sec, page: 0 },
						x,
						y,
						w: iw,
						h: ih,
						rot: 0,
						z: 0,
						wrap: { mode: wrap, off: pt(12) },
						data: { crop: FULL_CROP, fit: 'cover', alt: '' }
					})
				)
			},
			frame: (frame, fopts) => {
				addFrame(yDoc, doc, frame, fopts)
			}
		})
		setMeta(yDoc, doc, {
			page: { w, h },
			facing: false,
			lang: opts.lang,
			styleMap: {
				p: s.body,
				h1: s.h1,
				h2: s.h2,
				h3: s.h3,
				quote: s.quote,
				caption: s.caption
			}
		})
		applied = true
	}, TEMPLATE_ORIGIN)
	return applied
}

// vim: ts=4
