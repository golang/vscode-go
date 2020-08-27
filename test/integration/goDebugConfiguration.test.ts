import assert = require('assert');
import fs = require('fs');
import os = require('os');
import path = require('path');
import sinon = require('sinon');
import vscode = require('vscode');
import { GoDebugConfigurationProvider } from '../../src/goDebugConfiguration';
import goEnv = require('../../src/goEnv');
import { updateGoVarsFromConfig } from '../../src/goInstallTools';
import { getCurrentGoPath, rmdirRecursive } from '../../src/util';

suite('Debug Environment Variable Merge Test', () => {
	const debugConfigProvider = new GoDebugConfigurationProvider();

	suiteSetup(async () => {
		await updateGoVarsFromConfig();

		// Set up the test fixtures.
		const fixtureSourcePath = path.join(__dirname, '..', '..', '..', 'test', 'fixtures');
		const filePath = path.join(fixtureSourcePath, 'baseTest', 'test.go');
		await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
	});

	suiteTeardown(() => {
		vscode.commands.executeCommand('workbench.action.closeActiveEditor');
	});

	let sandbox: sinon.SinonSandbox;
	let tmpDir = '';
	const toolExecutionEnv: NodeJS.Dict<string> = {};
	setup(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'godebugconfig_test'));
		sandbox = sinon.createSandbox();

	});

	teardown(() => {
		sandbox.restore();
		rmdirRecursive(tmpDir);
	});

	interface Input {
		env?: { [key: string]: any };
		envFile?: string|string[];
		toolsEnv?: { [key: string]: any};
	}

	function runTest(input: Input,	expected: { [key: string]: any}) {
		sandbox.stub(goEnv, 'toolExecutionEnvironment').returns(input.toolsEnv || {});
		const config = debugConfigProvider.resolveDebugConfigurationWithSubstitutedVariables(undefined, {
			type: 'go',
			name: 'Launch',
			request: 'launch',
			env: input.env,
			envFile: input.envFile,
		});

		const actual = config.env;
		assert.deepStrictEqual(actual, expected);
	}

	test('works with empty launchArgs', () => {
		runTest({}, {});
	});

	test('toolsEnvVars is propagated', () => {
		const toolsEnv = {
			GOPATH: '/gopath',
			GOOS: 'valueFromToolsEnv'};

		runTest({toolsEnv}, {
			GOPATH: '/gopath',
			GOOS: 'valueFromToolsEnv'});
	});

	test('preserves settings from launchArgs.env', () => {
		const env = {GOPATH: 'valueFromEnv', GOOS: 'valueFromEnv2'};
		runTest({env}, {
			GOPATH: 'valueFromEnv',
			GOOS: 'valueFromEnv2'});
	});

	test('preserves settings from launchArgs.envFile', () => {
		const envFile = path.join(tmpDir, 'env');
		fs.writeFileSync(envFile, 'GOPATH=valueFromEnvFile');
		runTest({envFile}, {GOPATH: 'valueFromEnvFile'});
	});

	test('launchArgs.env overwrites launchArgs.envFile', () => {
		const env = {SOMEVAR1: 'valueFromEnv'};
		const envFile = path.join(tmpDir, 'env');
		fs.writeFileSync(envFile, [
			'SOMEVAR1=valueFromEnvFile1',
			'SOMEVAR2=valueFromEnvFile2'].join('\n'));

		runTest({ env, envFile }, {
			SOMEVAR1: 'valueFromEnv',
			SOMEVAR2: 'valueFromEnvFile2'});
	});

	test('launchArgs.env overwrites toolsEnvVar', () => {
		const toolsEnv = {
			GOPATH: '/gopath',
			SOMEVAR1: 'valueFromToolsEnvVar1',
			SOMEVAR2: 'valueFromToolsEnvVar2'
		};

		const env = {SOMEVAR1: 'valueFromEnv'};
		runTest({ env, toolsEnv }, {
			GOPATH: '/gopath',
			SOMEVAR1: 'valueFromEnv',
			SOMEVAR2: 'valueFromToolsEnvVar2'});
	});

	test('launchArgs.envFile overwrites toolsEnvVar', () => {
		const toolsEnv = {
			GOPATH: '/gopath',
			SOMEVAR1: 'valueFromToolsEnvVar1',
			SOMEVAR2: 'valueFromToolsEnvVar2'
		};
		const envFile = path.join(tmpDir, 'env');
		fs.writeFileSync(envFile, [
			'SOMEVAR2=valueFromEnvFile2'].join('\n'));

		runTest({ toolsEnv, envFile }, {
			GOPATH: '/gopath',
			SOMEVAR1: 'valueFromToolsEnvVar1',
			SOMEVAR2: 'valueFromEnvFile2'});
	});
});
