const gts = require('gts');

module.exports = [
	...gts,
	{
		ignores: ['out/**', 'dist/**', 'build/**', 'node_modules/**', '.vscode-test/**']
	},
	{
		linterOptions: {
			reportUnusedDisableDirectives: 'warn'
		},
		rules: {
			// TODO(hxjiang): fix problem reported and enable all the rules below.
			'@typescript-eslint/no-floating-promises': 'off',
			'@typescript-eslint/no-explicit-any': 'off',
			'@typescript-eslint/no-unused-vars': 'off',
			'n/no-missing-import': 'off',
			'n/no-unpublished-import': 'off',
			'n/no-extraneous-import': 'off',
			'n/no-deprecated-api': 'off',
			'n/no-unsupported-features/node-builtins': 'off'
		}
	}
];
