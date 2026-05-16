# @cloudillo/core

Client SDK, API client, and app message bus for [Cloudillo](https://cloudillo.org) — the building blocks for apps that run on the decentralized collaboration platform.

## Install

    npm install @cloudillo/core

## Usage

Cloudillo plugin apps run inside a sandboxed iframe and communicate with the shell over a typed message bus:

```ts
import { getAppBus } from '@cloudillo/core'

const bus = getAppBus()
const state = await bus.init('myapp')
// state.accessToken, state.idTag, state.access ('read' | 'write'), state.darkMode, ...
```

## Links

- Website: https://cloudillo.org
- Source: https://github.com/cloudillo/cloudillo/tree/main/libs/core
- Issues: https://github.com/cloudillo/cloudillo/issues

## License

LGPL-3.0-or-later
