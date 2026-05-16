# @cloudillo/react

React hooks and component library for [Cloudillo](https://cloudillo.org) apps — auth, real-time data, i18n, and OpalUI integration.

## Install

    npm install @cloudillo/react react react-dom

## Usage

```tsx
import { useAuth, useApi, useCloudilloEditor } from '@cloudillo/react'
import '@cloudillo/react/components.css'

function Editor() {
    const auth = useAuth()
    const api = useApi()
    const { yDoc, provider, synced } = useCloudilloEditor('myapp')
    return synced ? <div>ready</div> : <div>loading…</div>
}
```

## Peer dependencies

`react ^19.1.0`, `react-dom ^19.1.0`

## Links

- Website: https://cloudillo.org
- Source: https://github.com/cloudillo/cloudillo/tree/main/libs/react
- Issues: https://github.com/cloudillo/cloudillo/issues

## License

LGPL-3.0-or-later
