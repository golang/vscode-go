/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-prototype-builtins */
import assert = require('assert');
import fs = require('fs');
import os = require('os');
import path = require('path');
import sinon = require('sinon');
import vscode = require('vscode');
import { extensionInfo, getGoConfig } from '../../src/config';
import { extensionId } from '../../src/const';
import { GoDebugConfigurationProvider, maybeJoinFlags } from '../../src/goDebugConfiguration';
import * as goInstallTools from '../../src/goInstallTools';
import { rmdirRecursive } from '../../src/util';
import { MockCfg } from '../mocks/MockCfg';
import { MockWorkspaceConfiguration } from './mocks/configuration';
import { affectedByIssue832 } from './testutils';
import goEnv = require('../../src/goEnv');

suite('Debug Environment Variable Merge Test', () => {
	const debugConfigProvider = new GoDebugConfigurationProvider();

	// Set up the test fixtures.
	const fixtureSourcePath = path.join(__dirname, '..', '..', '..', 'test', 'testdata');
	const filePath = path.join(fixtureSourcePath, 'baseTest', 'test.go');

	// updateGoVarsFromConfig mutates process.env.
	// Stash the original value and restore it in suiteTeardown.
	// TODO: avoid updateGoVarsFromConfig.
	const prevEnv = Object.assign({}, process.env);
	suiteSetup(async () => {
		await goInstallTools.updateGoVarsFromConfig({});
		await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
	});

	suiteTeardown(() => {
		vscode.commands.executeCommand('workbench.action.closeActiveEditor');
		process.env = prevEnv;
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
		debugAdapter?: 'dlv-dap' | 'legacy';
		env?: { [key: string]: any };
		envFile?: string | string[];
		toolsEnv?: { [key: string]: any };
	}

	function runTest(input: Input, expected: { [key: string]: any }) {
		sandbox.stub(goEnv, 'toolExecutionEnvironment').returns(input.toolsEnv || {});
		const config = debugConfigProvider.resolveDebugConfigurationWithSubstitutedVariables(undefined, {
			type: 'go',
			name: 'Launch',
			request: 'launch',
			env: input.env,
			envFile: input.envFile,
			debugAdapter: input.debugAdapter,
			program: filePath
		});

		const actual = config?.env;
		assert.deepStrictEqual(actual, expected);
	}

	test('works with empty launchArgs', () => {
		runTest({}, {});
	});

	test('toolsEnvVars is propagated (legacy)', () => {
		const debugAdapter = 'legacy';
		const toolsEnv = {
			GOPATH: '/gopath',
			GOOS: 'valueFromToolsEnv'
		};

		runTest(
			{
				debugAdapter,
				toolsEnv
			},
			{
				GOPATH: '/gopath',
				GOOS: 'valueFromToolsEnv'
			}
		);
	});

	test('toolsEnvVars is propagated', () => {
		const toolsEnv = {
			GOPATH: '/gopath',
			GOOS: 'valueFromToolsEnv'
		};

		runTest(
			{
				toolsEnv
			},
			toolsEnv
		);
	});

	test('preserves settings from launchArgs.env', () => {
		const env = { GOPATH: 'valueFromEnv', GOOS: 'valueFromEnv2' };
		runTest(
			{ env },
			{
				GOPATH: 'valueFromEnv',
				GOOS: 'valueFromEnv2'
			}
		);
	});

	test('preserves settings from launchArgs.envFile', () => {
		const envFile = path.join(tmpDir, 'env');
		fs.writeFileSync(envFile, 'GOPATH=valueFromEnvFile');
		runTest({ envFile }, { GOPATH: 'valueFromEnvFile' });
	});

	test('launchArgs.env overwrites launchArgs.envFile', () => {
		const env = { SOMEVAR1: 'valueFromEnv' };
		const envFile = path.join(tmpDir, 'env');
		fs.writeFileSync(envFile, ['SOMEVAR1=valueFromEnvFile1', 'export SOMEVAR2=valueFromEnvFile2'].join('\n'));

		runTest(
			{ env, envFile },
			{
				SOMEVAR1: 'valueFromEnv',
				SOMEVAR2: 'valueFromEnvFile2'
			}
		);
	});

	test('launchArgs.env overwrites toolsEnvVar (legacy)', () => {
		const toolsEnv = {
			GOPATH: '/gopath',
			SOMEVAR1: 'valueFromToolsEnvVar1',
			SOMEVAR2: 'valueFromToolsEnvVar2'
		};

		const debugAdapter = 'legacy';
		const env = { SOMEVAR1: 'valueFromEnv' };
		runTest(
			{ debugAdapter, env, toolsEnv },
			{
				GOPATH: '/gopath',
				SOMEVAR1: 'valueFromEnv',
				SOMEVAR2: 'valueFromToolsEnvVar2'
			}
		);
	});

	test('launchArgs.env and toolsEnvVar is respected', () => {
		const toolsEnv = {
			GOPATH: '/gopath',
			SOMEVAR1: 'valueFromToolsEnvVar1',
			SOMEVAR2: 'valueFromToolsEnvVar2'
		};

		const env = { SOMEVAR1: 'valueFromEnv' };
		runTest(
			{ env, toolsEnv },
			{
				GOPATH: '/gopath',
				SOMEVAR1: 'valueFromEnv',
				SOMEVAR2: 'valueFromToolsEnvVar2'
			}
		);
	});

	test('launchArgs.envFile overwrites toolsEnvVar (legacy)', () => {
		const toolsEnv = {
			GOPATH: '/gopath',
			SOMEVAR1: 'valueFromToolsEnvVar1',
			SOMEVAR2: 'valueFromToolsEnvVar2'
		};
		const envFile = path.join(tmpDir, 'env');
		fs.writeFileSync(envFile, ['SOMEVAR2=valueFromEnvFile2'].join('\n'));

		const debugAdapter = 'legacy';
		runTest(
			{ debugAdapter, toolsEnv, envFile },
			{
				GOPATH: '/gopath',
				SOMEVAR1: 'valueFromToolsEnvVar1',
				SOMEVAR2: 'valueFromEnvFile2'
			}
		);
	});

	test('launchArgs.envFile and toolsEnvVar are repected (dlv-dap)', () => {
		const toolsEnv = {
			GOPATH: '/gopath',
			SOMEVAR1: 'valueFromToolsEnvVar1',
			SOMEVAR2: 'valueFromToolsEnvVar2'
		};
		const envFile = path.join(tmpDir, 'env');
		fs.writeFileSync(envFile, ['SOMEVAR2=valueFromEnvFile2'].join('\n'));

		const debugAdapter = 'dlv-dap';
		runTest(
			{ debugAdapter, toolsEnv, envFile },
			{
				GOPATH: '/gopath',
				SOMEVAR1: 'valueFromToolsEnvVar1',
				SOMEVAR2: 'valueFromEnvFile2'
			}
		);
	});
});

suite('Debug Configuration Merge User Settings', () => {
	const debugConfigProvider = new GoDebugConfigurationProvider();
	const config = require('../../src/config');

	teardown(() => sinon.restore());

	suite("merge 'go' config from settings.json", () => {
		test('default settings are applied', async () => {
			const defaultConfig = vscode.extensions.getExtension(extensionId)?.packageJSON.contributes.configuration
				.properties['go.delveConfig'].properties;

			// Run resolveDebugConfiguration with the default workspace settings.
			const cfg1 = {
				name: 'Launch',
				type: 'go',
				request: 'launch',
				mode: 'auto',
				program: '${fileDirname}'
			};

			const defaultResult = await debugConfigProvider.resolveDebugConfiguration(undefined, cfg1);
			assert(defaultResult);
			assert.strictEqual(defaultResult.showGlobalVariables, defaultConfig.showGlobalVariables.default);
			assert.strictEqual(defaultResult.showRegisters, defaultConfig.showRegisters.default);
			assert.strictEqual(defaultResult.hideSystemGoroutines, defaultConfig.hideSystemGoroutines.default);
			assert.strictEqual(defaultResult.showLog, defaultConfig.showLog.default);
			assert.strictEqual(defaultResult.logOutput, defaultConfig.logOutput.default);
			assert.strictEqual(defaultResult.debugAdapter, defaultConfig.debugAdapter.default);
			assert.deepStrictEqual(defaultResult.dlvFlags, defaultConfig.dlvFlags.default);
			assert.deepStrictEqual(defaultResult.substitutePath, defaultConfig.substitutePath.default);
		});

		test('go flags config does not affect debug config', async () => {
			// This tests that the testFlags and GOOS and GOARCH set
			// in settings.json do not affect the resolved debug configuration.
			// When this expected behavior changes, this test can be updated.

			// Run resolveDebugConfiguration with the default workspace settings.
			const cfg1 = {
				name: 'Launch',
				type: 'go',
				request: 'launch',
				mode: 'auto',
				program: '${fileDirname}'
			};

			const emptyResult = await debugConfigProvider.resolveDebugConfiguration(undefined, cfg1);
			const goConfig = Object.create(getGoConfig(), {
				testFlags: { value: '-tags=myTagTest' },
				buildFlags: { value: '-tags=myTagBuild' },
				goroot: { value: '/path/to/goroot' },
				gopath: { value: '/path/to/gopath' }
			}) as vscode.WorkspaceConfiguration;

			// Adjust the workspace config.
			sinon.stub(config, 'getGoConfig').returns(goConfig);

			const cfg2 = {
				name: 'Launch',
				type: 'go',
				request: 'launch',
				mode: 'auto',
				program: '${fileDirname}'
			};

			const filledResult = await debugConfigProvider.resolveDebugConfiguration(undefined, cfg2);

			assert(filledResult);
			assert(emptyResult);
			assert.strictEqual(filledResult.name, emptyResult.name);
			assert.strictEqual(filledResult.type, emptyResult.type);
			assert.strictEqual(filledResult.mode, emptyResult.mode);
			assert.strictEqual(filledResult.request, emptyResult.request);
			assert.strictEqual(filledResult.program, emptyResult.program);
			assert.strictEqual(filledResult.dlvToolPath, emptyResult.dlvToolPath);
			assert.strictEqual(filledResult.apiVersion, emptyResult.apiVersion);
			assert.strictEqual(filledResult.showGlobalVariables, emptyResult.showGlobalVariables);
			assert.strictEqual(filledResult.debugAdapter, emptyResult.debugAdapter);
			assert.strictEqual(filledResult.substitutePath, emptyResult.substitutePath);
		});

		test('delve config in settings.json is added to debug config', async () => {
			// This tests that the testFlags and GOOS and GOARCH set
			// in settings.json do not affect the resolved debug configuration.
			// When this expected behavior changes, this test can be updated.

			// Run resolveDebugConfiguration with the default workspace settings.
			const goConfig = new MockCfg({
				delveConfig: {
					dlvLoadConfig: {
						followPointers: false,
						maxVariableRecurse: 3,
						maxStringLen: 32,
						maxArrayValues: 32,
						maxStructFields: 5
					},
					apiVersion: 1,
					showGlobalVariables: true,
					showRegisters: true,
					hideSystemGoroutines: true,
					debugAdapter: 'dlv-dap',
					substitutePath: [{ from: 'hello', to: 'goodbye' }],
					showLog: true,
					logOutput: 'dap,debugger',
					dlvFlags: ['--check-go-version=false']
				}
			});
			sinon.stub(config, 'getGoConfig').returns(goConfig);

			const cfg = {
				name: 'Launch',
				type: 'go',
				request: 'launch',
				mode: 'auto',
				program: '${fileDirname}'
			};

			const result = await debugConfigProvider.resolveDebugConfiguration(undefined, cfg);
			assert(result);
			assert.strictEqual(result.apiVersion, 1);
			assert.strictEqual(result.showGlobalVariables, true);
			assert.strictEqual(result.showRegisters, true);
			assert.strictEqual(result.hideSystemGoroutines, true);
			assert.strictEqual(result.debugAdapter, 'dlv-dap');
			assert.strictEqual(result.substitutePath.length, 1);
			assert.strictEqual(result.substitutePath[0].from, 'hello');
			assert.strictEqual(result.substitutePath[0].to, 'goodbye');
			assert.strictEqual(result.showLog, true);
			assert.strictEqual(result.logOutput, 'dap,debugger');
			assert.deepStrictEqual(result.dlvFlags, ['--check-go-version=false']);
			const dlvLoadConfig = result.dlvLoadConfig;
			assert.strictEqual(dlvLoadConfig, undefined); // dlvLoadConfig does not apply in dlv-dap mode.
		});

		test('delve config in settings.json is overriden by launch.json', async () => {
			// This tests that the testFlags and GOOS and GOARCH set
			// in settings.json do not affect the resolved debug configuration.
			// When this expected behavior changes, this test can be updated.

			// Run resolveDebugConfiguration with the default workspace settings.
			const goConfig = new MockCfg({
				delveConfig: {
					dlvLoadConfig: {
						followPointers: false,
						maxVariableRecurse: 3,
						maxStringLen: 32,
						maxArrayValues: 32,
						maxStructFields: 5
					},
					apiVersion: 1,
					showGlobalVariables: true,
					showRegisters: true,
					hideSystemGoroutines: true,
					debugAdapter: 'dlv-dap',
					substitutePath: [{ from: 'hello', to: 'goodbye' }]
				}
			});
			sinon.stub(config, 'getGoConfig').returns(goConfig);

			const cfg: vscode.DebugConfiguration = {
				name: 'Launch',
				type: 'go',
				request: 'launch',
				mode: 'auto',
				program: '${fileDirname}',
				showGlobalVariables: false,
				showRegisters: false,
				hideSystemGoroutines: false,
				apiVersion: 2,
				dlvLoadConfig: {
					followPointers: true,
					maxVariableRecurse: 6,
					maxStringLen: 128,
					maxArrayValues: 128,
					maxStructFields: -1
				},
				debugAdapter: 'legacy',
				substitutePath: [],
				logOutput: 'rpc'
			};

			const result = await debugConfigProvider.resolveDebugConfiguration(undefined, cfg);
			assert(result);
			assert.strictEqual(result.apiVersion, 2);
			assert.strictEqual(result.showGlobalVariables, false);
			assert.strictEqual(result.showRegisters, false);
			assert.strictEqual(result.hideSystemGoroutines, false);
			assert.strictEqual(result.debugAdapter, 'legacy');
			assert.strictEqual(result.substitutePath.length, 0);
			assert.strictEqual(result.showLog, false);
			assert.strictEqual(result.logOutput, 'rpc');
			const dlvLoadConfig = result.dlvLoadConfig;
			assert.strictEqual(dlvLoadConfig.followPointers, true);
			assert.strictEqual(dlvLoadConfig.maxVariableRecurse, 6);
			assert.strictEqual(dlvLoadConfig.maxStringLen, 128);
			assert.strictEqual(dlvLoadConfig.maxArrayValues, 128);
			assert.strictEqual(dlvLoadConfig.maxStructFields, -1);
		});
	});
});

suite('Debug Configuration Modify User Config', () => {
	const debugConfigProvider = new GoDebugConfigurationProvider();

	suite('remove gcflags', () => {
		test('remove gcflags from string args', () => {
			const tt = [
				{
					input: '-gcflags=all=-l',
					want: { args: '', removed: true }
				},
				{
					input: '-gcflags all=-l',
					want: { args: '', removed: true }
				},
				// Preserve other flags
				{
					input: '-race -gcflags=all=-l -mod=mod',
					want: { args: '-race -mod=mod', removed: true }
				},
				{
					input: '-race -gcflags all=-l -mod=mod',
					want: { args: '-race -mod=mod', removed: true }
				},
				// Test with quoted value
				{
					input: "-mod=mod -gcflags=test/...='hello goodbye' -race",
					want: { args: '-mod=mod -race', removed: true }
				},
				{
					input: '-mod=mod -gcflags test/...="hello goodbye" -race',
					want: { args: '-mod=mod -race', removed: true }
				},
				{
					input: "-mod=mod -gcflags='test/...=hello goodbye' -race",
					want: { args: '-mod=mod -race', removed: true }
				},
				{
					input: '-mod=mod -gcflags "test/...=hello goodbye" -race',
					want: { args: '-mod=mod -race', removed: true }
				},
				// Multiple -gcflags present
				{
					input: '-mod=mod -gcflags "test/...=hello goodbye" -race -gcflags=all="hello goodbye"',
					want: { args: '-mod=mod -race', removed: true }
				},
				// No gcflags are present
				{
					input: '',
					want: { args: '', removed: false }
				},
				{
					input: '-race -mod=gcflags',
					want: { args: '-race -mod=gcflags', removed: false }
				}
			];

			tt.forEach((tc) => {
				const got = debugConfigProvider.removeGcflags(tc.input);

				assert.strictEqual(got.args, tc.want.args, `args for ${tc.input} do not match expected`);
				assert.strictEqual(got.removed, tc.want.removed, `removed for ${tc.input} does not match expected`);
			});
		});
		test('remove user set -gcflags in buildFlags', async () => {
			const config = {
				name: 'Launch',
				type: 'go',
				request: 'launch',
				mode: 'auto',
				program: '${fileDirname}',
				env: {},
				buildFlags: '-race -gcflags=-l -mod=mod'
			};

			await debugConfigProvider.resolveDebugConfiguration(undefined, config);
			assert.strictEqual(config.buildFlags, '-race -mod=mod');
		});
		test('remove user set -gcflags in GOFLAGS', async () => {
			const config = {
				name: 'Launch',
				type: 'go',
				request: 'launch',
				mode: 'auto',
				program: '${fileDirname}',
				env: { GOFLAGS: '-race -gcflags=-l -mod=mod' }
			};

			await debugConfigProvider.resolveDebugConfiguration(undefined, config);

			assert.strictEqual(config.env.GOFLAGS, '-race -mod=mod');
		});
	});

	suite('convert args list to string for older delve', () => {
		teardown(() => {
			sinon.restore();
		});

		async function testShouldUpdateTool(
			input: string | string[],
			expected: string | string[],
			moduleVersion?: string
		) {
			sinon.stub(goInstallTools, 'inspectGoToolVersion').returns(Promise.resolve({ moduleVersion }));
			const got = await maybeJoinFlags('/path/to/dlv', input);
			assert.deepStrictEqual(expected, got);
		}

		test('convert args list to string for older delve', async () => {
			await testShouldUpdateTool(['-c', 'my.conf', '-p', '8080'], '-c my.conf -p 8080', '1.5.0');
		});

		test('convert args list to string for devel delve', async () => {
			await testShouldUpdateTool(['-c', 'my.conf', '-p', '8080'], '-c my.conf -p 8080');
		});

		test('keep args list for newer delve', async () => {
			await testShouldUpdateTool(['-c', 'my.conf', '-p', '8080'], ['-c', 'my.conf', '-p', '8080'], '1.22.2');
		});
	});
});

suite('Debug Configuration Resolve Paths', () => {
	const debugConfigProvider = new GoDebugConfigurationProvider();
	test('resolve ~ in cwd', async () => {
		const config = {
			name: 'Launch',
			type: 'go',
			request: 'launch',
			mode: 'auto',
			program: '${fileDirname}',
			cwd: '~/main.go'
		};

		await debugConfigProvider.resolveDebugConfiguration(undefined, config);
		assert.notStrictEqual(config.cwd, '~/main.go');
	});

	test('do not resolve workspaceFolder or fileDirname', async () => {
		const config = {
			name: 'Launch',
			type: 'go',
			request: 'launch',
			mode: 'auto',
			program: '${fileDirname}',
			cwd: '${workspaceFolder}'
		};

		await debugConfigProvider.resolveDebugConfiguration(undefined, config);

		assert.strictEqual(config.cwd, '${workspaceFolder}');
		assert.strictEqual(config.program, '${fileDirname}');
	});
});

function writeEmptyFile(filename: string) {
	const dir = path.dirname(filename);
	if (!fs.existsSync(dir)) {
		createDirRecursively(dir);
	}
	try {
		fs.writeFileSync(filename, '');
	} catch (e) {
		console.log(`failed to write a file: ${e}`);
	}
}

function createDirRecursively(dir: string) {
	try {
		fs.mkdirSync(dir, { recursive: true });
	} catch (e) {
		console.log(`failed to create directory: ${e}`);
	}
}

suite('Debug Configuration With Invalid Program', () => {
	const debugConfigProvider = new GoDebugConfigurationProvider();

	let workspaceDir = '';
	setup(() => {
		workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'godebugrelpath_test'));
	});

	teardown(() => {
		rmdirRecursive(workspaceDir);
	});

	function debugConfig(adapter: string) {
		return {
			name: 'Launch',
			type: 'go',
			request: 'launch',
			mode: 'auto',
			debugAdapter: adapter,
			program: path.join('foo', 'bar.go'),
			cwd: '.',
			output: 'debug'
		};
	}

	test('empty, undefined program is an error', () => {
		const config = debugConfig('dlv-dap');
		config.program = '';

		const workspaceFolder = {
			uri: vscode.Uri.file(workspaceDir),
			name: 'test',
			index: 0
		};
		assert.throws(() => {
			debugConfigProvider.resolveDebugConfigurationWithSubstitutedVariables(workspaceFolder, config);
		}, /The program attribute is missing/);
	});

	test('non-existing file/directory is an error', () => {
		const config = debugConfig('dlv-dap');
		config.program = '/notexists';

		const workspaceFolder = {
			uri: vscode.Uri.file(workspaceDir),
			name: 'test',
			index: 0
		};
		assert.throws(() => {
			debugConfigProvider.resolveDebugConfigurationWithSubstitutedVariables(workspaceFolder, config);
		}, /The program attribute.* must be a valid directory or .go file/);
	});

	test('files other than .go file with debug/test/auto mode is an error', () => {
		writeEmptyFile(path.join(workspaceDir, 'foo', 'bar.test'));
		const config = debugConfig('dlv-dap');
		config.program = path.join(workspaceDir, 'foo', 'bar.test');
		const workspaceFolder = {
			uri: vscode.Uri.file(workspaceDir),
			name: 'test',
			index: 0
		};
		assert.throws(() => {
			debugConfigProvider.resolveDebugConfigurationWithSubstitutedVariables(workspaceFolder, config);
		}, /The program attribute.* must be a valid directory or .go file/);
	});
});

suite('Debug Configuration Converts Relative Paths', () => {
	if (affectedByIssue832()) {
		return;
	}
	const debugConfigProvider = new GoDebugConfigurationProvider();

	let workspaceDir = '';
	setup(() => {
		workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'godebugrelpath_test'));
	});

	teardown(() => {
		rmdirRecursive(workspaceDir);
	});

	function debugConfig(adapter: string) {
		return {
			name: 'Launch',
			type: 'go',
			request: 'launch',
			mode: 'auto',
			debugAdapter: adapter,
			program: path.join('foo', 'bar.go'),
			cwd: '.',
			output: 'debug'
		};
	}

	test('resolve relative paths with workspace root in dlv-dap mode, exec mode does not set __buildDir', () => {
		writeEmptyFile(path.join(workspaceDir, 'foo', 'bar.exe'));

		const config = debugConfig('dlv-dap');
		config.mode = 'exec';
		config.program = path.join('foo', 'bar.exe');

		const workspaceFolder = {
			uri: vscode.Uri.file(workspaceDir),
			name: 'test',
			index: 0
		};
		const { program, cwd, __buildDir } = debugConfigProvider.resolveDebugConfigurationWithSubstitutedVariables(
			workspaceFolder,
			config
		)!;
		assert.deepStrictEqual(
			{ program, cwd, __buildDir },
			{
				program: path.join(workspaceDir, 'foo', 'bar.exe'),
				cwd: workspaceDir,
				__buildDir: undefined
			}
		);
	});

	test('allow package path in dlv-dap mode', () => {
		const config = debugConfig('dlv-dap');
		config.program = 'example.com/foo/bar';

		const workspaceFolder = {
			uri: vscode.Uri.file(workspaceDir),
			name: 'test',
			index: 0
		};
		const { program, cwd, __buildDir } = debugConfigProvider.resolveDebugConfigurationWithSubstitutedVariables(
			workspaceFolder,
			config
		)!;
		assert.deepStrictEqual(
			{ program, cwd, __buildDir },
			{
				program: 'example.com/foo/bar',
				cwd: workspaceDir,
				__buildDir: undefined
			}
		);
	});

	test('program and __buildDir are updated while resolving debug configuration in dlv-dap mode', () => {
		createDirRecursively(path.join(workspaceDir, 'foo', 'bar', 'pkg'));

		const config = debugConfig('dlv-dap');
		config.program = path.join('foo', 'bar', 'pkg');
		const workspaceFolder = {
			uri: vscode.Uri.file(workspaceDir),
			name: 'test',
			index: 0
		};
		const {
			program,
			cwd,
			output,
			__buildDir
		} = debugConfigProvider.resolveDebugConfigurationWithSubstitutedVariables(workspaceFolder, config)!;
		assert.deepStrictEqual(
			{ program, cwd, output, __buildDir },
			{
				program: '.',
				cwd: workspaceDir,
				output: path.join(workspaceDir, 'debug'),
				__buildDir: path.join(workspaceDir, 'foo', 'bar', 'pkg')
			}
		);
	});

	test('program and __buildDir are not updated when working with externally launched adapters', () => {
		createDirRecursively(path.join(workspaceDir, 'foo', 'bar', 'pkg'));

		const config: vscode.DebugConfiguration = debugConfig('dlv-dap');
		config.program = path.join('foo', 'bar', 'pkg');
		config.port = 12345;
		const workspaceFolder = {
			uri: vscode.Uri.file(workspaceDir),
			name: 'test',
			index: 0
		};
		const { program, cwd, __buildDir } = debugConfigProvider.resolveDebugConfigurationWithSubstitutedVariables(
			workspaceFolder,
			config
		)!;
		assert.deepStrictEqual(
			{ program, cwd, __buildDir },
			{
				program: path.join(workspaceDir, 'foo', 'bar', 'pkg'),
				cwd: workspaceDir,
				__buildDir: undefined
			}
		);
	});

	test('program and __buildDir are not updated when working with externally launched adapters (debugServer)', () => {
		createDirRecursively(path.join(workspaceDir, 'foo', 'bar', 'pkg'));

		const config: vscode.DebugConfiguration = debugConfig('dlv-dap');
		config.program = path.join('foo', 'bar', 'pkg');
		config.debugServer = 4777;
		const workspaceFolder = {
			uri: vscode.Uri.file(workspaceDir),
			name: 'test',
			index: 0
		};
		const { program, cwd, __buildDir } = debugConfigProvider.resolveDebugConfigurationWithSubstitutedVariables(
			workspaceFolder,
			config
		)!;
		assert.deepStrictEqual(
			{ program, cwd, __buildDir },
			{
				program: path.join(workspaceDir, 'foo', 'bar', 'pkg'),
				cwd: workspaceDir,
				__buildDir: undefined
			}
		);
	});

	test('directory as program still works when directory name contains .', () => {
		createDirRecursively(path.join(workspaceDir, 'foo.test'));

		const config: vscode.DebugConfiguration = debugConfig('dlv-dap');
		config.program = 'foo.test';
		const workspaceFolder = {
			uri: vscode.Uri.file(workspaceDir),
			name: 'test',
			index: 0
		};
		const { program, cwd, __buildDir } = debugConfigProvider.resolveDebugConfigurationWithSubstitutedVariables(
			workspaceFolder,
			config
		)!;
		assert.deepStrictEqual(
			{ program, cwd, __buildDir },
			{
				program: '.',
				cwd: workspaceDir,
				__buildDir: path.join(workspaceDir, 'foo.test')
			}
		);
	});

	test('empty, undefined paths are not affected', () => {
		writeEmptyFile(path.join(workspaceDir, 'bar_test.go'));

		const config: vscode.DebugConfiguration = debugConfig('dlv-dap');
		config.program = 'bar_test.go';
		config.cwd = '';
		delete config.output;

		const workspaceFolder = {
			uri: vscode.Uri.file(workspaceDir),
			name: 'test',
			index: 0
		};
		const {
			program,
			cwd,
			output,
			__buildDir
		} = debugConfigProvider.resolveDebugConfigurationWithSubstitutedVariables(workspaceFolder, config)!;
		assert.deepStrictEqual(
			{ program, cwd, output, __buildDir },
			{
				program: '.' + path.sep + 'bar_test.go',
				cwd: '',
				output: undefined,
				__buildDir: workspaceDir
			}
		);
	});

	test('relative paths with no workspace root are not expanded', () => {
		const config = debugConfig('dlv-dap');
		config.program = '.'; // the program must be a valid directory or .go file.
		const {
			program,
			cwd,
			output,
			__buildDir
		} = debugConfigProvider.resolveDebugConfigurationWithSubstitutedVariables(undefined, config)!;
		assert.deepStrictEqual(
			{ program, cwd, output, __buildDir },
			{
				program: '.',
				cwd: '.',
				output: 'debug',
				__buildDir: '.'
			}
		);
	});

	test('do not affect relative paths (workspace) in legacy mode', () => {
		writeEmptyFile(path.join(workspaceDir, 'foo', 'bar.go'));

		const config = debugConfig('legacy');
		const workspaceFolder = {
			uri: vscode.Uri.file(workspaceDir),
			name: 'test',
			index: 0
		};
		const { program, cwd, output } = debugConfigProvider.resolveDebugConfigurationWithSubstitutedVariables(
			workspaceFolder,
			config
		)!;
		assert.deepStrictEqual(
			{ program, cwd, output },
			{
				program: path.join('foo', 'bar.go'),
				cwd: '.',
				output: 'debug'
			}
		);
	});

	test('do not affect relative paths (no workspace) in legacy mode', () => {
		const config = debugConfig('legacy');
		config.program = '.'; // program must be a valid directory or .go file.
		const { program, cwd, output } = debugConfigProvider.resolveDebugConfigurationWithSubstitutedVariables(
			undefined,
			config
		)!;
		assert.deepStrictEqual(
			{ program, cwd, output },
			{
				program: '.',
				cwd: '.',
				output: 'debug'
			}
		);
	});
});

suite('Debug Configuration Auto Mode', () => {
	const debugConfigProvider = new GoDebugConfigurationProvider();
	test('resolve auto to debug with non-test file', async () => {
		const config = {
			name: 'Launch',
			type: 'go',
			request: 'launch',
			mode: 'auto',
			program: '/path/to/main.go'
		};

		await debugConfigProvider.resolveDebugConfiguration(undefined, config);
		assert.strictEqual(config.mode, 'debug');
		assert.strictEqual(config.program, '/path/to/main.go');
	});

	test('resolve auto to debug with test file', async () => {
		const config = {
			name: 'Launch',
			type: 'go',
			request: 'launch',
			mode: 'auto',
			program: '/path/to/main_test.go'
		};

		await debugConfigProvider.resolveDebugConfiguration(undefined, config);
		assert.strictEqual(config.mode, 'test');
		assert.strictEqual(config.program, '/path/to');
	});
});

suite('Debug Configuration Default DebugAdapter', () => {
	const debugConfigProvider = new GoDebugConfigurationProvider();
	let sandbox: sinon.SinonSandbox;

	setup(() => {
		sandbox = sinon.createSandbox();
	});

	teardown(() => {
		sandbox.restore();
	});

	test("default debugAdapter should be 'dlv-dap'", async () => {
		const config = {
			name: 'Launch',
			type: 'go',
			request: 'launch',
			mode: 'auto',
			program: '/path/to/main.go'
		};

		await debugConfigProvider.resolveDebugConfiguration(undefined, config);
		const resolvedConfig = config as any;
		assert.strictEqual(resolvedConfig['debugAdapter'], 'dlv-dap');
	});

	test('remote mode: sets adapter based on the extension preview status when dlv path guessing fails', async () => {
		const config = {
			name: 'Attach',
			type: 'go',
			request: 'attach',
			mode: 'remote',
			program: '/path/to/main_test.go',
			cwd: '/path'
		};

		const guessStub = sandbox.stub(debugConfigProvider, 'guessSubstitutePath').resolves(null);

		await debugConfigProvider.resolveDebugConfiguration(undefined, config);
		const resolvedConfig = config as any;

		const want = extensionInfo.isPreview ? 'dlv-dap' : 'legacy';
		assert.strictEqual(resolvedConfig['debugAdapter'], want);
		assert.ok(guessStub.calledOnce, 'guessSubstitutePath should have been called');
	});

	test('remote mode: sets debugAdapter to dlv-dap when dlv path guessing succeeds', async () => {
		const config = {
			name: 'Attach',
			type: 'go',
			request: 'attach',
			mode: 'remote',
			program: '/path/to/main_test.go',
			cwd: '/path'
		};

		const guessStub = sandbox.stub(debugConfigProvider, 'guessSubstitutePath').resolves({});

		await debugConfigProvider.resolveDebugConfiguration(undefined, config);
		const resolvedConfig = config as any;

		assert.strictEqual(resolvedConfig['debugAdapter'], 'dlv-dap');
		assert.ok(guessStub.calledOnce, 'guessSubstitutePath should have been called');
	});

	test('debugAdapter=dlv-dap is allowed with remote mode', async () => {
		const config = {
			name: 'Attach',
			type: 'go',
			request: 'attach',
			mode: 'remote',
			debugAdapter: 'dlv-dap',
			program: '/path/to/main_test.go',
			cwd: '/path'
		};

		const want = 'dlv-dap'; // If requested, dlv-dap is preserved.
		await debugConfigProvider.resolveDebugConfiguration(undefined, config);
		const resolvedConfig = config as any;
		assert.strictEqual(resolvedConfig['debugAdapter'], want);
	});
});

suite('Debug Configuration Infers Default Mode Property', () => {
	const debugConfigProvider = new GoDebugConfigurationProvider();
	test("default mode for launch requests and test Go programs should be 'test'", () => {
		const config = {
			name: 'Launch',
			type: 'go',
			request: 'launch',
			program: '/path/to/main_test.go'
		};

		debugConfigProvider.resolveDebugConfiguration(undefined, config);
		const resolvedConfig = config as any;
		assert.strictEqual(resolvedConfig['mode'], 'test');
	});

	test("default mode for launch requests and non-test Go programs should be 'debug'", () => {
		const config = {
			name: 'Launch',
			type: 'go',
			request: 'launch',
			program: '/path/to/main.go'
		};

		debugConfigProvider.resolveDebugConfiguration(undefined, config);
		const resolvedConfig = config as any;
		assert.strictEqual(resolvedConfig['mode'], 'debug');
	});

	test("default mode for attach requests should be 'local'", () => {
		const config = {
			name: 'Attach',
			type: 'go',
			request: 'attach',
			program: '/path/to/main.go',
			processId: 12345 // set a bogus process ID to provent process quickPick popup.
		};

		debugConfigProvider.resolveDebugConfiguration(undefined, config);
		const resolvedConfig = config as any;
		assert.strictEqual(resolvedConfig['mode'], 'local');
	});
});
