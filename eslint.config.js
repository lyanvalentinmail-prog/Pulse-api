const globals = require('globals');

module.exports = [{
  files: ['**/*.js'],
  ignores: ['node_modules/**'],
  languageOptions: {
    ecmaVersion: 'latest',
    sourceType: 'commonjs',
    globals: { ...globals.node, ...globals.browser }
  },
  rules: {
    'no-undef': 'error',
    'no-dupe-keys': 'error',
    'no-unreachable': 'error'
  }
}];
