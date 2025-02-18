const isProd = process.env.NODE_ENV === 'production'
import pkg from './package.json' with { type: 'json' }

import analyze from 'rollup-plugin-analyzer'
import replace from '@rollup/plugin-replace'
import resolve from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'
import typescript from '@rollup/plugin-typescript'
import json from '@rollup/plugin-json'
import terser from '@rollup/plugin-terser'
import progress from 'rollup-plugin-progress'
import postcss from 'rollup-plugin-postcss'
import gzip from 'rollup-plugin-gzip'
import { brotliCompress } from 'zlib'
import { promisify } from 'util'

import * as path from 'path'
import * as url from 'url'
const __dirname = url.fileURLToPath(new URL('.', import.meta.url))
const brotli = promisify(brotliCompress)

export default {
	input: 'src/index.tsx',
	output: {
		dir: `./dist/assets-${pkg.version}`,
		assetFileNames: '[name]-bundle.[ext]',
		name: 'main',
		sourcemap: !isProd,
		format: 'esm'
	},
	plugins: [
		json(),
		replace({
			preventAssignment: true,
			'process.env.NODE_ENV': JSON.stringify(isProd ? 'production' : 'development'),
			'process.env.CLOUDILLO_VERSION': JSON.stringify(pkg.version)
		}),
		resolve({ browser: true }),
		commonjs(),
		isProd && terser(),
		postcss({
			extract: 'bundle.css',
			minimize: isProd
		}),
		gzip(),
		gzip({
			customCompression: content => brotli(Buffer.from(content), { level: 11 }),
			fileName: '.br'
		}),
		progress(),
		typescript(!isProd ? { compilerOptions: { sourceMap: true, skipLibCheck: true }} : {}),
		isProd && analyze({ summaryOnly: true })
	],
	onwarn: (warning, warn) => {
		switch (warning.code) {
		case 'MODULE_LEVEL_DIRECTIVE':
			if (warning.message.includes('"use client"')) return
			break
		}
		//console.log('ONWARN', warning.code)
		warn(warning)
	},
	// This is needed because typescript generates buggy ES6 module files:
	//onwarn: (warning, warn) => warning.code === 'THIS_IS_UNDEFINED' || warn(warning)
}

// vim: ts=4
