# @cloudillo/types

Shared TypeScript types and runtype validators for [Cloudillo](https://cloudillo.org) — the open-source decentralized collaboration platform.

## Install

    npm install @cloudillo/types

## Usage

```ts
import * as T from '@symbion/runtype'
import { tAction } from '@cloudillo/types'

const result = T.decode(tAction, data)
if (T.isOk(result)) {
    // result.ok is a typed Action
}
```

## Links

- Website: https://cloudillo.org
- Source: https://github.com/cloudillo/cloudillo/tree/main/libs/types
- Issues: https://github.com/cloudillo/cloudillo/issues

## License

LGPL-3.0-or-later
