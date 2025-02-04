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

import * as path from 'path'
import * as url from 'url'
const __dirname = url.fileURLToPath(new URL('.', import.meta.url))

export default {
	input: 'sw/index.ts',
	output: {
		file: `./dist/sw-${pkg.version}.js`,
		name: 'main',
		sourcemap: !isProd,
		format: 'esm'
	},
	plugins: [
		//json(),
		//replace({
		//	preventAssignment: true,
		//	'process.env.NODE_ENV': JSON.stringify(isProd ? 'production' : 'development'),
		//}),
		//resolve({ browser: true, extensions: ['.ts', '.tsx', '.js'] }),
		//commonjs(),
		//isProd && terser(),
		progress(),
		typescript(),
		//typescript({ compilerOptions: { lib: ['webworker'] }}),
		//typescript({ compilerOptions: { sourceMap: !isProd, skipLibCheck: true, lib: ['WebWorker'] }}),
		//typescript(!isProd ? { compilerOptions: { sourceMap: true, skipLibCheck: true, lib: ['WebWorker'] }} : {}),
		gzip(),
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
