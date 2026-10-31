module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', '.eslintrc.cjs'],
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  settings: { react: { version: '18.2' } },
  plugins: ['react-refresh'],
  rules: {
    // Varios módulos exportan a propósito helpers junto a sus componentes (buses de efectos, constantes)
    'react-refresh/only-export-components': 'off',
    // JS plano sin PropTypes
    'react/prop-types': 'off',
  },
}
