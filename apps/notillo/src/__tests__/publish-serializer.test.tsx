// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type {
	FileVariant,
	SiteIslandSpec,
	SiteListingEntry,
	SiteSerializerOptions
} from '@cloudillo/core'
import { parseSiteIslandProps } from '@cloudillo/core'

import type { NotilloSourceBlock } from '../publish/render/serializer.js'
import { renderBlocks, siteSummary } from '../publish/render/serializer.js'
import { siteBlockType } from '../rtdb/transform.js'

// The regressions a live publish of `home.w9.hu` surfaced: prose published as empty
// elements, images at their rendition's size rather than the author's, and a video
// whose `src` carried no `?variant=` and came back an `image/webp`.

const OWNER = 'w9.hu'

function block(partial: Partial<NotilloSourceBlock> & { t: string }): NotilloSourceBlock {
	return { id: 'b1', o: 1, ...partial }
}

function variants(list: FileVariant[]): SiteSerializerOptions['resolveFile'] {
	return () => list
}

/** The `data-props` of one marked element, read back the way the shell reads it. */
function islandProps(html: string, blockType: string): Record<string, unknown> {
	const host = document.createElement('div')
	host.innerHTML = html
	const el = host.querySelector(`[data-cl-block="${blockType}"]`)
	return parseSiteIslandProps(el?.getAttribute('data-props')) ?? {}
}

const imageVariants: FileVariant[] = [
	{ variant: 'vis.sd', variantId: 'v-sd', width: 640, height: 360 },
	{ variant: 'vis.md', variantId: 'v-md', width: 1280, height: 720 }
]

describe('legacy inline content', () => {
	it('should render pre-compact styled text rather than an empty element', () => {
		const html = renderBlocks([
			block({
				t: 'p',
				c: [{ type: 'text', text: 'Hello world', styles: { bold: true } }]
			})
		])
		expect(html).toBe('<p><strong>Hello world</strong></p>')
	})

	it('should render a pre-compact link exactly as its compact equivalent does', () => {
		const legacy = renderBlocks([
			block({
				t: 'p',
				c: [
					{
						type: 'link',
						href: 'https://example.com/x',
						content: [{ type: 'text', text: 'example' }]
					}
				]
			})
		])
		const compact = renderBlocks([
			block({ t: 'p', c: [{ l: 'https://example.com/x', c: ['example'] }] })
		])
		expect(legacy).toBe(compact)
		expect(legacy).toBe('<p><a href="https://example.com/x">example</a></p>')
	})

	it('should render a pre-compact wikiLink exactly as its compact equivalent does', () => {
		const opts: SiteSerializerOptions = { resolvePageHref: (id) => `/pages/${id}` }
		const legacy = renderBlocks(
			[
				block({
					t: 'p',
					c: [{ type: 'wikiLink', props: { pageId: 'pg1', pageTitle: 'Other' } }]
				})
			],
			opts
		)
		const compact = renderBlocks([block({ t: 'p', c: [{ wl: 'pg1', wt: 'Other' }] })], opts)
		expect(legacy).toBe(compact)
		expect(legacy).toContain('<a class="cl-site-wikilink" href="/pages/pg1">Other</a>')
	})

	it('should prefer the resolved page title over the stored snapshot', () => {
		const html = renderBlocks([block({ t: 'p', c: [{ wl: 'pg1', wt: 'Old name' }] })], {
			resolvePageHref: (id) => `/pages/${id}`,
			resolvePageTitle: () => 'New name'
		})
		expect(html).toContain('<a class="cl-site-wikilink" href="/pages/pg1">New name</a>')
	})

	it('should derive a summary from a pre-compact block', () => {
		expect(
			siteSummary([block({ t: 'p', c: [{ type: 'text', text: 'A stored paragraph.' }] })])
		).toBe('A stored paragraph.')
	})
})

describe('image sizing and alignment', () => {
	it("should emit the author's preview width as a display style", () => {
		const html = renderBlocks(
			[block({ t: 'img', pr: { url: 'cl-file:img:f1', previewWidth: 320 } })],
			{ ownerIdTag: OWNER, resolveFile: variants(imageVariants) }
		)
		expect(html).toContain('style="width:320px"')
		// The intrinsic pair stays: it is what reserves the aspect ratio.
		expect(html).toContain('width="1280"')
		expect(html).toContain('height="720"')
	})

	it('should emit no width style when the author never resized the block', () => {
		const html = renderBlocks([block({ t: 'img', pr: { url: 'cl-file:img:f1' } })], {
			ownerIdTag: OWNER,
			resolveFile: variants(imageVariants)
		})
		expect(html).not.toContain('style="width:')
	})

	it('should carry `textAlignment` onto the figure', () => {
		const html = renderBlocks(
			[block({ t: 'img', pr: { url: 'cl-file:img:f1', textAlignment: 'center' } })],
			{ ownerIdTag: OWNER, resolveFile: variants(imageVariants) }
		)
		expect(html).toContain('<figure class="cl-site-image"')
		expect(html).toMatch(/<figure class="cl-site-image"[^>]*style="text-align:center"/)
	})
})

describe('video', () => {
	const videoBlock = block({ t: 'vid', pr: { url: 'cl-file:vid:f9', name: 'clip.mp4' } })

	it('should name a `vid.*` rendition in both the link and the island src', () => {
		const html = renderBlocks([videoBlock], {
			ownerIdTag: OWNER,
			resolveFile: variants([...imageVariants, { variant: 'vid.md', variantId: 'v-vmd' }])
		})
		const url = `https://cl-o.${OWNER}/api/files/f9?variant=vid.md`
		expect(html).toContain(`<a class="cl-site-media-link" href="${url}">`)
		// The exact defect: a bare, variant-less file URL the backend answers with a
		// still image.
		expect(html).not.toContain(`https://cl-o.${OWNER}/api/files/f9"`)
	})

	it('should put the chosen variant into `data-props.src`', () => {
		const html = renderBlocks([videoBlock], {
			ownerIdTag: OWNER,
			resolveFile: variants([{ variant: 'vid.sd', variantId: 'v-vsd' }])
		})
		expect(islandProps(html, 'video').src).toBe(
			`https://cl-o.${OWNER}/api/files/f9?variant=vid.sd`
		)
	})

	it('should fall back to `vid.hd` when no descriptor is available', () => {
		const html = renderBlocks([videoBlock], { ownerIdTag: OWNER })
		expect(html).toContain(`https://cl-o.${OWNER}/api/files/f9?variant=vid.hd`)
	})

	it('should never pick a `vis.*` still even when that is all the file has', () => {
		const html = renderBlocks([videoBlock], {
			ownerIdTag: OWNER,
			resolveFile: variants(imageVariants)
		})
		expect(html).toContain('?variant=vid.hd')
		// `vis.md` may still appear as the poster's `src`, never as the media href.
		expect(html).not.toContain(
			'cl-site-media-link" href="https://cl-o.w9.hu/api/files/f9?variant=vis'
		)
	})

	it("should carry the author's preview width onto the poster and the island", () => {
		const html = renderBlocks(
			[
				block({
					t: 'vid',
					pr: { url: 'cl-file:vid:f9', previewWidth: 480, textAlignment: 'center' }
				})
			],
			{ ownerIdTag: OWNER, resolveFile: variants(imageVariants) }
		)
		expect(html).toContain('class="cl-site-media-poster"')
		expect(html).toContain('style="width:480px"')
		expect(islandProps(html, 'video').previewWidth).toBe(480)
		expect(html).toMatch(/<figure class="cl-site-media cl-site-video"[^>]*text-align:center/)
	})
})

describe('audio and file blocks', () => {
	it('should keep the bare file URL — the editor and a download link both want it', () => {
		const html = renderBlocks([block({ t: 'aud', pr: { url: 'cl-file:aud:f3' } })], {
			ownerIdTag: OWNER
		})
		expect(html).toContain(`href="https://cl-o.${OWNER}/api/files/f3"`)
		expect(html).not.toContain('variant=')
	})
})

describe('documentEmbed', () => {
	it('should emit a sub-100 width as a centred percentage', () => {
		const html = renderBlocks([
			block({ t: 'documentEmbed', pr: { fileId: 'f7', height: 400, width: 50 } })
		])
		expect(html).toContain('height:400px')
		expect(html).toContain('width:50%')
		expect(html).toContain('margin-inline:auto')
	})

	it('should leave a full-width embed alone', () => {
		const html = renderBlocks([
			block({ t: 'documentEmbed', pr: { fileId: 'f7', height: 400, width: 100 } })
		])
		expect(html).not.toContain('width:')
	})
})

// Everything below is about the same promise: a stored record the publisher cannot
// vouch for costs its own block its markup, never the container build. `siteBlockType`
// hands an unknown `t` back unchanged by design, and nothing runtype-decodes a whole
// document — so the serializer meets both where they arrive.

describe('block types off the prototype chain', () => {
	it.each(['constructor', 'toString', 'valueOf', '__proto__', 'hasOwnProperty'])(
		'should not throw on a block stored as %p',
		(t) => {
			// `LIST_WRAPPER['constructor']` resolves `Object` off the prototype — truthy —
			// and `attr('class', Object)` then threw `text.replace is not a function`,
			// taking the whole publish with it.
			//
			// `siteBlockType` is the lookup the serializer reaches first, and its
			// `string` return type is load-bearing the same way: `BLOCK_TYPE_TO_LONG`
			// is a `Map` precisely so a stored `'toString'` cannot come back as
			// `Object.prototype.toString`, which would then miss every `switch`
			// downstream. Asserted here rather than trusted, because the serializer
			// tolerates an unrecognised type gracefully enough to hide it.
			expect(typeof siteBlockType(t)).toBe('string')
			const html = renderBlocks([block({ t, c: ['Still content'] })])
			expect(typeof html).toBe('string')
			expect(html).not.toContain('undefined')
			expect(html).not.toContain('function')
		}
	)

	it('should still render the children of an unknown block type', () => {
		const html = renderBlocks([
			block({ id: 'b1', t: 'constructor', o: 1 }),
			block({ id: 'b2', t: 'p', pb: 'b1', o: 1, c: ['Nested prose'] })
		])
		expect(html).toBe('<div class="cl-site-nested"><p>Nested prose</p></div>')
	})
})

describe('declared islands', () => {
	const spec = (over: Partial<SiteIslandSpec> = {}): SiteIslandSpec => ({
		blockType: 'appThing',
		kind: 'replace',
		shape: 'box',
		...over
	})
	const thing = block({ t: 'appThing', pr: { name: 'A thing' } })

	it('should emit a placeholder for a declared block type', () => {
		const html = renderBlocks([thing], { islands: [spec({ labelFrom: 'pr.name' })] })
		expect(html).toContain('<div class="cl-site-island-box"')
		expect(html).toContain('data-cl-block="appThing"')
		expect(html).toContain('<span class="cl-site-island-label">A thing</span>')
	})

	it('should emit a span for an inline shape and a poster for a media one', () => {
		const inline = renderBlocks([thing], { islands: [spec({ shape: 'inline' })] })
		expect(inline).toContain('<span class="cl-site-island-inline"')

		const media = renderBlocks([block({ t: 'appThing', pr: { poster: '/p.png' } })], {
			islands: [spec({ shape: 'media', posterFrom: 'pr.poster' })]
		})
		expect(media).toContain('<div class="cl-site-island-media"')
		expect(media).toContain('<img class="cl-site-media-poster" src="/p.png"')
	})

	it('should fold a hostile shape to box rather than interpolating it', () => {
		// An island spec arrives from a *manifest* and is app-authored; `@cloudillo/react`
		// is published to npm, where no caller is type-checked. This is the one
		// app-controlled value in the serializer that lands in an attribute.
		const html = renderBlocks([thing], {
			islands: [spec({ shape: 'box" onmouseover="alert(1)' as never })]
		})
		expect(html).toContain('<div class="cl-site-island-box"')
		expect(html).not.toContain('onmouseover')
	})

	it('should escape a label the app supplied', () => {
		const html = renderBlocks([block({ t: 'appThing', pr: { name: '<img src=x>' } })], {
			islands: [spec({ labelFrom: 'pr.name' })]
		})
		expect(html).toContain('&lt;img src=x&gt;')
		expect(html).not.toContain('<img src=x>')
	})

	it('should copy a declared href prop out as it stands', () => {
		// Not vetted here any more: `cloudillo-file`'s `site_html` refuses the
		// container at upload, and what an island prop means is only known where it
		// lands — `site/island-registry.tsx` in the shell.
		const html = renderBlocks([block({ t: 'appThing', pr: { link: '/blog/x' } })], {
			islands: [spec({ props: ['link'], hrefProps: ['link'] })]
		})
		expect(islandProps(html, 'appThing').link).toBe('/blog/x')
	})
})

describe('malformed stored shapes', () => {
	it('should render a table with no rows as nothing', () => {
		const html = renderBlocks([
			block({ t: 'tb', c: { type: 'tableContent' } as never }),
			block({ t: 'p', c: ['After'] })
		])
		expect(html).toBe('<p>After</p>')
	})

	it('should skip a row whose cells are missing and keep the rest', () => {
		const html = renderBlocks([
			block({
				t: 'tb',
				c: {
					type: 'tableContent',
					rows: [{}, { cells: [['Kept']] }]
				} as never
			})
		])
		expect(html).toContain('<tr></tr>')
		expect(html).toContain('<td>Kept</td>')
	})

	// A run whose shape `tSiteInline` refuses is dropped, and only that run: the
	// prose beside it still publishes. It used to render as an empty element,
	// because the values were coerced one at a time instead of the run being decoded
	// as a whole — an empty `<strong>` in the output is a truer symptom of a bad
	// *style* than of a run this build cannot read at all.

	it('should drop a compact tuple whose text is not a string', () => {
		const html = renderBlocks([block({ t: 'p', c: [[42, 'b'] as never, ' tail'] })])
		expect(html).toBe('<p> tail</p>')
	})

	it('should drop a wikilink whose stored label is not a string', () => {
		const html = renderBlocks([block({ t: 'p', c: [{ wl: 'pg1', wt: 7 as never }, ' tail'] })])
		expect(html).toBe('<p> tail</p>')
	})

	it('should drop a tag whose stored name is not a string', () => {
		const html = renderBlocks([block({ t: 'p', c: [{ tg: 7 as never }, ' tail'] })])
		expect(html).toBe('<p> tail</p>')
	})
})

// ── The `index` block ──
//
// A listing is content, so it is a block rather than a page archetype — and it is
// baked static rather than mounted as an island, because which pages are published,
// what their frozen slugs are and what they summarise to is publish-time knowledge
// an anonymous visitor's runtime cannot recover.
//
// The serializer cannot see across pages: it parses the block's props into a query,
// asks `opts.resolveListing`, and renders whatever comes back in the block's layout.

describe('a `pb` cycle', () => {
	// No UI can build one, but `useEditorSync` writes `pb` field-by-field, so two
	// clients re-nesting A under B and B under A leaves exactly this. Every block in
	// a cycle has a parent that resolves, so none of them reached the root list and
	// the whole cycle plus its subtree published as nothing at all.

	it('should still publish both blocks of a mutual cycle', () => {
		const html = renderBlocks([
			block({ id: 'a', t: 'p', pb: 'b', c: ['alpha'] }),
			block({ id: 'b', t: 'p', pb: 'a', c: ['beta'] })
		])
		expect(html).toContain('alpha')
		expect(html).toContain('beta')
	})

	it('should publish a self-parented block exactly once', () => {
		const html = renderBlocks([block({ id: 'a', t: 'p', pb: 'a', c: ['solo'] })])
		expect(html).toContain('solo')
		expect(html.match(/solo/g)).toHaveLength(1)
	})

	it('should keep a subtree hanging off a cycle', () => {
		const html = renderBlocks([
			block({ id: 'a', t: 'p', pb: 'b', c: ['alpha'] }),
			block({ id: 'b', t: 'p', pb: 'a', c: ['beta'] }),
			block({ id: 'c', t: 'p', pb: 'b', c: ['gamma'] })
		])
		expect(html).toContain('alpha')
		expect(html).toContain('beta')
		expect(html).toContain('gamma')
	})
})

describe('index block', () => {
	const ENTRIES: SiteListingEntry[] = [
		{
			href: '/blog/hello',
			title: 'Hello',
			date: '2026-03-01T10:00:00Z',
			description: 'A greeting',
			byline: { name: 'Alice', idTag: 'alice.tld' },
			tags: ['news'],
			image: 'https://cl-o.w9.hu/api/files/f1',
			depth: 0
		},
		{ href: '/blog/second', title: 'Second', date: '2026-02-01T10:00:00Z', depth: 1 }
	]

	const listing = (entries: SiteListingEntry[] = ENTRIES): SiteSerializerOptions => ({
		resolveListing: () => entries,
		resolveTagHref: (tag) => `/blog/tags/${tag}`
	})

	it('should render nothing without a resolver', () => {
		// A serializer running outside a container build — every other suite here —
		// has no way to know what the block would list.
		expect(renderBlocks([block({ t: 'index' })])).toBe('')
	})

	it('should render nothing when the listing resolved to no rows', () => {
		expect(renderBlocks([block({ t: 'index' })], listing([]))).toBe('')
		expect(renderBlocks([block({ t: 'index' })], { resolveListing: () => undefined })).toBe('')
	})

	// Asserted as class names, hrefs and content rather than whole tags: which element
	// carries a class and in what attribute order is styling, and a `cl-site-*` rename
	// or a reordered attribute should be one stylesheet change rather than a dozen
	// broken assertions. The exception is the tree layout below, where the balance of
	// the markup *is* the behaviour under test.
	it('should render the list layout by default, with meta, description and tags', () => {
		const html = renderBlocks([block({ t: 'index' })], listing())
		expect(html).toContain('cl-site-listing--list')
		expect(html).toContain('href="/blog/hello"')
		expect(html).toContain('>Hello<')
		expect(html).toContain('cl-site-byline-name')
		expect(html).toContain('>Alice<')
		expect(html).toContain('datetime="2026-03-01T10:00:00Z"')
		expect(html).toContain('cl-site-listing-desc')
		expect(html).toContain('>A greeting<')
		expect(html).toContain('href="/blog/tags/news"')
		expect(html).toContain('>news<')
	})

	it('should render the compact layout as titles and dates only', () => {
		const html = renderBlocks([block({ t: 'index', pr: { layout: 'compact' } })], listing())
		expect(html).toContain('cl-site-listing--compact')
		expect(html).toContain('href="/blog/hello"')
		expect(html).not.toContain('cl-site-byline')
		expect(html).not.toContain('cl-site-listing-desc')
		expect(html).not.toContain('cl-site-listing-tags')
	})

	// Whole-string equality here, unlike the layouts above: an author-driven depth
	// reaching a string builder can leave a list open, and only the full markup shows
	// the `<ul>`/`<li>` nesting is balanced.
	it('should nest the tree layout from the entries’ depth', () => {
		const html = renderBlocks([block({ t: 'index', pr: { layout: 'tree' } })], listing())
		expect(html).toBe(
			'<ul class="cl-site-listing cl-site-listing--tree">' +
				'<li><a class="cl-site-listing-link" href="/blog/hello">Hello</a>' +
				'<ul><li><a class="cl-site-listing-link" href="/blog/second">Second</a>' +
				'</li></ul></li></ul>'
		)
	})

	it('should clamp a tree depth the entries could not have earned', () => {
		// The depths are author-driven data reaching a string builder, so a first
		// entry claiming depth 3 must not open three unclosed lists.
		const html = renderBlocks(
			[block({ t: 'index', pr: { layout: 'tree' } })],
			listing([
				{ href: '/a', title: 'A', depth: 3 },
				{ href: '/b', title: 'B', depth: 9 }
			])
		)
		expect(html).toBe(
			'<ul class="cl-site-listing cl-site-listing--tree">' +
				'<li><a class="cl-site-listing-link" href="/a">A</a>' +
				'<ul><li><a class="cl-site-listing-link" href="/b">B</a>' +
				'</li></ul></li></ul>'
		)
	})

	it('should render the cards layout with a lazy image', () => {
		const html = renderBlocks([block({ t: 'index', pr: { layout: 'cards' } })], listing())
		expect(html).toContain('cl-site-listing--cards')
		expect(html).toContain('cl-site-listing-image')
		expect(html).toContain('src="https://cl-o.w9.hu/api/files/f1"')
		expect(html).toContain('loading="lazy"')
		// An entry with no image simply has none; the row still renders.
		expect(html).toContain('href="/blog/second"')
		expect(html).toContain('>Second<')
	})

	it('should fall back to the list layout for a layout from a newer Notillo', () => {
		const html = renderBlocks([block({ t: 'index', pr: { layout: 'hologram' } })], listing())
		expect(html).toContain('cl-site-listing--list')
	})

	it('should still render the children nested under it', () => {
		const html = renderBlocks(
			[block({ t: 'index' }), block({ id: 'b2', t: 'p', pb: 'b1', c: ['note'] })],
			listing()
		)
		expect(html).toContain('<div class="cl-site-nested"><p>note</p></div>')
	})
})

/**
 * Stored values are not the author's alone: any collaborator with block-write access
 * can put one in, and this module turns them into public HTML on the *owner's* origin.
 * The server's own allowlist is not the backstop it reads like — `site_html.rs`
 * inspects `href`/`src`/`srcset` values and nothing else, so a `style` declaration
 * passes it whole, and where it does refuse it refuses the entire container upload
 * with no clue which block is at fault.
 */
describe('hostile input', () => {
	it('should drop a colour carrying a second declaration', () => {
		const html = renderBlocks([
			block({
				t: 'p',
				pr: { textColor: 'red;position:fixed;inset:0;z-index:99999' },
				c: ['Overlay']
			})
		])
		expect(html).not.toContain('position')
		expect(html).not.toContain('inset')
		expect(html).toBe('<p>Overlay</p>')
	})

	it('should still emit an ordinary palette colour', () => {
		// The over-tightening guard: BlockNote's real value space is named tokens.
		expect(renderBlocks([block({ t: 'p', pr: { textColor: 'red' }, c: ['Hi'] })])).toContain(
			'style="color:red"'
		)
		expect(
			renderBlocks([block({ t: 'p', pr: { backgroundColor: '#ff8800' }, c: ['Hi'] })])
		).toContain('style="background-color:#ff8800"')
	})

	it('should drop a background colour that is a url()', () => {
		const html = renderBlocks([
			block({ t: 'p', pr: { backgroundColor: 'url(https://evil.example/beacon)' }, c: ['x'] })
		])
		expect(html).not.toContain('url(')
		expect(html).not.toContain('evil.example')
	})

	it('should drop a colour smuggled through an inline run', () => {
		// The compact spelling of the same props — `tc`/`bg` on a styled-text triple.
		const html = renderBlocks([
			block({ t: 'p', c: [['Hi', 0, { tc: 'red;position:fixed;inset:0' }]] })
		])
		expect(html).not.toContain('position')
	})

	it('should drop an alignment carrying a second declaration', () => {
		const html = renderBlocks([
			block({ t: 'p', pr: { textAlignment: 'center;color:red' }, c: ['x'] })
		])
		expect(html).not.toContain('color')
		expect(html).toContain('<p>x</p>')
	})

	it('should keep a link with a javascript: target as its text', () => {
		const html = renderBlocks([
			block({ t: 'p', c: [{ l: 'javascript:alert(1)', c: ['click me'] }] })
		])
		expect(html).not.toContain('href')
		expect(html).toBe('<p>click me</p>')
	})

	it('should emit no image at all for an unvouchable src', () => {
		for (const url of ['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>']) {
			expect(renderBlocks([block({ t: 'img', pr: { url } })])).not.toContain('<img')
		}
	})

	// A fileId `getFileUrl` refuses has no URL at any variant, so the whole block goes —
	// not a `src`-less `<img>` wearing a lightbox island that can never open.
	it('should emit no image at all for a refused fileId', () => {
		const html = renderBlocks([block({ t: 'img', pr: { url: 'cl-file:img:../x' } })], {
			ownerIdTag: OWNER,
			resolveFile: variants(imageVariants)
		})
		expect(html).toBe('')
	})

	it('should emit no media link for an unvouchable url', () => {
		const html = renderBlocks([block({ t: 'vid', pr: { url: 'javascript:alert(1)' } })])
		expect(html).toBe('')
	})

	it('should escape a quote and an angle bracket inside an attribute', () => {
		// The attribute-breakout case: `attr` escapes, and this is what says so.
		const html = renderBlocks([
			block({ t: 'img', pr: { url: '/pic.png', caption: '" onerror="alert(1)' } })
		])
		expect(html).not.toContain('onerror="alert(1)"')
		expect(html).toContain('&quot; onerror=&quot;alert(1)')

		const link = renderBlocks([block({ t: 'p', c: [{ l: '/x?a=<b>&c="d"', c: ['t'] }] })])
		expect(link).toContain('href="/x?a=&lt;b&gt;&amp;c=&quot;d&quot;"')
	})
})

// vim: ts=4
