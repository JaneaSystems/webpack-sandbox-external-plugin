/* SandboxSafeExternalModule,
 * SandboxSafeExternalModuleFactoryPlugin and
 * SandboxSafeExternalsPlugin
 * are based on:
 *  - webpack/lib/ExternalModule.js
 *  - webpack/lib/ExternalModuleFactoryPlugin.js
 *  - webpack/lib/ExternalsPlugin.js
 * Original MIT license:
 */
/*
    MIT License http://www.opensource.org/licenses/mit-license.php
    Author Tobias Koppers @sokra
*/
'use strict';

const { OriginalSource, RawSource } = require('webpack-sources');
const { Module } = require('webpack');

class SandboxSafeExternalModule extends Module {
  constructor(request, type, userRequest) {
    super('javascript/dynamic', null);

    // Info from Factory
    this.request = request;
    this.externalType = type;
    this.userRequest = userRequest;
    this.external = true;
  }

  libIdent() {
    return this.userRequest;
  }

  chunkCondition(chunk) {
    return chunk.hasEntryModule();
  }

  identifier() {
    return 'external ' + JSON.stringify(this.request);
  }

  readableIdentifier() {
    return 'external ' + JSON.stringify(this.request);
  }

  needRebuild() {
    return false;
  }

  build(options, compilation, resolver, fs, callback) {
    this.built = true;
    this.buildMeta = {};
    this.buildInfo = {};
    callback();
  }

  getSourceForCommonJsExternal(moduleAndSpecifiers) {
    if (!Array.isArray(moduleAndSpecifiers)) {
      return `if(!process.sandboxed) module.exports = require(${JSON.stringify(
          moduleAndSpecifiers,
      )});`;
    }

    const moduleName = moduleAndSpecifiers[0];
    const objectLookup = moduleAndSpecifiers
        .slice(1)
        .map((r) => `[${JSON.stringify(r)}]`)
        .join('');
    return `if(!process.sandboxed) module.exports = require(${JSON.stringify(
        moduleName,
    )})${objectLookup};`;
  }

  getSourceString(runtime) {
    const request =
      typeof this.request === 'object' && !Array.isArray(this.request) ?
        this.request[this.externalType] :
        this.request;
    switch (this.externalType) {
      case 'commonjs':
      case 'commonjs2':
        return this.getSourceForCommonJsExternal(request);
      default:
        throw new Error(
            `External type not recognized for ` +
            `SandboxSafeExternalPlugin: ${this.externalType}`,
        );
    }
  }

  getSource(sourceString) {
    if (this.useSourceMap) {
      return new OriginalSource(sourceString, this.identifier());
    }

    return new RawSource(sourceString);
  }

  source(dependencyTemplates, runtime) {
    return this.getSource(this.getSourceString(runtime));
  }

  size() {
    return 42;
  }

  /**
   * @param {Hash} hash the hash used to track dependencies
   * @returns {void}
   */
  updateHash(hash) {
    hash.update(this.externalType);
    hash.update(JSON.stringify(this.request));
    hash.update(JSON.stringify(Boolean(this.optional)));
    super.updateHash(hash);
  }
}

class SandboxSafeExternalModuleFactoryPlugin {
  constructor(type, externals) {
    this.type = type;
    this.externals = externals;
  }

  apply(normalModuleFactory) {
    const globalType = this.type;
    normalModuleFactory.hooks.factory.tap(
        'SandboxSafeExternalModuleFactoryPlugin',
        (factory) => (data, callback) => {
          const context = data.context;
          const dependency = data.dependencies[0];

          const handleExternal = (value, type, callback) => {
            if (typeof type === 'function') {
              callback = type;
              type = undefined;
            }
            if (value === false) return factory(data, callback);
            if (value === true) value = dependency.request;
            if (type === undefined && /^[a-z0-9]+ /.test(value)) {
              const idx = value.indexOf(' ');
              type = value.substr(0, idx);
              value = value.substr(idx + 1);
            }
            callback(
                null,
                new SandboxSafeExternalModule(value,
                    type || globalType, dependency.request),
            );
            return true;
          };

          const handleExternals = (externals, callback) => {
            if (typeof externals === 'string') {
              if (externals === dependency.request) {
                return handleExternal(dependency.request, callback);
              }
            } else if (Array.isArray(externals)) {
              let i = 0;
              const next = () => {
                let asyncFlag;
                const handleExternalsAndCallback = (err, module) => {
                  if (err) return callback(err);
                  if (!module) {
                    if (asyncFlag) {
                      asyncFlag = false;
                      return;
                    }
                    return next();
                  }
                  callback(null, module);
                };

                do {
                  asyncFlag = true;
                  if (i >= externals.length) return callback();
                  handleExternals(externals[i++], handleExternalsAndCallback);
                } while (!asyncFlag);
                asyncFlag = false;
              };

              next();
              return;
            } else if (externals instanceof RegExp) {
              if (externals.test(dependency.request)) {
                return handleExternal(dependency.request, callback);
              }
            } else if (typeof externals === 'function') {
              externals.call(
                  null,
                  context,
                  dependency.request,
                  (err, value, type) => {
                    if (err) return callback(err);
                    if (value !== undefined) {
                      handleExternal(value, type, callback);
                    } else {
                      callback();
                    }
                  },
              );
              return;
            } else if (
              typeof externals === 'object' &&
              Object.prototype.hasOwnProperty.call(externals,
                  dependency.request)
            ) {
              return handleExternal(externals[dependency.request], callback);
            }
            callback();
          };

          handleExternals(this.externals, (err, module) => {
            if (err) return callback(err);
            if (!module) return handleExternal(false, callback);
            return callback(null, module);
          });
        },
    );
  }
}

class SandboxSafeExternalsPlugin {
  constructor(type, externals) {
    this.type = type;
    this.externals = externals;
  }
  apply(compiler) {
    compiler.hooks.compile.tap('SandboxSafeExternalsPlugin',
        ({ normalModuleFactory }) => {
          new SandboxSafeExternalModuleFactoryPlugin(
              this.type,
              this.externals,
          ).apply(
              normalModuleFactory,
          );
        },
    );
  }
}

module.exports = SandboxSafeExternalsPlugin;
