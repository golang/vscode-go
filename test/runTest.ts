import * as path from 'path';
import { runTests } from 'vscode-test';

async function main() {
	// We are in test mode.
	process.env['VSCODE_GO_IN_TEST'] = '1';

	// The folder containing the Extension Manifest package.json
	// Passed to `--extensionDevelopmentPath`
	const extensionDevelopmentPath = path.resolve(__dirname, '../../');

	let failed = false;

	try {
		// The path to the extension test script
		// Passed to --extensionTestsPath
		const extensionTestsPath = path.resolve(__dirname, './integration/index');

		// Download VS Code, unzip it and run the integration test
		await runTests({
			extensionDevelopmentPath,
			extensionTestsPath,
			launchArgs: [
				'--disable-extensions',
				'--user-data-dir=${workspaceFolder}/.user-data-dir-test',
			],  // disable all other extensions
		});
	} catch (err) {
		console.error('Failed to run integration tests' + err);
		failed = true;
	}

	// Integration tests using gopls.
	try {
		// Note: Code in test environment does not support dynamically adding folders.
		// tslint:disable-next-line:max-line-length
		// https://github.com/microsoft/vscode/blob/890f62dfd9f3e70198931f788c5c332b3e8b7ad7/src/vs/workbench/services/workspaces/browser/abstractWorkspaceEditingService.ts#L281
		await runTests({
			extensionDevelopmentPath,
			extensionTestsPath: path.resolve(__dirname, './gopls/index'),
			launchArgs: [
				'--disable-extensions',  // disable all other extensions
				'--user-data-dir=${workspaceFolder}/.user-data-dir-test',
			],
		});
	} catch (err) {
		console.error('Failed to run gopls tests' + err);
		failed = true;
	}

	if (failed) {
		process.exit(1);
	}
}

main();
