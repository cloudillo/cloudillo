/**
 * jsdom does not expose TextEncoder/TextDecoder, which every browser and every
 * ServiceWorker does — `@cloudillo/core/jwt` decodes payloads with them, and
 * without this every token silently reads as unparseable. Borrow Node's.
 * (libs/core/jest.setup.cjs does the same for its own jsdom suites.)
 */
const { TextDecoder, TextEncoder } = require('node:util')

if (typeof globalThis.TextEncoder === 'undefined') globalThis.TextEncoder = TextEncoder
if (typeof globalThis.TextDecoder === 'undefined') globalThis.TextDecoder = TextDecoder
