/**
 * jsdom does not expose TextEncoder/TextDecoder, which every browser and every
 * ServiceWorker does — `jwt.ts` decodes payloads with them. Borrow Node's.
 */
const { TextDecoder, TextEncoder } = require('node:util')

if (typeof globalThis.TextEncoder === 'undefined') globalThis.TextEncoder = TextEncoder
if (typeof globalThis.TextDecoder === 'undefined') globalThis.TextDecoder = TextDecoder
