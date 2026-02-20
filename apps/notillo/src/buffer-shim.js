// Buffer polyfill for @react-pdf/renderer (expects Node.js Buffer global)
// Used via esbuild inject to rewrite bare `Buffer` references at bundle time
import { Buffer } from 'buffer'
export { Buffer }
