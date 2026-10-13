// react-native-svg still imports @react-native/assets-registry/registry,
// which React Native 0.87 folded into react-native itself.
const {AssetRegistry} = require('react-native/src/private/assets/AssetRegistry');

module.exports = AssetRegistry;
