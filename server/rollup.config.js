const isProd = process.env.NODE_ENV === 'production'

import analyze from 'rollup-plugin-analyzer'
import replace from '@rollup/plugin-replace'
import resolve from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'
import typescript from '@rollup/plugin-typescript'
import json from '@rollup/plugin-json'
import terser from '@rollup/plugin-terser'
import progress from 'rollup-plugin-progress'

import * as url from 'url'
const __dirname = url.fileURLToPath(new URL('.', import.meta.url))

export default {
	input: ['src/index.ts'],
	output: {
		dir: './dist',
		assetFileNames: '[name]-bundle.[ext]',
		name: 'main',
		sourcemap: !isProd,
		//format: 'esm'
		format: 'esm'
	},
	plugins: [
		json(),
		replace({
			preventAssignment: true,
			'process.env.NODE_ENV': JSON.stringify(isProd ? 'production' : 'development'),
		}),
		resolve({
			exportConditions: ['node'],
			resolveOnly: module => !module.includes(['leveldown', 'sqlite3'])
		}),
		commonjs(),
		//isProd && terser(),
		//isProd && terser({ toplevel: true, mangle: { properties: true, eval: true, toplevel: true }}),
		isProd && terser({
			toplevel: true,
			mangle: {
				eval: true,
				toplevel: true
			}}),
		progress(),
		typescript({ compilerOptions: { outDir: undefined, declaration: false } }),
		isProd && analyze({ summaryOnly: true })
	],
	// This is needed because typescript generates buggy ES6 module files:
	onwarn: (warning, warn) => warning.code === 'THIS_IS_UNDEFINED' || warn(warning)
}

// vim: ts=4
