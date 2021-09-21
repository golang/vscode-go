/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-prototype-builtins */
import assert = require('assert');
import fs = require('fs');
import os = require('os');
import path = require('path');
import sinon = require('sinon');
import vscode = require('vscode');
import { getGoConfig } from '../../src/config';
import { GoDebugConfigurationProvider } from '../../src/goDebugConfiguration';
import { updateGoVarsFromConfig } from '../../src/goInstallTools';
import { rmdirRecursive } from '../../src/util';
import goEnv = require('../../src/goEnv');
import { isInPreviewMode } from '../../src/goLanguageServer';
import { MockCfg } from '../mocks/MockCfg';

suite('Debug Environment Variable Merge Test', () => {
	const debugConfigProvider = new GoDebugConfigurationProvider();

	suiteSetup(async () => {
		await updateGoVarsFromConfig();

		// Set up the test fixtures.
		const fixtureSourcePath = path.join(__dirname, '..', '..', '..', 'test', 'testdata');
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
			debugAdapter: input.debugAdapter
		});

		const actual = config.env;
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

	test('toolsEnvVars is not propagated', () => {
		const toolsEnv = {
			GOPATH: '/gopath',
			GOOS: 'valueFromToolsEnv'
		};

		runTest(
			{
				toolsEnv
			},
			{}
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
		fs.writeFileSync(envFile, ['SOMEVAR1=valueFromEnvFile1', 'SOMEVAR2=valueFromEnvFile2'].join('\n'));

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

	test('launchArgs.env is respected, toolsEnvVar is ignored (dlv-dap)', () => {
		const toolsEnv = {
			GOPATH: '/gopath',
			SOMEVAR1: 'valueFromToolsEnvVar1',
			SOMEVAR2: 'valueFromToolsEnvVar2'
		};

		const env = { SOMEVAR1: 'valueFromEnv' };
		runTest(
			{ env, toolsEnv },
			{
				SOMEVAR1: 'valueFromEnv'
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

	test('launchArgs.envFile is repected, and toolsEnvVar is ignored (dlv-dap)', () => {
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
					debugAdapter: 'dlv-dap',
					substitutePath: [{ from: 'hello', to: 'goodbye' }]
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
			assert.strictEqual(result.apiVersion, 1);
			assert.strictEqual(result.showGlobalVariables, true);
			assert.strictEqual(result.debugAdapter, 'dlv-dap');
			assert.strictEqual(result.substitutePath.length, 1);
			assert.strictEqual(result.substitutePath[0].from, 'hello');
			assert.strictEqual(result.substitutePath[0].to, 'goodbye');
			const dlvLoadConfig = result.dlvLoadConfig;
			assert.strictEqual(dlvLoadConfig.followPointers, false);
			assert.strictEqual(dlvLoadConfig.maxVariableRecurse, 3);
			assert.strictEqual(dlvLoadConfig.maxStringLen, 32);
			assert.strictEqual(dlvLoadConfig.maxArrayValues, 32);
			assert.strictEqual(dlvLoadConfig.maxStructFields, 5);
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
				apiVersion: 2,
				showGlobalVariables: false,
				dlvLoadConfig: {
					followPointers: true,
					maxVariableRecurse: 6,
					maxStringLen: 128,
					maxArrayValues: 128,
					maxStructFields: -1
				},
				debugAdapter: 'legacy',
				substitutePath: []
			};

			const result = await debugConfigProvider.resolveDebugConfiguration(undefined, cfg);
			assert.strictEqual(result.apiVersion, 2);
			assert.strictEqual(result.showGlobalVariables, false);
			assert.strictEqual(result.debugAdapter, 'legacy');
			assert.strictEqual(result.substitutePath.length, 0);
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
		test('remove user set -gcflags in buildFlags', () => {
			const config = {
				name: 'Launch',
				type: 'go',
				request: 'launch',
				mode: 'auto',
				program: '${fileDirname}',
				env: {},
				buildFlags: '-race -gcflags=-l -mod=mod'
			};

			debugConfigProvider.resolveDebugConfiguration(undefined, config);
			assert.strictEqual(config.buildFlags, '-race -mod=mod');
		});
		test('remove user set -gcflags in GOFLAGS', () => {
			const config = {
				name: 'Launch',
				type: 'go',
				request: 'launch',
				mode: 'auto',
				program: '${fileDirname}',
				env: { GOFLAGS: '-race -gcflags=-l -mod=mod' }
			};

			debugConfigProvider.resolveDebugConfiguration(undefined, config);

			assert.strictEqual(config.env.GOFLAGS, '-race -mod=mod');
		});
	});
});

suite('Debug Configuration Resolve Paths', () => {
	const debugConfigProvider = new GoDebugConfigurationProvider();
	test('resolve ~ in cwd', () => {
		const config = {
			name: 'Launch',
			type: 'go',
			request: 'launch',
			mode: 'auto',
			program: '${fileDirname}',
			cwd: '~/main.go'
		};

		debugConfigProvider.resolveDebugConfiguration(undefined, config);
		assert.notStrictEqual(config.cwd, '~/main.go');
	});

	test('do not resolve workspaceFolder or fileDirname', () => {
		const config = {
			name: 'Launch',
			type: 'go',
			request: 'launch',
			mode: 'auto',
			program: '${fileDirname}',
			cwd: '${workspaceFolder}'
		};

		debugConfigProvider.resolveDebugConfiguration(undefined, config);

		assert.strictEqual(config.cwd, '${workspaceFolder}');
		assert.strictEqual(config.program, '${fileDirname}');
	});
});

suite('Debug Configuration Converts Relative Paths', () => {
	const debugConfigProvider = new GoDebugConfigurationProvider();

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
		const config = debugConfig('dlv-dap');
		config.mode = 'exec';
		config.program = path.join('foo', 'bar.exe');
		const workspaceFolder = {
			uri: vscode.Uri.file(os.tmpdir()),
			name: 'test',
			index: 0
		};
		const { program, cwd, __buildDir } = debugConfigProvider.resolveDebugConfigurationWithSubstitutedVariables(
			workspaceFolder,
			config
		);
		assert.deepStrictEqual(
			{ program, cwd, __buildDir },
			{
				program: path.join(os.tmpdir(), 'foo', 'bar.exe'),
				cwd: os.tmpdir(),
				__buildDir: undefined
			}
		);
	});

	test('program and __buildDir are updated while resolving debug configuration in dlv-dap mode', () => {
		const config = debugConfig('dlv-dap');
		config.program = path.join('foo', 'bar', 'pkg');
		const workspaceFolder = {
			uri: vscode.Uri.file(os.tmpdir()),
			name: 'test',
			index: 0
		};
		const {
			program,
			cwd,
			output,
			__buildDir
		} = debugConfigProvider.resolveDebugConfigurationWithSubstitutedVariables(workspaceFolder, config);
		assert.deepStrictEqual(
			{ program, cwd, output, __buildDir },
			{
				program: '.',
				cwd: os.tmpdir(),
				output: path.join(os.tmpdir(), 'debug'),
				__buildDir: path.join(os.tmpdir(), 'foo', 'bar', 'pkg')
			}
		);
	});

	test('program and __buildDir are not updated when working with externally launched adapters', () => {
		const config: vscode.DebugConfiguration = debugConfig('dlv-dap');
		config.program = path.join('foo', 'bar', 'pkg');
		config.port = 12345;
		const workspaceFolder = {
			uri: vscode.Uri.file(os.tmpdir()),
			name: 'test',
			index: 0
		};
		const { program, cwd, __buildDir } = debugConfigProvider.resolveDebugConfigurationWithSubstitutedVariables(
			workspaceFolder,
			config
		);
		assert.deepStrictEqual(
			{ program, cwd, __buildDir },
			{
				program: path.join(os.tmpdir(), 'foo', 'bar', 'pkg'),
				cwd: os.tmpdir(),
				__buildDir: undefined
			}
		);
	});

	test('program and __buildDir are not updated when working with externally launched adapters (debugServer)', () => {
		const config: vscode.DebugConfiguration = debugConfig('dlv-dap');
		config.program = path.join('foo', 'bar', 'pkg');
		config.debugServer = 4777;
		const workspaceFolder = {
			uri: vscode.Uri.file(os.tmpdir()),
			name: 'test',
			index: 0
		};
		const { program, cwd, __buildDir } = debugConfigProvider.resolveDebugConfigurationWithSubstitutedVariables(
			workspaceFolder,
			config
		);
		assert.deepStrictEqual(
			{ program, cwd, __buildDir },
			{
				program: path.join(os.tmpdir(), 'foo', 'bar', 'pkg'),
				cwd: os.tmpdir(),
				__buildDir: undefined
			}
		);
	});

	test('empty, undefined paths are not affected', () => {
		const config = debugConfig('dlv-dap');
		config.program = undefined;
		config.cwd = '';
		delete config.output;

		const workspaceFolder = {
			uri: vscode.Uri.file(os.tmpdir()),
			name: 'test',
			index: 0
		};
		const { program, cwd, output } = debugConfigProvider.resolveDebugConfigurationWithSubstitutedVariables(
			workspaceFolder,
			config
		);
		assert.deepStrictEqual(
			{ program, cwd, output },
			{
				program: undefined,
				cwd: '',
				output: undefined
			}
		);
	});

	test('relative paths with no workspace root are not expanded', () => {
		const config = debugConfig('dlv-dap');
		const {
			program,
			cwd,
			output,
			__buildDir
		} = debugConfigProvider.resolveDebugConfigurationWithSubstitutedVariables(undefined, config);
		assert.deepStrictEqual(
			{ program, cwd, output, __buildDir },
			{
				program: '.' + path.sep + 'bar.go',
				cwd: '.',
				output: 'debug',
				__buildDir: 'foo'
			}
		);
	});

	test('do not affect relative paths (workspace) in legacy mode', () => {
		const config = debugConfig('legacy');
		const workspaceFolder = {
			uri: vscode.Uri.file(os.tmpdir()),
			name: 'test',
			index: 0
		};
		const { program, cwd, output } = debugConfigProvider.resolveDebugConfigurationWithSubstitutedVariables(
			workspaceFolder,
			config
		);
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
		const { program, cwd, output } = debugConfigProvider.resolveDebugConfigurationWithSubstitutedVariables(
			undefined,
			config
		);
		assert.deepStrictEqual(
			{ program, cwd, output },
			{
				program: path.join('foo', 'bar.go'),
				cwd: '.',
				output: 'debug'
			}
		);
	});
});

suite('Debug Configuration Auto Mode', () => {
	const debugConfigProvider = new GoDebugConfigurationProvider();
	test('resolve auto to debug with non-test file', () => {
		const config = {
			name: 'Launch',
			type: 'go',
			request: 'launch',
			mode: 'auto',
			program: '/path/to/main.go'
		};

		debugConfigProvider.resolveDebugConfiguration(undefined, config);
		assert.strictEqual(config.mode, 'debug');
		assert.strictEqual(config.program, '/path/to/main.go');
	});

	test('resolve auto to debug with test file', () => {
		const config = {
			name: 'Launch',
			type: 'go',
			request: 'launch',
			mode: 'auto',
			program: '/path/to/main_test.go'
		};

		debugConfigProvider.resolveDebugConfiguration(undefined, config);
		assert.strictEqual(config.mode, 'test');
		assert.strictEqual(config.program, '/path/to');
	});
});

suite('Debug Configuration Default DebugAdapter', () => {
	const debugConfigProvider = new GoDebugConfigurationProvider();
	test("default debugAdapter should be 'dlv-dap'", () => {
		const config = {
			name: 'Launch',
			type: 'go',
			request: 'launch',
			mode: 'auto',
			program: '/path/to/main.go'
		};

		debugConfigProvider.resolveDebugConfiguration(undefined, config);
		const resolvedConfig = config as any;
		assert.strictEqual(resolvedConfig['debugAdapter'], 'dlv-dap');
	});

	test("default debugAdapter for remote mode should be always 'legacy'", () => {
		const config = {
			name: 'Attach',
			type: 'go',
			request: 'attach',
			mode: 'remote',
			program: '/path/to/main_test.go',
			cwd: '/path'
		};

		const want = 'legacy'; // remote mode works only with legacy mode.
		debugConfigProvider.resolveDebugConfiguration(undefined, config);
		const resolvedConfig = config as any;
		assert.strictEqual(resolvedConfig['debugAdapter'], want);
	});

	test('debugAdapter=dlv-dap should be ignored for remote mode', () => {
		const config = {
			name: 'Attach',
			type: 'go',
			request: 'attach',
			mode: 'remote',
			debugAdapter: 'dlv-dap',
			program: '/path/to/main_test.go',
			cwd: '/path'
		};

		const want = 'legacy'; // remote mode works only with legacy mode.
		debugConfigProvider.resolveDebugConfiguration(undefined, config);
		const resolvedConfig = config as any;
		assert.strictEqual(resolvedConfig['debugAdapter'], want);
	});
});
