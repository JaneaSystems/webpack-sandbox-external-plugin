# Webpack Sandbox External Plugin

This webpack plugin treats modules as externals in a way that doesn't cause errors when their required in an Electron sandbox.

It is heavily based on webpack's internal Webpack plugin.

Instead of outputting code like:
```javascript
module.exports = require('keytar');
```

It outputs code like this for externals:
```javascript
if (!process.sandboxed) module.exports = require('keytar');
```

## Install

```sh
yarn add -D webpack-sandbox-external-plugin
```

## Usage

Add the plugin to your `webpack` config. For example:

```javascript
const SandboxExternalPlugin = require('webpack-sandbox-external-plugin');

module.exports = {
  plugins: [
    new SanboxSafeExternalsPlugin(
      'commonjs', // output type
      ['sqlite3', 'keytar'], // modules to externalize
    ),
  ],
};
```

> :warning: Only works for commonjs outputs, currently.
