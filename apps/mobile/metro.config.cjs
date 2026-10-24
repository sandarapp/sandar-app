/* eslint-disable @typescript-eslint/no-require-imports -- Expo loads Metro configuration as CommonJS. */
const { getDefaultConfig } = require('expo/metro-config');
const { resolve } = require('node:path');
const config = getDefaultConfig(__dirname);
// Shared source lives outside the app workspaces; Metro must watch its exports too.
config.watchFolders = [...config.watchFolders, resolve(__dirname, '../../packages')];
// Shared NodeNext source uses .js specifiers. Resolve those to source only inside our package.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (context.originModulePath.includes('/packages/auth-client/') && moduleName.startsWith('.') && moduleName.endsWith('.js')) {
    return context.resolveRequest(context,moduleName.slice(0,-3),platform);
  }
  return context.resolveRequest(context,moduleName,platform);
};
module.exports = config;
