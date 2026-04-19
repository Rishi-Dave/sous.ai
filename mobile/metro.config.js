// Custom Metro config: register `.ppn` as an asset extension so we can
// `require('./assets/hey_sous.ppn')` and load it through `expo-asset` at runtime.
// PorcupineManager needs an absolute filesystem path to the keyword model.

const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
if (!config.resolver.assetExts.includes('ppn')) {
  config.resolver.assetExts.push('ppn');
}

module.exports = config;
