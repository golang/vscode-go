const gts = require('gts');

module.exports = [
	...gts,
	{
		ignores: ['out/**', 'dist/**', 'build/**', 'node_modules/**', '.vscode-test/**']
	},
	{
		linterOptions: {
			reportUnusedDisableDirectives: 'error'
		},
		rules: {
			// TODO(hxjiang): fix problem reported and enable all the rules below.
			'@typescript-eslint/no-floating-promises': 'off',
			'@typescript-eslint/no-explicit-any': 'off'
		}
	}
];
