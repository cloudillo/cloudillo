#!/usr/bin/env node

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs'
import { join, extname } from 'path'
import { gzipSync, brotliCompressSync, constants } from 'zlib'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, '..')

// File extensions to compress
const COMPRESSIBLE_EXTENSIONS = ['.js', '.css', '.html', '.json', '.svg', '.xml']

// Minimum file size to compress (in bytes)
const MIN_SIZE = 1024 // 1KB

function shouldCompress(filename) {
	const ext = extname(filename)
	return COMPRESSIBLE_EXTENSIONS.includes(ext)
}

function compressFile(filePath) {
	const content = readFileSync(filePath)

	// Skip small files
	if (content.length < MIN_SIZE) {
		return
	}

	// Gzip compression
	const gzipped = gzipSync(content, {
		level: 9
	})
	writeFileSync(`${filePath}.gz`, gzipped)

	// Brotli compression
	const brotlied = brotliCompressSync(content, {
		params: {
			[constants.BROTLI_PARAM_QUALITY]: 11,
			[constants.BROTLI_PARAM_SIZE_HINT]: content.length
		}
	})
	writeFileSync(`${filePath}.br`, brotlied)

	const gzipRatio = ((1 - gzipped.length / content.length) * 100).toFixed(1)
	const brotliRatio = ((1 - brotlied.length / content.length) * 100).toFixed(1)

	console.log(`  ${filePath}`)
	console.log(`    gzip:   ${content.length} → ${gzipped.length} bytes (${gzipRatio}% smaller)`)
	console.log(
		`    brotli: ${content.length} → ${brotlied.length} bytes (${brotliRatio}% smaller)`
	)
}

function compressDirectory(dirPath) {
	const entries = readdirSync(dirPath)

	for (const entry of entries) {
		const fullPath = join(dirPath, entry)
		const stat = statSync(fullPath)

		if (stat.isDirectory()) {
			compressDirectory(fullPath)
		} else if (stat.isFile() && shouldCompress(entry)) {
			compressFile(fullPath)
		}
	}
}

console.log('🗜️  Compressing files...\n')

// Compress dist directory
const distDir = join(rootDir, 'dist')
compressDirectory(distDir)

console.log('\n✅ Compression complete!')

// vim: ts=4
