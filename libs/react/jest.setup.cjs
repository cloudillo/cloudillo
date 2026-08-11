// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

// jsdom does not provide TextEncoder/TextDecoder. react-router touches them at
// module-evaluation time, so any component test that transitively imports it
// (e.g. anything reaching the `components/Profile` barrel) fails to even load.
const { TextDecoder, TextEncoder } = require('node:util')

if (typeof globalThis.TextEncoder === 'undefined') globalThis.TextEncoder = TextEncoder
if (typeof globalThis.TextDecoder === 'undefined') globalThis.TextDecoder = TextDecoder

// vim: ts=4
