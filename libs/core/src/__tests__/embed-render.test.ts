// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * `sanitizeSvg` allow-list, `renderEmbeds` ordering/concurrency and `renderEmbed` teardown.
 *
 * Stubs are hand-rolled: the `jest` global is not injected under ESM.
 */

import {
	embedLabel,
	embedPlaceholderSvg,
	MAX_RENDER_PAGES,
	MAX_RENDER_SVG_ELEMENTS,
	nestSvg,
	parseSvg,
	type RenderEmbedOptions,
	type RenderEmbedResult,
	renderEmbed,
	renderEmbedMap,
	renderEmbeds,
	sanitizeSvg,
	stripXmlControl
} from '../embed-render'
import { PROTOCOL_VERSION } from '../message-bus/types'

const NS = 'xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"'
const wrap = (body: string) => `<svg ${NS} viewBox="0 0 10 10" width="10" height="10">${body}</svg>`
const PNG = 'data:image/png;base64,iVBORw0KGgo='

describe('sanitizeSvg', () => {
	it('keeps allowed elements, local refs and data images', () => {
		const out = sanitizeSvg(
			wrap(
				`<defs><linearGradient id="g"><stop offset="0"/></linearGradient>` +
					`<filter id="f"><feDropShadow dx="1"/></filter></defs>` +
					`<rect width="5" height="5" fill="url(#g)" filter="url(#f)"/>` +
					`<text x="1" y="5" font-family="Roboto">Hi <tspan>there</tspan></text>` +
					`<image href="${PNG}" width="2" height="2"/><use xlink:href="#g"/>`
			)
		)
		expect(out).not.toBeNull()
		expect(out).toContain('fill="url(#g)"')
		expect(out).toContain('<feDropShadow')
		expect(out).toContain('Hi ')
		expect(out).toContain('there</tspan>')
		expect(out).toContain(`href="${PNG}"`)
		expect(out).toContain('xlink:href="#g"')
	})

	it('drops script, foreignObject, foreign namespaces and comments', () => {
		const out = sanitizeSvg(
			wrap(
				`<script>alert(1)</script>` +
					`<foreignObject><div xmlns="http://www.w3.org/1999/xhtml">x</div></foreignObject>` +
					`<html:p xmlns:html="http://www.w3.org/1999/xhtml">y</html:p>` +
					`<a href="https://evil.example"><rect/></a><!-- c --><feImage href="${PNG}"/>` +
					`<animate attributeName="href" to="javascript:alert(1)"/>`
			)
		) as string
		expect(out).not.toMatch(/script|foreignObject|html|<a|<!--|feImage|animate/)
	})

	it('drops event handlers and external references', () => {
		const out = sanitizeSvg(
			`<svg ${NS} onload="alert(1)" viewBox="0 0 1 1">` +
				`<image href="https://evil.example/x.png" xlink:href="javascript:alert(1)"/>` +
				`<rect fill="url(https://evil.example/#g)" style="fill:url(http://x/y)" onclick="x()"/>` +
				`<image href="data:text/html,hi"/></svg>`
		) as string
		expect(out).not.toMatch(/onload|onclick|evil|javascript|http:\/\/x|data:text/)
		expect(out).toContain('<rect')
	})

	it('drops <style>, even with only embedded @font-face', () => {
		const font = '@font-face{font-family:A;src:url(data:font/ttf;base64,AAAA)}'
		expect(sanitizeSvg(wrap(`<style>${font}</style>`))).not.toContain('<style')
	})

	it('turns CDATA into escaped text', () => {
		const out = sanitizeSvg(wrap('<text><![CDATA[a<b]]></text>')) as string
		expect(out).not.toContain('CDATA')
		expect(out).toContain('a&lt;b')
	})

	it('drops CSS functions that fetch without url()', () => {
		const out = sanitizeSvg(
			wrap(`<rect style="background:image-set('https://x' 1x)" fill="red"/>`)
		) as string
		expect(out).not.toContain('style=')
		expect(out).toContain('fill="red"')
	})

	it('allows data hrefs only on <image>, re-sanitizing nested svg', () => {
		const inner = encodeURIComponent(wrap('<rect/><script>alert(1)</script>'))
		const href = `data:image/svg+xml,${inner}`
		const out = sanitizeSvg(
			wrap(`<use href="${href}"/><image href="${href}" width="2" height="2"/>`)
		) as string
		const doc = new DOMParser().parseFromString(out, 'image/svg+xml')
		expect(doc.querySelector('use')?.hasAttribute('href')).toBe(false)
		const kept = doc.querySelector('image')?.getAttribute('href') as string
		expect(kept).toMatch(/^data:image\/svg\+xml;charset=utf-8,/)
		const nested = decodeURIComponent(kept.slice(kept.indexOf(',') + 1))
		expect(nested).toContain('<rect')
		expect(nested).not.toContain('script')
	})

	it('drops data svg nested deeper than the limit', () => {
		const nest = (body: string) =>
			`<image href="data:image/svg+xml,${encodeURIComponent(wrap(body))}"/>`
		const out = sanitizeSvg(wrap(nest(nest(nest('<rect/>'))))) as string
		/** The `href` of the first `<image>` in `svg`, decoded */
		const inner = (svg: string) => {
			const href = new DOMParser()
				.parseFromString(svg, 'image/svg+xml')
				.querySelector('image')
				?.getAttribute('href')
			return href ? decodeURIComponent(href.slice(href.indexOf(',') + 1)) : null
		}
		const level1 = inner(out) as string
		const level2 = inner(level1) as string
		expect(level2).toContain('<image')
		expect(inner(level2)).toBeNull()
	})

	it('drops CSS escapes that could hide url( or src(', () => {
		const out = sanitizeSvg(
			wrap(
				`<rect style="fill:u\\72l(http://x)" fill="re\\64" stroke="blue"/>` +
					`<style>@font-face{font-family:A;src:u\\72l(http://x)}</style>`
			)
		) as string
		expect(out).not.toContain('style=')
		expect(out).not.toContain('fill=')
		expect(out).not.toContain('<style')
		expect(out).toContain('stroke="blue"')
	})

	it('keeps avif data images', () => {
		const avif = 'data:image/avif;base64,AAAA'
		expect(sanitizeSvg(wrap(`<image href="${avif}"/>`))).toContain(`href="${avif}"`)
	})

	it('drops <use> chains and cycles', () => {
		const out = sanitizeSvg(
			wrap(
				`<g id="a"><rect/></g><g id="b"><use href="#a"/></g>` +
					`<use id="chain" href="#b"/><g id="c"><use id="cyc" href="#c"/></g>` +
					`<use id="self" href="#self"/><use id="ok" href="#a"/><use id="gone" href="#nope"/>`
			)
		) as string
		expect(out).toContain('id="ok"')
		expect(out).not.toMatch(/id="(chain|cyc|self|gone)"/)
	})

	it('counts what <use> expands against the element budget', () => {
		const half = Math.ceil(MAX_RENDER_SVG_ELEMENTS / 2)
		const big = `<g id="big">${'<rect/>'.repeat(half)}</g>`
		expect(sanitizeSvg(wrap(big))).not.toBeNull()
		expect(sanitizeSvg(wrap(`${big}<use href="#big"/>`))).toBeNull()
	})

	it('drops style attributes that place content outside the page', () => {
		const out = sanitizeSvg(
			wrap(
				'<rect style="position:fixed;top:0"/><g style="fill: red; z-index : 9"/><circle style="fill:red"/>'
			)
		)
		expect(out).not.toContain('position')
		expect(out).not.toContain('z-index')
		expect(out).toContain('style="fill:red"')
		expect(sanitizeSvg(wrap('<rect style="fill:red;/**/position:fixed"/>'))).not.toContain(
			'position'
		)
	})

	it('drops a <style> with element children, which are never walked', () => {
		const out = sanitizeSvg(
			wrap(
				`<style><img xmlns="http://www.w3.org/1999/xhtml" src="x" onerror="alert(1)"/></style>`
			)
		) as string
		expect(out).not.toBeNull()
		expect(out).not.toMatch(/img|onerror/)
	})

	it('rejects a page over the element budget', () => {
		expect(sanitizeSvg(wrap('<g/>'.repeat(MAX_RENDER_SVG_ELEMENTS)))).toBeNull()
	})

	it('rejects unparsable, non-svg and oversized input', () => {
		expect(sanitizeSvg('<svg')).toBeNull()
		expect(sanitizeSvg('<html xmlns="http://www.w3.org/1999/xhtml"/>')).toBeNull()
		expect(sanitizeSvg(wrap(`<desc>${'x'.repeat(5 * 1024 * 1024)}</desc>`))).toBeNull()
	})
})

describe('stripXmlControl', () => {
	it('replaces characters XML forbids, keeps tab/newline', () => {
		expect(stripXmlControl('a\u0001b\u001Fc\tline\n\uFFFE')).toBe('a b c\tline\n ')
	})
})

describe('parseSvg / nestSvg', () => {
	it('parses only well-formed svg roots', () => {
		expect(parseSvg('<svg')).toBeNull()
		expect(parseSvg('<html xmlns="http://www.w3.org/1999/xhtml"/>')).toBeNull()
		expect(parseSvg('<svg/>')).toBeNull() // no SVG namespace
		expect(parseSvg(wrap('<rect/>'))?.localName).toBe('svg')
	})

	it('positions a page in a box, letterboxed', () => {
		const el = nestSvg(wrap(''), { x: 1, y: 2, width: 30, height: 40 }) as SVGSVGElement
		expect(
			['x', 'y', 'width', 'height', 'preserveAspectRatio'].map((a) => el.getAttribute(a))
		).toEqual(['1', '2', '30', '40', 'xMidYMid meet'])
		expect(nestSvg('<svg', { x: 0, y: 0, width: 1, height: 1 })).toBeNull()
	})

	it('clips the page to its box', () => {
		const svg = `<svg ${NS} transform="scale(9)" style="overflow:visible" overflow="visible"/>`
		const el = nestSvg(svg, { x: 0, y: 0, width: 1, height: 1 }) as SVGSVGElement
		expect(el.getAttribute('overflow')).toBe('hidden')
		expect(el.hasAttribute('transform')).toBe(false)
		expect(el.hasAttribute('style')).toBe(false)
	})

	it('prefixes ids and local references, uniquely per call', () => {
		const svg = wrap(
			`<linearGradient id="g"/><rect id="r" fill="url(#g)" style="stroke:url('#g')"/>` +
				`<use href="#r"/><use xlink:href="#r"/>`
		)
		const box = { x: 0, y: 0, width: 1, height: 1 }
		const el = nestSvg(svg, box) as SVGSVGElement
		const prefix = (el.querySelector('linearGradient') as Element).id.slice(0, -1)
		expect(prefix).toMatch(/^e.+-$/)
		const rect = el.querySelector('rect') as Element
		expect(rect.id).toBe(`${prefix}r`)
		expect(rect.getAttribute('fill')).toBe(`url(#${prefix}g)`)
		expect(rect.getAttribute('style')).toBe(`stroke:url('#${prefix}g')`)
		const uses = el.querySelectorAll('use')
		expect(uses[0].getAttribute('href')).toBe(`#${prefix}r`)
		expect(uses[1].getAttributeNS('http://www.w3.org/1999/xlink', 'href')).toBe(`#${prefix}r`)
		const other = nestSvg(svg, box) as SVGSVGElement
		expect(other.querySelector('rect')?.id).not.toBe(rect.id)
	})
})

describe('embedPlaceholderSvg', () => {
	it('draws a card with the escaped app name and ref', () => {
		const box = { x: 10, y: 20, width: 100, height: 60 }
		const card = embedPlaceholderSvg(box, 'calc<illo', 'cl:calcillo/a:b&c')
		const el = parseSvg(
			`<svg xmlns="http://www.w3.org/2000/svg">${card}</svg>`
		) as SVGSVGElement
		expect(el.querySelector('rect')?.getAttribute('x')).toBe('10')
		const texts = Array.from(el.querySelectorAll('text')).map((t) => t.textContent)
		expect(texts).toEqual(['calc<illo', 'cl:calcillo/a:b&c'])
		expect(embedPlaceholderSvg(box, 'x')).not.toContain('font-size="10"')
	})

	it('writes non-numeric box fields as 0', () => {
		const card = embedPlaceholderSvg({ x: '1"><script', y: 0, width: 10, height: 10 }, 'x')
		expect(card).toContain('<rect x="0"')
		expect(card).not.toContain('<script')
	})
})

describe('embedLabel', () => {
	const e = { contentType: 'cloudillo/calcillo', fileId: 'f1', navState: 'A1' }
	it('names the app, with a ref only when the owner is known', () => {
		expect(embedLabel(e)).toEqual({ app: 'calcillo', ref: undefined })
		expect(embedLabel({ ...e, appId: 'quillo' }, 'bob.org')).toEqual({
			app: 'quillo',
			ref: 'cl:quillo/bob.org:f1?nav=A1'
		})
	})
})

describe('renderEmbeds', () => {
	const item = (n: number) =>
		({
			targetFileId: String(n),
			targetContentType: 't',
			sourceFileId: 's'
		}) as RenderEmbedOptions
	const tick = (ms: number) => new Promise((r) => setTimeout(r, ms))

	it('keeps input order, caps concurrency, reports progress and maps failures', async () => {
		let inFlight = 0
		let peak = 0
		const progress: number[] = []
		const render = async (o: RenderEmbedOptions): Promise<RenderEmbedResult> => {
			inFlight++
			peak = Math.max(peak, inFlight)
			const n = Number(o.targetFileId)
			await tick((5 - n) * 5) // later items finish first
			inFlight--
			if (n === 2) throw new Error('boom')
			return { pages: [`p${n}`], natural: { w: n, h: n } }
		}
		const res = await renderEmbeds(
			[0, 1, 2, 3, 4].map(item),
			{ onProgress: (d) => progress.push(d) },
			render
		)
		expect(peak).toBe(2)
		expect(progress).toEqual([0, 1, 2, 3, 4, 5])
		expect(res.map((r) => (r.ok ? r.pages[0] : r.error))).toEqual([
			'p0',
			'p1',
			'boom',
			'p3',
			'p4'
		])
	})

	it('does not start renders once aborted', async () => {
		const ctl = new AbortController()
		ctl.abort()
		let calls = 0
		const res = await renderEmbeds([item(0), item(1)], { signal: ctl.signal }, async () => {
			calls++
			return { pages: [], natural: { w: 0, h: 0 } }
		})
		expect(calls).toBe(0)
		expect(res.every((r) => !r.ok)).toBe(true)
	})

	it('resolves an empty batch', async () => {
		expect(await renderEmbeds([], {}, renderEmbed)).toEqual([])
	})
})

describe('renderEmbedMap', () => {
	const bus = {} as RenderEmbedOptions['bus']

	it('renders each distinct id once', async () => {
		const seen: RenderEmbedOptions[] = []
		const res = await renderEmbedMap(
			[
				{ id: 'a', fileId: 'f1', contentType: 't', navState: 'n1' },
				{ id: 'b', fileId: 'f2', contentType: 't' },
				{ id: 'a', fileId: 'f1', contentType: 't', navState: 'n1' }
			],
			{ bus, sourceFileId: 's', deadline: 42 },
			async (o) => {
				seen.push(o)
				return { pages: [o.targetFileId], natural: { w: 1, h: 1 } }
			}
		)
		expect(seen).toHaveLength(2)
		expect(seen[0]).toMatchObject({
			targetFileId: 'f1',
			sourceFileId: 's',
			nav: 'n1',
			deadline: 42
		})
		expect(seen[1].nav).toBeUndefined()
		expect([...res.keys()]).toEqual(['a', 'b'])
		expect(res.get('b')).toMatchObject({ ok: true, pages: ['f2'] })
	})

	it('resolves no refs without rendering', async () => {
		let calls = 0
		const res = await renderEmbedMap([], { bus, sourceFileId: 's' }, async () => {
			calls++
			return { pages: [], natural: { w: 0, h: 0 } }
		})
		expect(res.size).toBe(0)
		expect(calls).toBe(0)
	})
})

describe('renderEmbed', () => {
	const asked: Record<string, unknown>[] = []
	const bus = {
		requestEmbed: async (o: Record<string, unknown>) => {
			asked.push(o)
			return { embedUrl: 'about:blank', nonce: 'n1' }
		}
	} as unknown as RenderEmbedOptions['bus']
	const base = {
		bus,
		targetFileId: 'f2',
		targetContentType: 'cloudillo/calcillo',
		sourceFileId: 'f1'
	}
	const tick = () => new Promise((r) => setTimeout(r, 0))
	/** Post `type`/`payload` to this window as if the hidden iframe had sent it */
	const fromChild = (frame: HTMLIFrameElement, type: string, payload: unknown) =>
		window.dispatchEvent(
			new MessageEvent('message', {
				data: { cloudillo: true, v: PROTOCOL_VERSION, type, payload },
				source: frame.contentWindow
			})
		)

	beforeEach(() => {
		asked.length = 0
	})

	it('rejects past its deadline without asking the shell', async () => {
		await expect(renderEmbed({ ...base, deadline: Date.now() - 1 })).rejects.toThrow('deadline')
		expect(asked).toHaveLength(0)
	})

	it('boots read-only in render mode and tears down on abort', async () => {
		const ctl = new AbortController()
		const p = renderEmbed({ ...base, nav: 'A1:B2', signal: ctl.signal })
		await tick()
		expect(asked[0]).toMatchObject({ access: 'read', mode: 'render', navState: 'A1:B2' })
		const frame = document.querySelector('iframe') as HTMLIFrameElement
		expect(frame.getAttribute('sandbox')).toBeTruthy()
		expect(frame.src).toContain('#_embed:n1')
		ctl.abort()
		await expect(p).rejects.toThrow('aborted')
		expect(document.querySelector('iframe')).toBeNull()
	})

	it('requests on ready, sanitizes the answer and tears down', async () => {
		const p = renderEmbed({ ...base, page: { w: 100, h: 200 } })
		await tick()
		const frame = document.querySelector('iframe') as HTMLIFrameElement
		const sent: { type: string; payload: { reqId: string } }[] = []
		frame.contentWindow?.addEventListener('message', (e) => {
			sent.push((e as MessageEvent).data)
		})
		fromChild(frame, 'app:ready.notify', { stage: 'ready' })
		await tick()
		expect(sent[0]).toMatchObject({
			type: 'embed:render.req',
			payload: { page: { w: 100, h: 200 } }
		})
		const reqId = sent[0].payload.reqId
		fromChild(frame, 'embed:render.res', {
			reqId,
			ok: true,
			pages: [wrap('<rect/><script>x</script>')],
			natural: { w: 10, h: 10 }
		})
		const res = await p
		expect(res.natural).toEqual({ w: 10, h: 10 })
		expect(res.pages[0]).toContain('<rect')
		expect(res.pages[0]).not.toContain('script')
		expect(document.querySelector('iframe')).toBeNull()
	})

	it('rejects a failed render', async () => {
		const p = renderEmbed(base)
		await tick()
		const frame = document.querySelector('iframe') as HTMLIFrameElement
		const sent: { payload: { reqId: string } }[] = []
		frame.contentWindow?.addEventListener('message', (e) => {
			sent.push((e as MessageEvent).data)
		})
		fromChild(frame, 'app:ready.notify', {})
		await tick()
		fromChild(frame, 'embed:render.res', {
			reqId: sent[0].payload.reqId,
			ok: false,
			error: 'missing'
		})
		await expect(p).rejects.toThrow('missing')
		expect(document.querySelector('iframe')).toBeNull()
	})

	it('drops too large a total at the relay', async () => {
		const p = renderEmbed({ ...base, deadline: Date.now() + 200 })
		await tick()
		const frame = document.querySelector('iframe') as HTMLIFrameElement
		const sent: { payload: { reqId: string } }[] = []
		frame.contentWindow?.addEventListener('message', (e) => {
			sent.push((e as MessageEvent).data)
		})
		fromChild(frame, 'app:ready.notify', {})
		await tick()
		fromChild(frame, 'embed:render.res', {
			reqId: sent[0].payload.reqId,
			ok: true,
			// Each page within the schema bound, the sum over MAX_RENDER_TOTAL_SIZE
			pages: new Array(11).fill('x'.repeat(5 * 1024 * 1024)),
			natural: { w: 1, h: 1 }
		})
		await expect(p).rejects.toThrow('timed out')
	})

	it('fails fast when sanitizing throws', async () => {
		const p = renderEmbed(base)
		await tick()
		const frame = document.querySelector('iframe') as HTMLIFrameElement
		const sent: { payload: { reqId: string } }[] = []
		frame.contentWindow?.addEventListener('message', (e) => {
			sent.push((e as MessageEvent).data)
		})
		fromChild(frame, 'app:ready.notify', {})
		await tick()
		const serialize = XMLSerializer.prototype.serializeToString
		XMLSerializer.prototype.serializeToString = () => {
			throw new Error('serializer broke')
		}
		try {
			fromChild(frame, 'embed:render.res', {
				reqId: sent[0].payload.reqId,
				ok: true,
				pages: [wrap('<rect/>')],
				natural: { w: 1, h: 1 }
			})
			await expect(p).rejects.toThrow('serializer broke')
		} finally {
			XMLSerializer.prototype.serializeToString = serialize
		}
		expect(document.querySelector('iframe')).toBeNull()
	})

	it('drops an answer over the page bound at the relay', async () => {
		const p = renderEmbed({ ...base, deadline: Date.now() + 200 })
		await tick()
		const frame = document.querySelector('iframe') as HTMLIFrameElement
		const sent: { payload: { reqId: string } }[] = []
		frame.contentWindow?.addEventListener('message', (e) => {
			sent.push((e as MessageEvent).data)
		})
		fromChild(frame, 'app:ready.notify', {})
		await tick()
		fromChild(frame, 'embed:render.res', {
			reqId: sent[0].payload.reqId,
			ok: true,
			pages: new Array(MAX_RENDER_PAGES + 1).fill(wrap('')),
			natural: { w: 1, h: 1 }
		})
		await expect(p).rejects.toThrow('timed out')
	})

	it('releases the embed token when aborted before the shell answers', async () => {
		const posted: { type?: string; payload?: unknown }[] = []
		const fakeParent = { postMessage: (m: { type?: string }) => posted.push(m) }
		Object.defineProperty(window, 'parent', { value: fakeParent, configurable: true })
		try {
			let answer: (v: { embedUrl: string; nonce: string }) => void = () => {}
			const slowBus = {
				requestEmbed: () => new Promise((r) => (answer = r))
			} as unknown as RenderEmbedOptions['bus']
			const ctl = new AbortController()
			const p = renderEmbed({ ...base, bus: slowBus, signal: ctl.signal })
			ctl.abort()
			await expect(p).rejects.toThrow('aborted')
			answer({ embedUrl: 'about:blank', nonce: 'n9' })
			await tick()
			expect(posted).toContainEqual(
				expect.objectContaining({
					type: 'embed:close.notify',
					payload: { key: '_embed:n9' }
				})
			)
			expect(document.querySelector('iframe')).toBeNull()
		} finally {
			Object.defineProperty(window, 'parent', { value: window, configurable: true })
		}
	})
})

// vim: ts=4
