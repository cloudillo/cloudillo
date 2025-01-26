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

import fs from 'fs'
import http from 'http'
import http2 from 'http2'
import tls from 'tls'
import https from 'https'
import Koa from 'koa'
import koaSend from 'koa-send'
import KoaRouter from 'koa-router'
import { koaBody } from 'koa-body'
import koaCORS from '@koa/cors'

import { AuthAdapter } from './auth-adapter.js'
import { MetaAdapter } from './meta-adapter.js'
import { BlobAdapter } from './blob-adapter.js'
import { CrdtAdapter } from './crdt-adapter.js'
import { DatabaseAdapter } from './database-adapter.js'
import { MessageBusAdapter } from './message-bus-adapter.js'
import { init as initAdapters } from './adapters.js'
import { init as initAuth, determineTenantTag, determineTnId, getAcmeChallengeResponse } from './auth/handlers.js'
import { init as initRoutes } from './routes.js'
import { init as initWebsocket } from './websocket.js'

/////////////////////
// Signal handlers //
/////////////////////
process.on('SIGINT', () => {
	console.log('received signal: SIGINT')
	process.exit()
})

process.on('SIGTERM', () => {
	console.log('received signal: SIGTERM')
	process.exit()
})

///////////////////////
// Application state //
///////////////////////
export interface Auth {
	idTag?: string
	roles: string[]
	subject?: string
}

export interface State {
	tnId: number
	tenantTag: string
	user?: {
		t: string
		u?: string
		r?: string[]
		sub?: string
	}
	auth?: Auth
}

export interface Context extends Koa.Context {
	config: Config
	state: State
	router: Router
}

export type App = Koa<State, Context>
export type Next = Koa.Next
export type Router = KoaRouter<State, Context>

/////////////////
// Middlewares //
/////////////////
function accept(ctx: Context, next: Next) {
	if (ctx.method === 'GET' || ctx.method === 'DELETE' || ctx.header['content-type'] === 'application/json') {
		return next()
	} else if (ctx.method == 'POST' && ctx.path.startsWith('/api/store/')) {
		return next()
	} else if (ctx.method == 'PUT' && ['/api/me/image', '/api/me/cover'].includes(ctx.path)) {
		return next()
	} else {
		console.log({ method: ctx.method, path: ctx.path })
		console.error('Invalid Content-Type: ' + ctx.header['content-type'])
		ctx.throw(400)
	}
}

//////////
// Init //
//////////
export interface Config {
	jwtSecret: string
	mode: 'standalone' | 'proxy'
	listen: number
	listenHttp?: number
	baseIdTag: string
	baseAppDomain?: string
	basePassword?: string
	distDir: string
	acmeEmail?: string
	localIps?: string[]
	localDomains?: string[]
}

export interface CloudilloOptions {
	config: Config
	authAdapter: AuthAdapter
	metaAdapter: MetaAdapter
	blobAdapter: BlobAdapter
	crdtAdapter: CrdtAdapter
	databaseAdapter: DatabaseAdapter
	messageBusAdapter: MessageBusAdapter
}

function createHttpsServer(authAdapter: AuthAdapter, callback: (req: http.IncomingMessage | http2.Http2ServerRequest, res: http.ServerResponse | http2.Http2ServerResponse) => Promise<void>) {
	const server = https.createServer({
		SNICallback: async function (hostname, cb) {
			if (hostname.startsWith('cl-o.')) {
				const certData = await authAdapter.getCertByTag(hostname.substring(5))
				if (!certData) return cb(new Error(`No certificate found for ${hostname}`), undefined)
				const sctx = tls.createSecureContext(certData)
				cb(null, sctx)
			} else {
				const certData = await authAdapter.getCertByDomain(hostname)
				if (!certData) return cb(new Error(`No certificate found for ${hostname}`), undefined)
				const sctx = tls.createSecureContext(certData)
				cb(null, sctx)
			}
		},
	}, callback)
	return server
}

function createHttp2Server(authAdapter: AuthAdapter, callback: (req: http.IncomingMessage | http2.Http2ServerRequest, res: http.ServerResponse | http2.Http2ServerResponse) => Promise<void>) {
	const server = http2.createSecureServer({
		allowHTTP1: true,
		SNICallback: async function (hostname, cb) {
			if (hostname.startsWith('cl-o.')) {
				const certData = await authAdapter.getCertByTag(hostname.substring(5))
				if (!certData) return cb(new Error(`No certificate found for ${hostname}`), undefined)
				const sctx = tls.createSecureContext(certData)
				cb(null, sctx)
			} else {
				const certData = await authAdapter.getCertByDomain(hostname)
				if (!certData) return cb(new Error(`No certificate found for ${hostname}`), undefined)
				const sctx = tls.createSecureContext(certData)
				cb(null, sctx)
			}
		},
	}, callback)
	return server
}

export function run({ config, authAdapter, metaAdapter, blobAdapter, crdtAdapter, databaseAdapter, messageBusAdapter }: CloudilloOptions) {
	const koa = new Koa<State, Context>()
	const router = new KoaRouter<State, Context>({ prefix: '/api' })
	koa.proxy = config.mode == 'proxy'
	koa.context.router = router
	koa.context.config = config

	console.log('====[ Cloudillo service booting ]===============================================')
	console.log(`Running in ${config.mode} mode`)

	koa
		.use(async (ctx, next) => {
			//if (ctx.method != 'OPTIONS' && ctx.hostname.startsWith('cl-o.')) {
			if (ctx.hostname.startsWith('cl-o.')) {
				ctx.state.tenantTag = determineTenantTag(ctx.hostname)
				const tnId = await determineTnId(ctx.hostname)
				if (!tnId) return ctx.throw(404)
				ctx.state.tnId = tnId

				// JWT
				let token: string | undefined

				const authHeader = ctx.header.authorization?.trim().split(' ')
				if (authHeader && authHeader[0] == 'Bearer') {
					token = authHeader[1]
				/*
				} else {
					token = ctx.cookies.get('token')
				*/
				}

				if (token) {
					try {
						ctx.state.user = await authAdapter.verifyAccessToken(ctx.state.tenantTag, token)
						ctx.state.auth = {
							idTag: ctx.state.user?.u || ctx.state.user?.t,
							roles: ctx.state.user?.r || [],
							subject: ctx.state.user?.sub
						}
					} catch (err) {
						console.log('JWT ERROR', err)
					}
				}
				// / JWT
			}
			return next()
		})
		.use(async (ctx, next) => {
			const start = Date.now()
			console.log(`HTTPS REQ 8<-------- ${ctx.request.ip} @${ctx.state.user?.t || '-'} ${ctx.hostname} ${ctx.method} ${ctx.path} ${ctx.querystring}`)
			try {
				await next()
				//console.log(`HTTPS REQ >8: ${ctx.request.ip} @${ctx.state.user?.t || '-'} ${Date.now() - start}ms ${ctx.status} ${ctx.hostname} ${ctx.method} ${ctx.path} ${ctx.querystring}`)
				console.log(`HTTPS REQ -------->8 ${ctx.request.ip} @${ctx.state.user?.t || '-'} ${ctx.status} ${ctx.hostname} ${ctx.method} ${ctx.path} ${Date.now() - start}ms`)
			} catch (err) {
				if (err instanceof Error && 'status' in err) {
					console.log(`HTTPS REQ -------->8 ${ctx.request.ip} @${ctx.state.user?.t || '-'} ${typeof err == 'object' && err && 'status' in err ? err.status : `500`} ${ctx.hostname} ${ctx.method} ${ctx.path} ${Date.now() - start}ms`)
				} else {
					console.log('ERROR', err)
				}
			}
		})
		.use(koaCORS({ origin: (ctx) => ctx.header.origin || '*', credentials: true }))
		//.use(koaCORS({ origin: (ctx) => { console.log('Headers', ctx.header); return ctx.header.origin || '*' }, credentials: true }))
		.use(async (ctx, next) => {
			if (!ctx.hostname.startsWith('cl-o.')) {
				//return koaStatic(config.distDir)(ctx, next)
				if (ctx.path.startsWith('/api/.well-known/')) return next()

				if (ctx.method == 'GET' || ctx.method == 'HEAD') {
					if (ctx.path == '/.well-known/cloudillo/id-tag') {
						const certData = await authAdapter.getCertByDomain(ctx.hostname)
						ctx.body = { idTag: certData?.idTag }
					} else {
						try {
							return await koaSend(ctx, ctx.path, { root: config.distDir, index: 'index.html', gzip: true, brotli: true })
						} catch (err) {
							if (err instanceof Error) {
								if ('status' in err && err.status == 404) {
									return koaSend(ctx, '/index.html', { root: config.distDir, gzip: true, brotli: true })
								} else {
									console.log('KOA SEND ERROR', err.toString())
									throw err
								}
							}
						}
					}
				} else {
					return next()
				}
			} else {
				return next()
			}
		})
		.use(accept)
		.use(koaBody({ multipart: true, jsonLimit: '10mb' }))
		.use(koa.context.router.routes())
		.use(koa.context.router.allowedMethods())

	const server = config.mode == 'standalone' ? createHttp2Server(authAdapter, koa.callback()) : http.createServer(koa.callback())
	//const server = config.mode == 'standalone' ? createHttpsServer(authAdapter, koa.callback()) : http.createServer(koa.callback())

	if (config.listenHttp) {
		const httpKoa = new Koa()
		const httpRouter = new KoaRouter()

		httpKoa
			.use(async (ctx, next) => {
				const start = Date.now()
				await next()
				console.log(`HTTP REQ: ${ctx.request.ip} @${ctx.state.user?.t || '-'} ${Date.now() - start}ms ${ctx.status} ${ctx.hostname} ${ctx.method} ${ctx.path} ${ctx.querystring}`)
			})
			.use(httpRouter.routes())
			.use(httpRouter.allowedMethods())

		const httpServer = http.createServer(httpKoa.callback())
		httpServer.listen(config.listenHttp, async () => {
			httpRouter.get('/.well-known/acme-challenge/:token', getAcmeChallengeResponse)
			httpRouter.get('{/*path}', ctx => ctx.redirect(`https://${ctx.hostname}${ctx.url}`))
			console.log(`Listening on HTTP port http://localhost:${config.listenHttp}`)
		})
	}

	server.listen(config.listen, async () => {
		console.log(`Listening on HTTPS port ${config.mode == 'standalone' ? 'https' : 'http'}://localhost:${config.listen}`)
		await initWebsocket(server, authAdapter, config)
		await initAdapters({
			metaAdapter,
			blobAdapter,
			crdtAdapter,
			databaseAdapter,
			messageBusAdapter
		})
		await initAuth(authAdapter, { acmeEmail: config.acmeEmail })
		await initRoutes(router)
		console.log('====[ Cloudillo service ready ]=================================================')
	})
}

// vim: ts=4
