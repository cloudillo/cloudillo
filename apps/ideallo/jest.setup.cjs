/**
 * jsdom ships no TextEncoder/TextDecoder, and react-router - pulled in transitively by any test
 * that imports an ideallo component - reaches for them at module scope.
 */
const { TextDecoder, TextEncoder } = require('node:util')

if (!globalThis.TextEncoder) globalThis.TextEncoder = TextEncoder
if (!globalThis.TextDecoder) globalThis.TextDecoder = TextDecoder
