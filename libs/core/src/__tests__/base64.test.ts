// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { base64ToBytes, base64UrlToBytes, bytesToBase64, bytesToBase64Url } from '../base64.js'

function bytes(...values: number[]): Uint8Array {
	return new Uint8Array(values)
}

describe('bytesToBase64 / base64ToBytes', () => {
	it('round-trips arbitrary bytes', () => {
		const input = bytes(0, 1, 2, 127, 128, 254, 255)
		expect(base64ToBytes(bytesToBase64(input))).toEqual(input)
	})

	it('round-trips the empty buffer', () => {
		expect(bytesToBase64(bytes())).toBe('')
		expect(base64ToBytes('')).toEqual(bytes())
	})

	it('emits padded standard base64', () => {
		// 0x3e/0x3f are the two bytes whose encoding differs between the
		// standard and the url-safe alphabet.
		expect(bytesToBase64(bytes(0xfb, 0xff))).toBe('+/8=')
	})

	it('round-trips a buffer larger than the chunk size', () => {
		// The chunked loop exists so String.fromCharCode(...bytes) never spreads
		// a whole large array onto the call stack. 100_000 > CHUNK_SIZE (0x8000)
		// exercises it and would blow the stack without it.
		const big = new Uint8Array(100_000)
		for (let i = 0; i < big.length; i++) big[i] = i % 256
		expect(base64ToBytes(bytesToBase64(big))).toEqual(big)
	})
})

describe('bytesToBase64Url / base64UrlToBytes', () => {
	it('round-trips arbitrary bytes', () => {
		const input = bytes(0, 1, 2, 127, 128, 254, 255)
		expect(base64UrlToBytes(bytesToBase64Url(input))).toEqual(input)
	})

	it('uses the url-safe alphabet and drops padding', () => {
		const encoded = bytesToBase64Url(bytes(0xfb, 0xff))
		expect(encoded).toBe('-_8')
		expect(encoded).not.toMatch(/[+/=]/)
		expect(base64UrlToBytes(encoded)).toEqual(bytes(0xfb, 0xff))
	})

	it('accepts standard base64 unchanged', () => {
		// Callers can't always know which alphabet an input uses, so the decoder
		// takes either.
		expect(base64UrlToBytes('+/8=')).toEqual(bytes(0xfb, 0xff))
	})

	it('accepts input with and without padding', () => {
		// One, two and zero missing pad characters.
		expect(base64UrlToBytes('AQ')).toEqual(bytes(1))
		expect(base64UrlToBytes('AQI')).toEqual(bytes(1, 2))
		expect(base64UrlToBytes('AQID')).toEqual(bytes(1, 2, 3))
		expect(base64UrlToBytes('AQ==')).toEqual(bytes(1))
	})

	it('round-trips a buffer larger than the chunk size', () => {
		const big = new Uint8Array(100_000)
		for (let i = 0; i < big.length; i++) big[i] = (i * 7) % 256
		expect(base64UrlToBytes(bytesToBase64Url(big))).toEqual(big)
	})
})

// vim: ts=4
