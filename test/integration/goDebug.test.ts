/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable node/no-unsupported-features/node-builtins */
/* eslint-disable no-async-promise-executor */
/* eslint-disable node/no-unpublished-import */
import assert from 'assert';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as readline from 'readline';
import * as http from 'http';
import { tmpdir } from 'os';
import * as net from 'net';
import * as path from 'path';
import * as sinon from 'sinon';
import * as proxy from '../../src/goDebugFactory';
import * as vscode from 'vscode';
import { DebugConfiguration, DebugProtocolMessage } from 'vscode';
import { DebugClient } from 'vscode-debugadapter-testsupport';
import { ILocation } from 'vscode-debugadapter-testsupport/lib/debugClient';
import { DebugProtocol } from 'vscode-debugprotocol';
import {
	Delve,
	escapeGoModPath,
	GoDebugSession,
	PackageBuildInfo,
	RemoteSourcesAndPackages
} from '../../src/debugAdapter/goDebug';
import * as extConfig from '../../src/config';
import { GoDebugConfigurationProvider, parseDebugProgramArgSync } from '../../src/goDebugConfiguration';
import { getBinPath, rmdirRecursive } from '../../src/util';
import { killProcessTree, killProcess } from '../../src/utils/processUtils';
import getPort = require('get-port');
import util = require('util');
import { TimestampedLogger } from '../../src/goLogging';

// For debugging test and streaming the trace instead of buffering, set this.
const PRINT_TO_CONSOLE = false;

suite('Path Manipulation Tests', () => {
	test('escapeGoModPath works', () => {
		assert.strictEqual(escapeGoModPath('BurnSushi/test.go'), '!burn!sushi/test.go');
	});
});

suite('GoDebugSession Tests', async () => {
	const workspaceFolder = '/usr/workspacefolder';
	const delve: Delve = {} as Delve;
	let goDebugSession: GoDebugSession;
	let remoteSourcesAndPackages: RemoteSourcesAndPackages;
	let fileSystem: typeof fs;

	let previousEnv: any;

	setup(() => {
		previousEnv = Object.assign({}, process.env);

		process.env.GOPATH = '/usr/gopath';
		process.env.GOROOT = '/usr/goroot';
		remoteSourcesAndPackages = new RemoteSourcesAndPackages();
		// eslint-disable-next-line prettier/prettier
		fileSystem = ({ existsSync: () => false } as unknown) as typeof fs;
		delve.program = workspaceFolder;
		delve.isApiV1 = false;
		goDebugSession = new GoDebugSession(true, false, fileSystem);
		goDebugSession['delve'] = delve;
		goDebugSession['remoteSourcesAndPackages'] = remoteSourcesAndPackages;
	});

	teardown(() => {
		process.env = previousEnv;
		sinon.restore();
	});

	test('inferRemotePathFromLocalPath works', () => {
		const sourceFileMapping = new Map<string, string[]>();
		sourceFileMapping.set('main.go', ['/app/hello-world/main.go', '/app/main.go']);
		sourceFileMapping.set('blah.go', ['/app/blah.go']);

		remoteSourcesAndPackages.remoteSourceFilesNameGrouping = sourceFileMapping;

		const inferredPath = goDebugSession['inferRemotePathFromLocalPath'](
			'C:\\Users\\Documents\\src\\hello-world\\main.go'
		);
		assert.strictEqual(inferredPath, '/app/hello-world/main.go');
	});

	test('inferRemotePathFromLocalPath does not crash due to non-existing files', () => {
		const sourceFileMapping = new Map<string, string[]>();
		sourceFileMapping.set('main.go', ['/app/hello-world/main.go', '/app/main.go']);

		remoteSourcesAndPackages.remoteSourceFilesNameGrouping = sourceFileMapping;

		// Non-existing file.
		const inferredPath = goDebugSession['inferRemotePathFromLocalPath'](
			'C:\\Users\\Documents\\src\\hello-world\\main-copy.go'
		);
		assert.strictEqual(inferredPath, undefined);
	});

	test('inferLocalPathFromRemoteGoPackage works for package in workspaceFolder', () => {
		const remotePath = '/src/hello-world/morestrings/morestrings.go';
		const helloPackage: PackageBuildInfo = {
			ImportPath: 'hello-world/morestrings',
			DirectoryPath: '/src/hello-world/morestrings',
			Files: ['/src/hello-world/morestrings/lessstrings.go', '/src/hello-world/morestrings/morestrings.go']
		};

		const testPackage: PackageBuildInfo = {
			ImportPath: 'FooBar/test',
			DirectoryPath: 'remote/pkg/mod/!foo!bar/test@v1.0.2',
			Files: ['remote/pkg/mod/!foo!bar/test@v1.0.2/test.go']
		};

		const localPath = path.join(workspaceFolder, 'hello-world/morestrings/morestrings.go');
		const existsSyncStub = sinon.stub(fileSystem, 'existsSync');
		existsSyncStub.withArgs(localPath).returns(true);

		remoteSourcesAndPackages.remotePackagesBuildInfo = [helloPackage, testPackage];

		goDebugSession['localPathSeparator'] = '/';
		const inferredLocalPath = goDebugSession['inferLocalPathFromRemoteGoPackage'](remotePath);
		assert.strictEqual(inferredLocalPath, localPath);
	});

	test('inferLocalPathFromRemoteGoPackage works for package in GOPATH/pkg/mod', () => {
		const remotePath = 'remote/pkg/mod/!foo!bar/test@v1.0.2/test.go';
		const helloPackage: PackageBuildInfo = {
			ImportPath: 'hello-world',
			DirectoryPath: '/src/hello-world',
			Files: ['src/hello-world/hello.go', 'src/hello-world/world.go']
		};

		const testPackage: PackageBuildInfo = {
			ImportPath: 'FooBar/test',
			DirectoryPath: 'remote/pkg/mod/!foo!bar/test@v1.0.2',
			Files: ['remote/pkg/mod/!foo!bar/test@v1.0.2/test.go']
		};

		const localPath = path.join(process.env.GOPATH ?? '', 'pkg/mod/!foo!bar/test@v1.0.2/test.go');
		const existsSyncStub = sinon.stub(fileSystem, 'existsSync');
		existsSyncStub.withArgs(localPath).returns(true);

		remoteSourcesAndPackages.remotePackagesBuildInfo = [helloPackage, testPackage];

		goDebugSession['localPathSeparator'] = '/';
		const inferredLocalPath = goDebugSession['inferLocalPathFromRemoteGoPackage'](remotePath);
		assert.strictEqual(inferredLocalPath, localPath);
	});

	test('inferLocalPathFromRemoteGoPackage works for package in GOPATH/pkg/mod with relative path', () => {
		const remotePath = '!foo!bar/test@v1.0.2/test.go';
		const helloPackage: PackageBuildInfo = {
			ImportPath: 'hello-world',
			DirectoryPath: '/src/hello-world',
			Files: ['src/hello-world/hello.go', 'src/hello-world/world.go']
		};

		const testPackage: PackageBuildInfo = {
			ImportPath: 'FooBar/test',
			DirectoryPath: '!foo!bar/test@v1.0.2',
			Files: ['!foo!bar/test@v1.0.2/test.go']
		};

		const localPath = path.join(process.env.GOPATH ?? '', 'pkg/mod/!foo!bar/test@v1.0.2/test.go');
		const existsSyncStub = sinon.stub(fileSystem, 'existsSync');
		existsSyncStub.withArgs(localPath).returns(true);

		remoteSourcesAndPackages.remotePackagesBuildInfo = [helloPackage, testPackage];

		goDebugSession['localPathSeparator'] = '/';
		const inferredLocalPath = goDebugSession['inferLocalPathFromRemoteGoPackage'](remotePath);
		assert.strictEqual(inferredLocalPath, localPath);
	});

	test('inferLocalPathFromRemoteGoPackage works for package in GOPATH/src', () => {
		const remotePath = 'remote/gopath/src/foobar/test@v1.0.2-abcde-34/test.go';
		const helloPackage: PackageBuildInfo = {
			ImportPath: 'hello-world',
			DirectoryPath: '/src/hello-world',
			Files: ['src/hello-world/hello.go', 'src/hello-world/world.go']
		};

		const testPackage: PackageBuildInfo = {
			ImportPath: 'foobar/test',
			DirectoryPath: 'remote/gopath/src/foobar/test@v1.0.2-abcde-34',
			Files: ['remote/gopath/src/foobar/test@v1.0.2-abcde-34/test.go']
		};

		const localPath = path.join(process.env.GOPATH ?? '', 'src', 'foobar/test@v1.0.2-abcde-34/test.go');
		const existsSyncStub = sinon.stub(fileSystem, 'existsSync');
		existsSyncStub.withArgs(localPath).returns(true);

		remoteSourcesAndPackages.remotePackagesBuildInfo = [helloPackage, testPackage];

		goDebugSession['localPathSeparator'] = '/';
		const inferredLocalPath = goDebugSession['inferLocalPathFromRemoteGoPackage'](remotePath);
		assert.strictEqual(inferredLocalPath, localPath);
	});

	test('inferLocalPathFromRemoteGoPackage works for package in GOPATH/src with relative path', () => {
		const remotePath = 'foobar/test@v1.0.2/test.go';
		const helloPackage: PackageBuildInfo = {
			ImportPath: 'hello-world',
			DirectoryPath: '/src/hello-world',
			Files: ['src/hello-world/hello.go', 'src/hello-world/world.go']
		};

		const testPackage: PackageBuildInfo = {
			ImportPath: 'foobar/test',
			DirectoryPath: 'foobar/test@v1.0.2',
			Files: ['foobar/test@v1.0.2/test.go']
		};

		const localPath = path.join(process.env.GOPATH ?? '', 'src', 'foobar/test@v1.0.2/test.go');
		const existsSyncStub = sinon.stub(fileSystem, 'existsSync');
		existsSyncStub.withArgs(localPath).returns(true);

		remoteSourcesAndPackages.remotePackagesBuildInfo = [helloPackage, testPackage];

		goDebugSession['localPathSeparator'] = '/';
		const inferredLocalPath = goDebugSession['inferLocalPathFromRemoteGoPackage'](remotePath);
		assert.strictEqual(inferredLocalPath, localPath);
	});

	test('inferLocalPathFromRemoteGoPackage works for package in GOROOT/src', () => {
		const remotePath = 'remote/goroot/src/foobar/test@v1.0.2/test.go';
		const helloPackage: PackageBuildInfo = {
			ImportPath: 'hello-world',
			DirectoryPath: '/src/hello-world',
			Files: ['src/hello-world/hello.go', 'src/hello-world/world.go']
		};

		const testPackage: PackageBuildInfo = {
			ImportPath: 'foobar/test',
			DirectoryPath: 'remote/goroot/src/foobar/test@v1.0.2',
			Files: ['remote/goroot/src/foobar/test@v1.0.2/test.go']
		};

		const localPath = path.join(process.env.GOROOT ?? '', 'src', 'foobar/test@v1.0.2/test.go');
		const existsSyncStub = sinon.stub(fileSystem, 'existsSync');
		existsSyncStub.withArgs(localPath).returns(true);

		remoteSourcesAndPackages.remotePackagesBuildInfo = [helloPackage, testPackage];

		goDebugSession['localPathSeparator'] = '/';
		const inferredLocalPath = goDebugSession['inferLocalPathFromRemoteGoPackage'](remotePath);
		assert.strictEqual(inferredLocalPath, localPath);
	});

	test('inferLocalPathFromRemoteGoPackage works for package in GOROOT/src with relative path', () => {
		const remotePath = 'foobar/test@v1.0.2/test.go';
		const helloPackage: PackageBuildInfo = {
			ImportPath: 'hello-world',
			DirectoryPath: '/src/hello-world',
			Files: ['src/hello-world/hello.go', 'src/hello-world/world.go']
		};

		const testPackage: PackageBuildInfo = {
			ImportPath: 'foobar/test',
			DirectoryPath: 'foobar/test@v1.0.2',
			Files: ['foobar/test@v1.0.2/test.go']
		};

		const localPath = path.join(process.env.GOROOT ?? '', 'src', 'foobar/test@v1.0.2/test.go');
		const existsSyncStub = sinon.stub(fileSystem, 'existsSync');
		existsSyncStub.withArgs(localPath).returns(true);

		remoteSourcesAndPackages.remotePackagesBuildInfo = [helloPackage, testPackage];

		goDebugSession['localPathSeparator'] = '/';
		const inferredLocalPath = goDebugSession['inferLocalPathFromRemoteGoPackage'](remotePath);
		assert.strictEqual(inferredLocalPath, localPath);
	});
});

suite('RemoteSourcesAndPackages Tests', () => {
	const helloPackage: PackageBuildInfo = {
		ImportPath: 'hello-world',
		DirectoryPath: '/src/hello-world',
		Files: ['src/hello-world/hello.go', 'src/hello-world/world.go']
	};
	const testPackage: PackageBuildInfo = {
		ImportPath: 'test',
		DirectoryPath: '/src/test',
		Files: ['src/test/test.go']
	};
	const sources = ['src/hello-world/hello.go', 'src/hello-world/world.go', 'src/test/test.go'];
	let remoteSourcesAndPackages: RemoteSourcesAndPackages;
	let delve: Delve;
	setup(() => {
		// eslint-disable-next-line prettier/prettier
		delve = ({ callPromise: () => ({}), isApiV1: false } as unknown) as Delve;
		remoteSourcesAndPackages = new RemoteSourcesAndPackages();
	});

	teardown(() => {
		sinon.restore();
	});

	test('initializeRemotePackagesAndSources retrieves remote packages and sources', async () => {
		const stub = sinon.stub(delve, 'callPromise');
		stub.withArgs('ListPackagesBuildInfo', [{ IncludeFiles: true }]).returns(
			Promise.resolve({ List: [helloPackage, testPackage] })
		);
		stub.withArgs('ListSources', [{}]).returns(Promise.resolve({ Sources: sources }));

		await remoteSourcesAndPackages.initializeRemotePackagesAndSources(delve);
		assert.deepEqual(remoteSourcesAndPackages.remoteSourceFiles, sources);
		assert.deepEqual(remoteSourcesAndPackages.remotePackagesBuildInfo, [helloPackage, testPackage]);
	});
});

// Test suite adapted from:
// https://github.com/microsoft/vscode-mock-debug/blob/master/src/tests/adapter.test.ts
const testAll = (ctx: Mocha.Context, isDlvDap: boolean, withConsole?: string) => {
	const debugConfigProvider = new GoDebugConfigurationProvider();
	const DEBUG_ADAPTER = path.join('.', 'out', 'src', 'debugAdapter', 'goDebug.js');

	const PROJECT_ROOT = path.normalize(path.join(__dirname, '..', '..', '..'));
	const DATA_ROOT = path.join(PROJECT_ROOT, 'test', 'testdata');

	const remoteAttachConfig = {
		name: 'Attach',
		type: 'go',
		request: 'attach',
		mode: 'remote', // This implies debugAdapter = legacy.
		host: '127.0.0.1',
		port: 3456
	};

	let dc: DebugClient;
	let dlvDapAdapter: DelveDAPDebugAdapterOnSocket | null;
	let dapTraced = false;

	setup(async () => {
		dapTraced = false;

		if (isDlvDap) {
			dc = new DebugClient('dlv', 'dap', 'go');
			// dc.start will be called in initializeDebugConfig call,
			// which creates a thin adapter for delve dap mode,
			// runs it on a network port, and gets wired with this dc.

			// Launching delve may take longer than the default timeout of 5000.
			dc.defaultTimeout = 20_000;
			return;
		}

		dc = new DebugClient('node', path.join(PROJECT_ROOT, DEBUG_ADAPTER), 'go', undefined, true);
		// Launching delve may take longer than the default timeout of 5000.
		dc.defaultTimeout = 20_000;
		// To connect to a running debug server for debugging the tests, specify PORT.
		await dc.start();
	});

	teardown(async () => {
		if (dlvDapAdapter) {
			const d = dlvDapAdapter;
			dlvDapAdapter = null;
			if (ctx.currentTest?.state === 'failed') {
				console.log(`${ctx.currentTest?.title} FAILED: DAP Trace`);
				d.printLog();
			}
			d.dispose();
		} else {
			if (ctx.currentTest?.state === 'failed' && dapTraced) {
				console.log(`${ctx.currentTest?.title} FAILED: Debug Adapter Trace`);
				try {
					await new Promise<void>((resolve) => {
						const rl = readline.createInterface({
							input: fs.createReadStream(path.join(tmpdir(), 'vscode-go-debug.txt')),
							crlfDelay: Infinity
						});
						rl.on('line', (line) => console.log(line));
						rl.on('close', () => resolve());
					});
				} catch (e) {
					console.log(`Failed to read trace: ${e}`);
				}
			}
			dc?.stop();
		}
		sinon.restore();
	});

	/**
	 * This function sets up a server that returns helloworld on serverPort.
	 * The server will be started as a Delve remote headless instance
	 * that will listen on the specified dlvPort.
	 * We are using a server as opposed to a long-running program
	 * because we can use responses to better test when the program is
	 * running vs stopped/killed.
	 */
	async function setUpRemoteProgram(
		dlvPort: number,
		serverPort: number,
		acceptMultiClient = true,
		continueOnStart = true
	): Promise<cp.ChildProcess> {
		const serverFolder = path.join(DATA_ROOT, 'helloWorldServer');
		const toolPath = getBinPath('dlv');
		const args = [
			'debug',
			'--check-go-version=false',
			'--api-version=2',
			'--headless',
			`--listen=127.0.0.1:${dlvPort}`
		];
		if (acceptMultiClient) {
			args.push('--accept-multiclient');
		}
		if (continueOnStart) {
			args.push('--continue');
		}
		const childProcess = cp.spawn(toolPath, args, {
			cwd: serverFolder,
			env: { PORT: `${serverPort}`, ...process.env }
		});

		// Give dlv a few seconds to start.
		await new Promise((resolve) => setTimeout(resolve, 10_000));
		return childProcess;
	}

	/**
	 * Helper function to set up remote attach configuration.
	 * This will issue an initializeRequest, followed by attachRequest.
	 * It will then wait for an initializedEvent before sending a breakpointRequest
	 * if breakpoints are provided. Lastly the configurationDoneRequest will be sent.
	 * NOTE: For simplicity, this function assumes the breakpoints are in the same file.
	 */
	async function setUpRemoteAttach(config: DebugConfiguration, breakpoints: ILocation[] = []): Promise<void> {
		const debugConfig = await initializeDebugConfig(config);
		const initializedResult = await dc.initializeRequest();
		assert.ok(initializedResult.success);

		// When the attach request is completed successfully, we should get
		// an initialized event.
		await Promise.all([
			new Promise<void>(async (resolve) => {
				console.log(`Setting up attach request for ${JSON.stringify(debugConfig)}.`);
				const attachResult = await dc.attachRequest(debugConfig as DebugProtocol.AttachRequestArguments);
				assert.ok(attachResult.success);
				resolve();
			}),
			dc.waitForEvent('initialized')
		]);

		if (breakpoints.length) {
			console.log('Sending set breakpoints request for remote attach setup.');
			const breakpointsResult = await dc.setBreakpointsRequest({
				source: { path: breakpoints[0].path },
				breakpoints
			});
			assert.ok(breakpointsResult.success && breakpointsResult.body.breakpoints.length === breakpoints.length);
			// Verify that there are no non-verified breakpoints.
			breakpointsResult.body.breakpoints.forEach((breakpoint) => {
				assert.ok(breakpoint.verified);
			});
		}
		console.log('Sending configuration done request for remote attach setup.');
		const configurationDoneResult = await dc.configurationDoneRequest();
		assert.ok(configurationDoneResult.success);
	}

	/**
	 * Helper function to retrieve a stopped event for a breakpoint.
	 * This function will keep calling action() until we receive a stoppedEvent.
	 * Will return undefined if the result of repeatedly calling action does not
	 * induce a stoppedEvent.
	 */
	async function waitForBreakpoint(action: () => void, breakpoint: ILocation): Promise<void> {
		const assertStoppedLocation = dc.assertStoppedLocation('breakpoint', breakpoint);
		await new Promise((res) => setTimeout(res, 1_000));
		action();
		await assertStoppedLocation;
	}

	/**
	 * Helper function to assert that a variable has a particular value.
	 * This should be called when the program is stopped.
	 *
	 * The following requests are issued by this function to determine the
	 * value of the variable:
	 *  1. threadsRequest
	 *  2. stackTraceRequest
	 *  3. scopesRequest
	 *  4. variablesRequest
	 */
	async function assertLocalVariableValue(name: string, val: string): Promise<void> {
		const threadsResponse = await dc.threadsRequest();
		assert(threadsResponse.success);
		const stackTraceResponse = await dc.stackTraceRequest({ threadId: threadsResponse.body.threads[0].id });
		assert(stackTraceResponse.success);
		const scopesResponse = await dc.scopesRequest({ frameId: stackTraceResponse.body.stackFrames[0].id });
		assert(scopesResponse.success);
		const localScopeIndex = scopesResponse.body.scopes.findIndex((v) => v.name === 'Local' || v.name === 'Locals');
		assert(localScopeIndex >= 0, "no scope named 'Local':");
		const variablesResponse = await dc.variablesRequest({
			variablesReference: scopesResponse.body.scopes[localScopeIndex].variablesReference
		});
		assert(variablesResponse.success);
		// Locate the variable with the matching name.
		const i = variablesResponse.body.variables.findIndex((v) => v.name === name);
		assert(i >= 0, `no variable in scope named ${name}`);
		// Check that the value of name is val.
		assert.strictEqual(variablesResponse.body.variables[i].value, val);
	}

	suite('basic', () => {
		test('unknown request should produce error', async () => {
			// fake config that will be used to initialize fixtures.
			const config = { name: 'Launch', type: 'go', request: 'launch', program: DATA_ROOT };
			await initializeDebugConfig(config);

			try {
				await dc.send('illegal_request');
			} catch {
				return;
			}
			throw new Error('does not report error on unknown request');
		});
	});

	suite('initialize', () => {
		test('should return supported features', async () => {
			const config = { name: 'Launch', type: 'go', request: 'launch', program: DATA_ROOT };
			await initializeDebugConfig(config);
			await dc.initializeRequest().then((response) => {
				response.body = response.body || {};
				assert.strictEqual(response.body.supportsConditionalBreakpoints, true);
				assert.strictEqual(response.body.supportsConfigurationDoneRequest, true);
				if (!isDlvDap) {
					// not supported in dlv-dap
					assert.strictEqual(response.body.supportsSetVariable, true);
				}
			});
		});

		test("should produce error for invalid 'pathFormat'", async () => {
			const config = { name: 'Launch', type: 'go', request: 'launch', program: DATA_ROOT };
			await initializeDebugConfig(config);
			try {
				await dc.initializeRequest({
					adapterID: 'mock',
					linesStartAt1: true,
					columnsStartAt1: true,
					pathFormat: 'url'
				});
			} catch (err) {
				return; // want error
			}
			throw new Error("does not report error on invalid 'pathFormat' attribute");
		});
	});

	suite('env', () => {
		let sandbox: sinon.SinonSandbox;

		setup(() => {
			sandbox = sinon.createSandbox();
		});
		teardown(async () => sandbox.restore());

		test('env var from go.toolsEnvVars is respected', async () => {
			const PROGRAM = path.join(DATA_ROOT, 'envTest');
			const FILE = path.join(PROGRAM, 'main.go');
			const BREAKPOINT_LINE = 10;

			const goConfig = Object.create(vscode.workspace.getConfiguration('go'), {
				toolsEnvVars: {
					value: { FOO: 'BAR' }
				}
			});
			const configStub = sandbox.stub(extConfig, 'getGoConfig').returns(goConfig);

			const config = {
				name: 'Launch',
				type: 'go',
				request: 'launch',
				mode: 'debug',
				program: PROGRAM,
				args: ['FOO']
			};
			const debugConfig = await initializeDebugConfig(config);
			await dc.hitBreakpoint(debugConfig, getBreakpointLocation(FILE, BREAKPOINT_LINE));
			await assertLocalVariableValue('v', '"BAR"');

			await dc.continueRequest({ threadId: 1 }); // continue until completion for cleanup.
		});

		test('env var from launch config is respected', async () => {
			const PROGRAM = path.join(DATA_ROOT, 'envTest');
			const FILE = path.join(PROGRAM, 'main.go');
			const BREAKPOINT_LINE = 10;

			const goConfig = Object.create(vscode.workspace.getConfiguration('go'), {
				toolsEnvVars: {
					value: { FOO: 'BAR' }
				}
			});
			const configStub = sandbox.stub(extConfig, 'getGoConfig').returns(goConfig);

			const config = {
				name: 'Launch',
				type: 'go',
				request: 'launch',
				mode: 'debug',
				program: PROGRAM,
				args: ['FOO'],
				env: { FOO: 'BAZ' }
			};
			const debugConfig = await initializeDebugConfig(config);
			await dc.hitBreakpoint(debugConfig, getBreakpointLocation(FILE, BREAKPOINT_LINE));
			await assertLocalVariableValue('v', '"BAZ"');

			await dc.continueRequest({ threadId: 1 }); // continue until completion for cleanup.
		});
	});

	suite('launch', () => {
		test('should run program to the end', async () => {
			const PROGRAM = path.join(DATA_ROOT, 'baseTest');

			const config = {
				name: 'Launch',
				type: 'go',
				request: 'launch',
				mode: 'debug',
				program: PROGRAM
			};
			const debugConfig = await initializeDebugConfig(config);
			await Promise.all([dc.configurationSequence(), dc.launch(debugConfig), dc.waitForEvent('terminated')]);
		});

		test('should stop on entry', async () => {
			const PROGRAM = path.join(DATA_ROOT, 'baseTest');
			const config = {
				name: 'Launch',
				type: 'go',
				request: 'launch',
				mode: 'debug',
				program: PROGRAM,
				stopOnEntry: true
			};
			const debugConfig = await initializeDebugConfig(config);
			await Promise.all([
				dc.configurationSequence(),
				dc.launch(debugConfig),
				// The debug adapter does not support a stack trace request
				// when there are no goroutines running. Which is true when it is stopped
				// on entry. Therefore we would need another method from dc.assertStoppedLocation
				// to check the debugger is stopped on entry.
				dc.waitForEvent('stopped').then((event) => {
					const stevent = event as DebugProtocol.StoppedEvent;
					assert.strictEqual(stevent.body.reason, 'entry');
				})
			]);
		});

		test('should debug a file', async () => {
			const PROGRAM = path.join(DATA_ROOT, 'baseTest', 'test.go');
			const config = {
				name: 'Launch file',
				type: 'go',
				request: 'launch',
				mode: 'debug',
				program: PROGRAM
			};

			const debugConfig = await initializeDebugConfig(config);
			await Promise.all([dc.configurationSequence(), dc.launch(debugConfig), dc.waitForEvent('terminated')]);
		});

		test('should debug a single test', async () => {
			const PROGRAM = path.join(DATA_ROOT, 'baseTest');
			const config = {
				name: 'Launch file',
				type: 'go',
				request: 'launch',
				mode: 'test',
				program: PROGRAM,
				args: ['-test.run', 'TestMe']
			};

			const debugConfig = await initializeDebugConfig(config);
			await Promise.all([dc.configurationSequence(), dc.launch(debugConfig), dc.waitForEvent('terminated')]);
		});

		test('should debug a test package', async () => {
			const PROGRAM = path.join(DATA_ROOT, 'baseTest');
			const config = {
				name: 'Launch file',
				type: 'go',
				request: 'launch',
				mode: 'test',
				program: PROGRAM
			};

			const debugConfig = await initializeDebugConfig(config);
			await Promise.all([dc.configurationSequence(), dc.launch(debugConfig), dc.waitForEvent('terminated')]);
		});

		test('invalid flags are passed to dlv but should be caught by dlv (legacy)', async function () {
			if (isDlvDap) {
				this.skip();
			}

			const PROGRAM = path.join(DATA_ROOT, 'baseTest');
			const config = {
				name: 'Launch',
				type: 'go',
				request: 'launch',
				mode: 'debug',
				program: PROGRAM,
				dlvFlags: ['--invalid']
			};
			const debugConfig = await initializeDebugConfig(config);
			await Promise.all([
				dc.assertOutput('stderr', 'Error: unknown flag: --invalid\n', 5000),
				dc.waitForEvent('terminated'),
				dc.initializeRequest().then((response) => {
					// The current debug adapter does not respond to launch request but,
					// instead, sends error messages and TerminatedEvent as delve is closed.
					// The promise from dc.launchRequest resolves when the launch response
					// is received, so the promise will never get resolved.
					dc.launchRequest(debugConfig as any);
				})
			]);
		});

		test('invalid flags are passed to dlv but should be caught by dlv', async function () {
			if (!isDlvDap) {
				this.skip(); // not working in dlv-dap.
			}

			// TODO(hyangah): why does it take 30sec?
			const PROGRAM = path.join(DATA_ROOT, 'baseTest');
			const config = {
				name: 'Launch',
				type: 'go',
				request: 'launch',
				mode: 'debug',
				program: PROGRAM,
				dlvFlags: ['--invalid']
			};
			try {
				await initializeDebugConfig(config);
				await dc.initializeRequest();
			} catch (err) {
				return;
			}
			throw new Error('does not report error on invalid delve flag');
		});

		test('should run program with showLog=false and logOutput specified', async () => {
			const PROGRAM = path.join(DATA_ROOT, 'baseTest');

			const config = {
				name: 'Launch',
				type: 'go',
				request: 'launch',
				mode: 'debug',
				program: PROGRAM,
				showLog: false,
				logOutput: 'dap'
			};
			const debugConfig = await initializeDebugConfig(config, true);
			await Promise.all([dc.configurationSequence(), dc.launch(debugConfig), dc.waitForEvent('terminated')]);
		});

		test('should handle threads request after initialization', async () => {
			const PROGRAM = path.join(DATA_ROOT, 'baseTest');

			const config = {
				name: 'Launch',
				type: 'go',
				request: 'launch',
				mode: 'debug',
				program: PROGRAM
			};
			const debugConfig = await initializeDebugConfig(config);
			await Promise.all([
				dc.configurationSequence().then(() => {
					dc.threadsRequest().then((response) => {
						assert.ok(response.success);
					});
				}),
				dc.launch(debugConfig),
				dc.waitForEvent('terminated')
			]);
		});

		test('should handle delayed initial threads request', async () => {
			// If the program exits very quickly, the initial threadsRequest
			// will complete after it has exited.
			const PROGRAM = path.join(DATA_ROOT, 'baseTest');

			const config = {
				name: 'Launch',
				type: 'go',
				request: 'launch',
				mode: 'debug',
				program: PROGRAM
			};
			const debugConfig = await initializeDebugConfig(config);
			await Promise.all([dc.configurationSequence(), dc.launch(debugConfig), dc.waitForEvent('terminated')]);

			const response = await dc.threadsRequest();
			assert.ok(response.success);
		});

		test('user-specified --listen flag should be ignored', async () => {
			const PROGRAM = path.join(DATA_ROOT, 'baseTest');
			const config = {
				name: 'Launch',
				type: 'go',
				request: 'launch',
				mode: 'debug',
				program: PROGRAM,
				dlvFlags: ['--listen=127.0.0.1:80']
			};
			const debugConfig = await initializeDebugConfig(config);

			await Promise.all([dc.configurationSequence(), dc.launch(debugConfig), dc.waitForEvent('terminated')]);
		});
	});

	suite('set current working directory', () => {
		test('should debug program with cwd set', async () => {
			const WD = path.join(DATA_ROOT, 'cwdTest');
			const PROGRAM = path.join(WD, 'cwdTest');
			const FILE = path.join(PROGRAM, 'main.go');
			const BREAKPOINT_LINE = 11;

			const config = {
				name: 'Launch',
				type: 'go',
				request: 'launch',
				mode: 'debug',
				program: PROGRAM,
				cwd: WD
			};
			const debugConfig = await initializeDebugConfig(config);
			await dc.hitBreakpoint(debugConfig, getBreakpointLocation(FILE, BREAKPOINT_LINE));

			await assertLocalVariableValue('strdat', '"Hello, World!"');
		});

		test('should debug program without cwd set', async () => {
			const WD = path.join(DATA_ROOT, 'cwdTest');
			const PROGRAM = path.join(WD, 'cwdTest');
			const FILE = path.join(PROGRAM, 'main.go');
			const BREAKPOINT_LINE = 11;

			const config = {
				name: 'Launch',
				type: 'go',
				request: 'launch',
				mode: 'debug',
				program: PROGRAM
			};
			const debugConfig = await initializeDebugConfig(config);
			await dc.hitBreakpoint(debugConfig, getBreakpointLocation(FILE, BREAKPOINT_LINE));

			await assertLocalVariableValue('strdat', '"Goodbye, World."');
		});

		test('should debug file program with cwd set', async () => {
			const WD = path.join(DATA_ROOT, 'cwdTest');
			const PROGRAM = path.join(WD, 'cwdTest', 'main.go');
			const FILE = PROGRAM;
			const BREAKPOINT_LINE = 11;

			const config = {
				name: 'Launch',
				type: 'go',
				request: 'launch',
				mode: 'debug',
				program: PROGRAM,
				cwd: WD
			};
			const debugConfig = await initializeDebugConfig(config);
			await dc.hitBreakpoint(debugConfig, getBreakpointLocation(FILE, BREAKPOINT_LINE));

			await assertLocalVariableValue('strdat', '"Hello, World!"');
		});

		test('should debug file program without cwd set', async () => {
			const WD = path.join(DATA_ROOT, 'cwdTest');
			const PROGRAM = path.join(WD, 'cwdTest', 'main.go');
			const FILE = PROGRAM;
			const BREAKPOINT_LINE = 11;

			const config = {
				name: 'Launch',
				type: 'go',
				request: 'launch',
				mode: 'debug',
				program: PROGRAM
			};
			const debugConfig = await initializeDebugConfig(config);

			await dc.hitBreakpoint(debugConfig, getBreakpointLocation(FILE, BREAKPOINT_LINE));

			await assertLocalVariableValue('strdat', '"Goodbye, World."');
		});

		async function waitForHelloGoodbyeOutput(dc: DebugClient): Promise<DebugProtocol.Event> {
			return await new Promise<DebugProtocol.Event>((resolve, reject) => {
				dc.on('output', (event) => {
					if (event.body.output === 'Hello, World!\n' || event.body.output === 'Goodbye, World.\n') {
						// Resolve when we have found the event that we want.
						resolve(event);
						return;
					}
				});
			});
		}

		test('should run program with cwd set (noDebug)', async () => {
			const WD = path.join(DATA_ROOT, 'cwdTest');
			const PROGRAM = path.join(WD, 'cwdTest');

			const config = {
				name: 'Launch',
				type: 'go',
				request: 'launch',
				mode: 'debug',
				program: PROGRAM,
				cwd: WD,
				noDebug: true
			};
			const debugConfig = await initializeDebugConfig(config);
			dc.launch(debugConfig);
			const event = await waitForHelloGoodbyeOutput(dc);
			assert.strictEqual(event.body.output, 'Hello, World!\n');
		});

		test('should run program without cwd set (noDebug)', async () => {
			const WD = path.join(DATA_ROOT, 'cwdTest');
			const PROGRAM = path.join(WD, 'cwdTest');

			const config = {
				name: 'Launch',
				type: 'go',
				request: 'launch',
				mode: 'debug',
				program: PROGRAM,
				noDebug: true
			};
			const debugConfig = await initializeDebugConfig(config);
			dc.launch(debugConfig);
			const event = await waitForHelloGoodbyeOutput(dc);
			assert.strictEqual(event.body.output, 'Goodbye, World.\n');
		});

		test('should run file program with cwd set (noDebug)', async () => {
			const WD = path.join(DATA_ROOT, 'cwdTest');
			const PROGRAM = path.join(WD, 'cwdTest', 'main.go');

			const config = {
				name: 'Launch',
				type: 'go',
				request: 'launch',
				mode: 'debug',
				program: PROGRAM,
				cwd: WD,
				noDebug: true
			};
			const debugConfig = await initializeDebugConfig(config);
			dc.launch(debugConfig);
			const event = await waitForHelloGoodbyeOutput(dc);
			assert.strictEqual(event.body.output, 'Hello, World!\n');
		});
		test('should run file program without cwd set (noDebug)', async () => {
			const WD = path.join(DATA_ROOT, 'cwdTest');
			const PROGRAM = path.join(WD, 'cwdTest', 'main.go');

			const config = {
				name: 'Launch',
				type: 'go',
				request: 'launch',
				mode: 'debug',
				program: PROGRAM,
				noDebug: true
			};
			const debugConfig = await initializeDebugConfig(config);
			dc.launch(debugConfig);
			const event = await waitForHelloGoodbyeOutput(dc);
			assert.strictEqual(event.body.output, 'Goodbye, World.\n');
		});
	});

	suite('remote attach', () => {
		let childProcess: cp.ChildProcess;
		let server: number;
		let debugConfig: DebugConfiguration;

		setup(async () => {
			server = await getPort();
			remoteAttachConfig.port = await getPort();
			debugConfig = remoteAttachConfig;
		});

		teardown(async () => {
			await dc.stop();
			await killProcessTree(childProcess);
			// Wait 2 seconds for the process to be killed.
			await new Promise((resolve) => setTimeout(resolve, 2_000));
		});

		test('can connect and initialize using external dlv --headless --accept-multiclient=true --continue=true', async () => {
			childProcess = await setUpRemoteProgram(remoteAttachConfig.port, server, true, true);

			await setUpRemoteAttach(debugConfig);
		});

		test('can connect and initialize using external dlv --headless --accept-multiclient=false --continue=false', async () => {
			childProcess = await setUpRemoteProgram(remoteAttachConfig.port, server, false, false);

			await setUpRemoteAttach(debugConfig);
		});

		test('can connect and initialize using external dlv --headless --accept-multiclient=true --continue=false', async () => {
			childProcess = await setUpRemoteProgram(remoteAttachConfig.port, server, true, false);

			await setUpRemoteAttach(debugConfig);
		});

		test('connection to remote is terminated when external dlv process exits', async function () {
			if (isDlvDap) {
				this.skip(); // this test does not apply for dlv-dap.
			}

			const childProcess = await setUpRemoteProgram(remoteAttachConfig.port, server, true, false);

			await setUpRemoteAttach(remoteAttachConfig);

			killProcess(childProcess);

			await dc.waitForEvent('terminated');
		});
	});

	// The file paths returned from delve use '/' not the native path
	// separator, so we can replace any instances of '\' with '/', which
	// allows the hitBreakpoint check to match.
	const getBreakpointLocation = (FILE: string, LINE: number) => {
		return { path: FILE.replace(/\\/g, '/'), line: LINE };
	};

	suite('setBreakpoints', () => {
		let server: number;
		let remoteAttachDebugConfig: DebugConfiguration;
		setup(async () => {
			server = await getPort();
			remoteAttachConfig.port = await getPort();
			remoteAttachDebugConfig = remoteAttachConfig;
		});

		test('should stop on a breakpoint', async () => {
			const PROGRAM = path.join(DATA_ROOT, 'baseTest');

			const FILE = path.join(DATA_ROOT, 'baseTest', 'test.go');
			const BREAKPOINT_LINE = 11;

			const config = {
				name: 'Launch',
				type: 'go',
				request: 'launch',
				mode: 'debug',
				program: PROGRAM
			};
			const debugConfig = await initializeDebugConfig(config);
			await dc.hitBreakpoint(debugConfig, getBreakpointLocation(FILE, BREAKPOINT_LINE));
		});

		test('should stop on a breakpoint in test file', async () => {
			const PROGRAM = path.join(DATA_ROOT, 'baseTest');

			const FILE = path.join(DATA_ROOT, 'baseTest', 'sample_test.go');
			const BREAKPOINT_LINE = 15;

			const config = {
				name: 'Launch file',
				type: 'go',
				request: 'launch',
				mode: 'test',
				program: PROGRAM
			};
			const debugConfig = await initializeDebugConfig(config);
			await dc.hitBreakpoint(debugConfig, getBreakpointLocation(FILE, BREAKPOINT_LINE));
		});

		test('stopped for a breakpoint set during initialization (remote attach)', async () => {
			const FILE = path.join(DATA_ROOT, 'helloWorldServer', 'main.go');
			const BREAKPOINT_LINE = 29;
			const remoteProgram = await setUpRemoteProgram(remoteAttachConfig.port, server);

			const breakpointLocation = getBreakpointLocation(FILE, BREAKPOINT_LINE);

			// Setup attach with a breakpoint.
			await setUpRemoteAttach(remoteAttachDebugConfig, [breakpointLocation]);

			// Calls the helloworld server to make the breakpoint hit.
			await waitForBreakpoint(
				() => http.get(`http://localhost:${server}`).on('error', (data) => console.log(data)),
				breakpointLocation
			);

			await dc.disconnectRequest({ restart: false });
			await killProcessTree(remoteProgram);
			await new Promise((resolve) => setTimeout(resolve, 2_000));
		});

		test('stopped for a breakpoint set after initialization (remote attach)', async () => {
			const FILE = path.join(DATA_ROOT, 'helloWorldServer', 'main.go');
			const BREAKPOINT_LINE = 29;
			const remoteProgram = await setUpRemoteProgram(remoteAttachConfig.port, server);

			// Setup attach without a breakpoint.
			await setUpRemoteAttach(remoteAttachDebugConfig);

			// Now sets a breakpoint.
			const breakpointLocation = getBreakpointLocation(FILE, BREAKPOINT_LINE);
			const breakpointsResult = await dc.setBreakpointsRequest({
				source: { path: breakpointLocation.path },
				breakpoints: [breakpointLocation]
			});
			assert.ok(breakpointsResult.success && breakpointsResult.body.breakpoints[0].verified);

			// Calls the helloworld server to make the breakpoint hit.
			await waitForBreakpoint(
				() => http.get(`http://localhost:${server}`).on('error', (data) => console.log(data)),
				breakpointLocation
			);

			await dc.disconnectRequest({ restart: false });
			await killProcessTree(remoteProgram);
			await new Promise((resolve) => setTimeout(resolve, 2_000));
		});

		test('should set breakpoints during continue', async () => {
			const PROGRAM = path.join(DATA_ROOT, 'sleep');

			const FILE = path.join(DATA_ROOT, 'sleep', 'sleep.go');
			const HELLO_LINE = 10;
			const helloLocation = getBreakpointLocation(FILE, HELLO_LINE);

			const config = {
				name: 'Launch file',
				type: 'go',
				request: 'launch',
				mode: 'debug',
				program: PROGRAM
			};
			const debugConfig = await initializeDebugConfig(config);
			await Promise.all([dc.configurationSequence(), dc.launch(debugConfig)]);

			await Promise.all([
				dc.setBreakpointsRequest({
					lines: [helloLocation.line],
					breakpoints: [{ line: helloLocation.line, column: 0 }],
					source: { path: helloLocation.path }
				}),
				dc.assertStoppedLocation('breakpoint', helloLocation)
			]);
		});

		async function setBreakpointsWhileRunningStep(resumeFunc: () => Promise<void>) {
			const PROGRAM = path.join(DATA_ROOT, 'sleep');

			const FILE = path.join(DATA_ROOT, 'sleep', 'sleep.go');
			const SLEEP_LINE = 11;
			const setupBreakpoint = getBreakpointLocation(FILE, SLEEP_LINE);

			const HELLO_LINE = 10;
			const resumeBreakpoint = getBreakpointLocation(FILE, HELLO_LINE);

			const config = {
				name: 'Launch file',
				type: 'go',
				request: 'launch',
				mode: 'debug',
				program: PROGRAM
			};
			const debugConfig = await initializeDebugConfig(config);
			await dc.hitBreakpoint(debugConfig, setupBreakpoint);

			// The program is now stopped at the line containing time.Sleep().
			// Issue a next request, followed by a setBreakpointsRequest.
			await resumeFunc();

			// Assert that the program completes the step request.
			await Promise.all([
				dc.setBreakpointsRequest({
					lines: [resumeBreakpoint.line],
					breakpoints: [{ line: resumeBreakpoint.line, column: 0 }],
					source: { path: resumeBreakpoint.path }
				}),
				dc.assertStoppedLocation('step', {})
			]);

			// Once the 'step' has completed, continue the program and
			// make sure the breakpoint set while the program was nexting
			// is succesfully hit.
			await Promise.all([
				dc.continueRequest({ threadId: 1 }),
				dc.assertStoppedLocation('breakpoint', resumeBreakpoint)
			]);
		}

		test('should set breakpoints during next', async function () {
			if (!isDlvDap) {
				this.skip();
			}
			await setBreakpointsWhileRunningStep(async () => {
				const nextResponse = await dc.nextRequest({ threadId: 1 });
				assert.ok(nextResponse.success);
			});
		});

		test('should set breakpoints during step out', async function () {
			if (!isDlvDap) {
				this.skip();
			}

			await setBreakpointsWhileRunningStep(async () => {
				await Promise.all([dc.stepInRequest({ threadId: 1 }), dc.assertStoppedLocation('step', {})]);

				const stepOutResponse = await dc.stepOutRequest({ threadId: 1 });
				assert.ok(stepOutResponse.success);
			});
		});

		async function setBreakpointsDuringStep(nextFunc: () => void) {
			const PROGRAM = path.join(DATA_ROOT, 'sleep');

			const FILE = path.join(DATA_ROOT, 'sleep', 'sleep.go');
			const SLEEP_LINE = 11;
			const setupBreakpoint = getBreakpointLocation(FILE, SLEEP_LINE);

			const HELLO_LINE = 10;
			const onNextBreakpoint = getBreakpointLocation(FILE, HELLO_LINE);

			const config = {
				name: 'Launch file',
				type: 'go',
				request: 'launch',
				mode: 'debug',
				program: PROGRAM
			};
			const debugConfig = await initializeDebugConfig(config);
			await dc.hitBreakpoint(debugConfig, setupBreakpoint);

			// The program is now stopped at the line containing time.Sleep().
			// Issue a next request, followed by a setBreakpointsRequest.
			nextFunc();

			// Note: the current behavior of setting a breakpoint during a next
			// request will cause the step to be interrupted, so it may not be
			// stopped on the next line.
			await Promise.all([
				dc.setBreakpointsRequest({
					lines: [onNextBreakpoint.line],
					breakpoints: [{ line: onNextBreakpoint.line, column: 0 }],
					source: { path: onNextBreakpoint.path }
				}),
				dc.assertStoppedLocation('next cancelled', {})
			]);

			// Once the 'step' has completed, continue the program and
			// make sure the breakpoint set while the program was nexting
			// is succesfully hit.
			await Promise.all([
				dc.continueRequest({ threadId: 1 }),
				dc.assertStoppedLocation('breakpoint', onNextBreakpoint)
			]);
		}

		test('should set breakpoints during next (legacy)', async function () {
			if (isDlvDap) {
				this.skip();
			}
			await setBreakpointsDuringStep(async () => {
				const nextResponse = await dc.nextRequest({ threadId: 1 });
				assert.ok(nextResponse.success);
			});
		});

		test('should set breakpoints during step out (legacy)', async function () {
			if (isDlvDap) {
				this.skip();
			}

			await setBreakpointsDuringStep(async () => {
				const stepOutResponse = await dc.stepOutRequest({ threadId: 1 });
				assert.ok(stepOutResponse.success);
			});
		});
	});

	suite('conditionalBreakpoints', () => {
		test('should stop on conditional breakpoint', async () => {
			const PROGRAM = path.join(DATA_ROOT, 'condbp');
			const FILE = path.join(DATA_ROOT, 'condbp', 'condbp.go');
			const BREAKPOINT_LINE = 7;
			const location = getBreakpointLocation(FILE, BREAKPOINT_LINE);

			const config = {
				name: 'Launch',
				type: 'go',
				request: 'launch',
				mode: 'debug',
				program: PROGRAM
			};
			const debugConfig = await initializeDebugConfig(config);
			await Promise.all([
				dc
					.waitForEvent('initialized')
					.then(() => {
						return dc.setBreakpointsRequest({
							lines: [location.line],
							breakpoints: [{ line: location.line, condition: 'i == 2' }],
							source: { path: location.path }
						});
					})
					.then(() => {
						return dc.configurationDoneRequest();
					}),
				dc.launch(debugConfig),

				dc.assertStoppedLocation('breakpoint', location)
			]).then(() =>
				// The program is stopped at the breakpoint, check to make sure 'i == 1'.
				assertLocalVariableValue('i', '2')
			);
		});

		test('should add breakpoint condition', async () => {
			const PROGRAM = path.join(DATA_ROOT, 'condbp');
			const FILE = path.join(DATA_ROOT, 'condbp', 'condbp.go');
			const BREAKPOINT_LINE = 7;
			const location = getBreakpointLocation(FILE, BREAKPOINT_LINE);

			const config = {
				name: 'Launch',
				type: 'go',
				request: 'launch',
				mode: 'debug',
				program: PROGRAM
			};
			const debugConfig = await initializeDebugConfig(config);
			await dc
				.hitBreakpoint(debugConfig, location)
				.then(() =>
					// The program is stopped at the breakpoint, check to make sure 'i == 0'.
					assertLocalVariableValue('i', '0')
				)
				.then(() =>
					// Add a condition to the breakpoint, and make sure it runs until 'i == 2'.
					dc
						.setBreakpointsRequest({
							lines: [location.line],
							breakpoints: [{ line: location.line, condition: 'i == 2' }],
							source: { path: location.path }
						})
						.then(() =>
							Promise.all([
								dc.continueRequest({ threadId: 1 }),
								dc.assertStoppedLocation('breakpoint', location)
							]).then(() =>
								// The program is stopped at the breakpoint, check to make sure 'i == 2'.
								assertLocalVariableValue('i', '2')
							)
						)
				);
		});

		test('should remove breakpoint condition', async () => {
			const PROGRAM = path.join(DATA_ROOT, 'condbp');
			const FILE = path.join(DATA_ROOT, 'condbp', 'condbp.go');
			const BREAKPOINT_LINE = 7;
			const location = getBreakpointLocation(FILE, BREAKPOINT_LINE);

			const config = {
				name: 'Launch',
				type: 'go',
				request: 'launch',
				mode: 'debug',
				program: PROGRAM
			};
			const debugConfig = await initializeDebugConfig(config);
			await Promise.all([
				dc
					.waitForEvent('initialized')
					.then(async () => {
						return dc.setBreakpointsRequest({
							lines: [location.line],
							breakpoints: [{ line: location.line, condition: 'i == 2' }],
							source: { path: location.path }
						});
					})
					.then(() => {
						return dc.configurationDoneRequest();
					}),

				dc.launch(debugConfig),

				dc.assertStoppedLocation('breakpoint', location)
			])
				.then(() =>
					// The program is stopped at the breakpoint, check to make sure 'i == 2'.
					assertLocalVariableValue('i', '2')
				)
				.then(() =>
					// Remove the breakpoint condition, and make sure the program runs until 'i == 3'.
					dc
						.setBreakpointsRequest({
							lines: [location.line],
							breakpoints: [{ line: location.line }],
							source: { path: location.path }
						})
						.then(() =>
							Promise.all([
								dc.continueRequest({ threadId: 1 }),
								dc.assertStoppedLocation('breakpoint', location)
							]).then(() =>
								// The program is stopped at the breakpoint, check to make sure 'i == 3'.
								assertLocalVariableValue('i', '3')
							)
						)
				);
		});
	});

	suite('panicBreakpoints', () => {
		test('should stop on panic', async () => {
			const PROGRAM_WITH_EXCEPTION = path.join(DATA_ROOT, 'panic');

			const config = {
				name: 'Launch',
				type: 'go',
				request: 'launch',
				mode: 'debug',
				program: PROGRAM_WITH_EXCEPTION
			};
			const debugConfig = await initializeDebugConfig(config);
			await Promise.all([
				dc.configurationSequence(),
				dc.launch(debugConfig),
				dc.waitForEvent('stopped').then((event) => {
					assert(
						event.body.reason === 'runtime error' ||
							event.body.reason === 'panic' ||
							event.body.reason === 'exception'
					);
				})
			]);
		});

		test('should stop on runtime error during continue', async function () {
			if (!isDlvDap) {
				// Not implemented in the legacy adapter.
				this.skip();
			}

			const PROGRAM_WITH_EXCEPTION = path.join(DATA_ROOT, 'runtimeError');

			const config = {
				name: 'Launch',
				type: 'go',
				request: 'launch',
				mode: 'debug',
				program: PROGRAM_WITH_EXCEPTION
			};
			const debugConfig = await initializeDebugConfig(config);
			await Promise.all([
				dc.configurationSequence(),
				dc.launch(debugConfig),
				dc.waitForEvent('stopped').then((event) => {
					assert(
						event.body.reason === 'runtime error' ||
							event.body.reason === 'panic' ||
							event.body.reason === 'exception'
					);
				})
			]);
		});

		test('should stop on runtime error during next', async function () {
			if (!isDlvDap) {
				// Not implemented in the legacy adapter.
				this.skip();
			}

			const PROGRAM_WITH_EXCEPTION = path.join(DATA_ROOT, 'runtimeError');
			const FILE = path.join(PROGRAM_WITH_EXCEPTION, 'oops.go');
			const BREAKPOINT_LINE = 5;

			const config = {
				name: 'Launch',
				type: 'go',
				request: 'launch',
				mode: 'debug',
				program: PROGRAM_WITH_EXCEPTION
			};
			const debugConfig = await initializeDebugConfig(config);

			await dc.hitBreakpoint(debugConfig, getBreakpointLocation(FILE, BREAKPOINT_LINE));
			await Promise.all([
				dc.nextRequest({ threadId: 1 }),
				dc.waitForEvent('stopped').then((event) => {
					assert(
						event.body.reason === 'runtime error' ||
							event.body.reason === 'panic' ||
							event.body.reason === 'exception'
					);
				})
			]);
		});
	});

	suite('disconnect', () => {
		// The teardown code for the Go Debug Adapter test suite issues a disconnectRequest.
		// In order for these tests to pass, the debug adapter must not fail if a
		// disconnectRequest is sent after it has already disconnected.

		test('disconnect should work for remote attach', async () => {
			const server = await getPort();
			remoteAttachConfig.port = await getPort();
			const remoteProgram = await setUpRemoteProgram(remoteAttachConfig.port, server);

			// Setup attach.
			await setUpRemoteAttach(remoteAttachConfig);

			// Calls the helloworld server to get a response.
			let response = '';
			await new Promise<void>((resolve) => {
				http.get(`http://localhost:${server}`, (res) => {
					res.on('data', (data) => (response += data));
					res.on('end', () => resolve());
				});
			});

			await dc.disconnectRequest();
			// Checks that after the disconnect, the helloworld server still works.
			let secondResponse = '';
			await new Promise<void>((resolve) => {
				http.get(`http://localhost:${server}`, (res) => {
					res.on('data', (data) => (secondResponse += data));
					res.on('end', () => resolve());
				});
			});
			assert.strictEqual(response, 'Hello, world!');
			assert.strictEqual(response, secondResponse);
			await killProcessTree(remoteProgram);
			await new Promise((resolve) => setTimeout(resolve, 2_000));
		});

		test('should disconnect while continuing on entry', async () => {
			const PROGRAM = path.join(DATA_ROOT, 'loop');

			const config = {
				name: 'Launch',
				type: 'go',
				request: 'launch',
				mode: 'debug',
				program: PROGRAM,
				stopOnEntry: false
			};
			const debugConfig = await initializeDebugConfig(config);
			await Promise.all([dc.configurationSequence(), dc.launch(debugConfig)]);

			await Promise.all([dc.disconnectRequest({ restart: false }), dc.waitForEvent('terminated')]);
		});

		// FIXIT: disabled due to https://github.com/golang/vscode-go/issues/1995
		test.skip('should disconnect with multiple disconnectRequests', async () => {
			const PROGRAM = path.join(DATA_ROOT, 'loop');

			const config = {
				name: 'Launch',
				type: 'go',
				request: 'launch',
				mode: 'debug',
				program: PROGRAM,
				stopOnEntry: false
			};
			const debugConfig = await initializeDebugConfig(config);

			await Promise.all([dc.configurationSequence(), dc.launch(debugConfig)]);

			await Promise.all([
				new Promise<void>((resolve) => {
					dc.disconnectRequest({ restart: false });
					dc.disconnectRequest({ restart: false });
					resolve();
				}),
				dc.waitForEvent('terminated')
			]);
		});

		test('should disconnect after continue', async () => {
			const PROGRAM = path.join(DATA_ROOT, 'loop');

			const config = {
				name: 'Launch',
				type: 'go',
				request: 'launch',
				mode: 'debug',
				program: PROGRAM,
				stopOnEntry: true
			};
			const debugConfig = await initializeDebugConfig(config);
			await Promise.all([dc.configurationSequence(), dc.launch(debugConfig)]);

			const continueResponse = await dc.continueRequest({ threadId: 1 });
			assert.ok(continueResponse.success);

			await Promise.all([dc.disconnectRequest({ restart: false }), dc.waitForEvent('terminated')]);
		});

		test('should disconnect while nexting', async () => {
			const PROGRAM = path.join(DATA_ROOT, 'sleep');
			const FILE = path.join(DATA_ROOT, 'sleep', 'sleep.go');
			const BREAKPOINT_LINE = 11;
			const location = getBreakpointLocation(FILE, BREAKPOINT_LINE);

			const config = {
				name: 'Launch',
				type: 'go',
				request: 'launch',
				mode: 'debug',
				program: PROGRAM,
				stopOnEntry: false
			};
			const debugConfig = await initializeDebugConfig(config);
			await dc.hitBreakpoint(debugConfig, location);

			const nextResponse = await dc.nextRequest({ threadId: 1 });
			assert.ok(nextResponse.success);

			await Promise.all([dc.disconnectRequest({ restart: false }), dc.waitForEvent('terminated')]);
		});

		test('should disconnect while paused on pause', async () => {
			const PROGRAM = path.join(DATA_ROOT, 'loop');

			const config = {
				name: 'Launch',
				type: 'go',
				request: 'launch',
				mode: 'debug',
				program: PROGRAM
			};
			const debugConfig = await initializeDebugConfig(config);

			await Promise.all([dc.configurationSequence(), dc.launch(debugConfig)]);

			const pauseResponse = await dc.pauseRequest({ threadId: 1 });
			assert.ok(pauseResponse.success);

			await Promise.all([dc.disconnectRequest({ restart: false }), dc.waitForEvent('terminated')]);
		});

		test('should disconnect while paused on breakpoint', async () => {
			const PROGRAM = path.join(DATA_ROOT, 'loop');
			const FILE = path.join(PROGRAM, 'loop.go');
			const BREAKPOINT_LINE = 5;

			const config = {
				name: 'Launch',
				type: 'go',
				request: 'launch',
				mode: 'debug',
				program: PROGRAM
			};
			const debugConfig = await initializeDebugConfig(config);

			await dc.hitBreakpoint(debugConfig, getBreakpointLocation(FILE, BREAKPOINT_LINE));

			await Promise.all([dc.disconnectRequest({ restart: false }), dc.waitForEvent('terminated')]);
		});

		test('should disconnect while paused on entry', async () => {
			const PROGRAM = path.join(DATA_ROOT, 'loop');

			const config = {
				name: 'Launch',
				type: 'go',
				request: 'launch',
				mode: 'debug',
				program: PROGRAM,
				stopOnEntry: true
			};
			const debugConfig = await initializeDebugConfig(config);

			await Promise.all([dc.configurationSequence(), dc.launch(debugConfig)]);

			await Promise.all([dc.disconnectRequest({ restart: false }), dc.waitForEvent('terminated')]);
		});

		test('should disconnect while paused on next', async () => {
			const PROGRAM = path.join(DATA_ROOT, 'loop');

			const config = {
				name: 'Launch',
				type: 'go',
				request: 'launch',
				mode: 'debug',
				program: PROGRAM,
				stopOnEntry: true
			};
			const debugConfig = await initializeDebugConfig(config);

			await Promise.all([dc.configurationSequence(), dc.launch(debugConfig)]);

			const nextResponse = await dc.nextRequest({ threadId: 1 });
			assert.ok(nextResponse.success);

			await Promise.all([dc.disconnectRequest({ restart: false }), dc.waitForEvent('terminated')]);
		});

		// This test is flaky. It has been updated to run stat multiple
		// times to decrease the likelihood of stat occuring before delve
		// has a chance to clean up.
		// BUG(https://github.com/golang/vscode-go/issues/1993)
		test('should cleanup when stopped', async function () {
			if (!isDlvDap) {
				this.skip();
			}
			const PROGRAM = path.join(DATA_ROOT, 'loop');
			const OUTPUT = path.join(PROGRAM, '_loop_output');

			const config = {
				name: 'Launch',
				type: 'go',
				request: 'launch',
				mode: 'debug',
				program: PROGRAM,
				stopOnEntry: false,
				output: OUTPUT
			};
			const debugConfig = await initializeDebugConfig(config);

			await Promise.all([dc.configurationSequence(), dc.launch(debugConfig)]);

			try {
				const fsstat = util.promisify(fs.stat);
				await fsstat(OUTPUT);
			} catch (e) {
				assert.fail(`debug output ${OUTPUT} wasn't built: ${e}`);
			}

			// Skip the proper disconnect sequence started with a disconnect request.
			await dlvDapAdapter?.dispose(1);
			dc = undefined!;
			let stat: fs.Stats | null = null;
			try {
				const fsstat = util.promisify(fs.stat);
				const maxAttempts = 2;
				for (let i = 0; i < maxAttempts; i++) {
					await sleep(1000); // allow dlv to respond and finish cleanup.
					stat = await fsstat(OUTPUT);
					// Don't need to try again if stat result is null.
					if (stat === null) {
						break;
					}
				}
				fs.unlinkSync(OUTPUT);
			} catch (e) {
				console.log(`output was cleaned ${OUTPUT} ${e}`);
			}
			assert.strictEqual(stat, null, `debug output ${OUTPUT} wasn't cleaned up. ${JSON.stringify(stat)}`);
			console.log('finished');
		});
	});

	suite('switch goroutine', () => {
		async function continueAndFindParkedGoroutine(file: string): Promise<number> {
			// Find a goroutine that is stopped in parked.
			const bp = getBreakpointLocation(file, 8);
			await dc.setBreakpointsRequest({ source: { path: bp.path }, breakpoints: [bp] });

			let parkedGoid = -1;
			while (parkedGoid < 0) {
				const res = await Promise.all([
					dc.continueRequest({ threadId: 1 }),
					Promise.race([
						dc.waitForEvent('stopped'),
						// It is very unlikely to happen. But in theory if all sayhi
						// goroutines are run serially, there will never be a second parked
						// sayhi goroutine when another breaks and we will keep trying
						// until process termination. If the process terminates, mark the test
						// as done.
						dc.waitForEvent('terminated')
					])
				]);
				const event = res[1];
				if (res[1].event === 'terminated') {
					break;
				}
				const threads = await dc.threadsRequest();

				// Search for a parked goroutine that we know for sure will have to be
				// resumed before the program can exit. This is a goroutine that:
				// 1. is executing main.hi
				// 2. hasn't called wg.Done yet
				// 3. is not the currently selected goroutine
				for (let i = 0; i < threads.body.threads.length; i++) {
					const g = threads.body.threads[i];
					if (g.id === event.body.threadId) {
						continue;
					}
					const st = await dc.stackTraceRequest({ threadId: g.id, startFrame: 0, levels: 5 });
					for (let j = 0; j < st.body.stackFrames.length; j++) {
						const frame = st.body.stackFrames[j];
						if (frame.name === 'main.hi') {
							parkedGoid = g.id;
							break;
						}
					}
					if (parkedGoid >= 0) {
						break;
					}
				}
			}

			// Clear all breakpoints
			await dc.setBreakpointsRequest({ source: { path: bp.path }, breakpoints: [] });
			return parkedGoid;
		}

		async function runSwitchGoroutineTest(stepFunction: string) {
			const PROGRAM = path.join(DATA_ROOT, 'goroutineTest');
			const FILE = path.join(PROGRAM, 'main.go');

			const config = {
				name: 'Launch',
				type: 'go',
				request: 'launch',
				mode: 'debug',
				program: PROGRAM,
				stopOnEntry: true
			};
			const debugConfig = await initializeDebugConfig(config);

			await Promise.all([dc.configurationSequence(), dc.launch(debugConfig), dc.waitForEvent('stopped')]);

			const parkedGoid = await continueAndFindParkedGoroutine(FILE);

			// runStepFunction runs the necessary step function and resolves if it succeeded.
			async function runStepFunction(
				args: { threadId: number },
				resolve: (value: void | PromiseLike<void>) => void,
				reject: (reason?: any) => void
			) {
				const callback = (resp: any) => {
					assert.ok(resp.success);
					resolve();
				};
				switch (stepFunction) {
					case 'next':
						callback(await dc.nextRequest(args));
						break;
					case 'step in':
						callback(await dc.stepInRequest(args));
						break;
					case 'step out':
						callback(await dc.stepOutRequest(args));
						break;
					default:
						reject(new Error(`not a valid step function ${stepFunction}`));
				}
			}

			if (parkedGoid > 0) {
				// Next on the parkedGoid.
				await Promise.all([
					new Promise<void>((resolve, reject) => {
						const args = { threadId: parkedGoid };
						return runStepFunction(args, resolve, reject);
					}),
					dc.waitForEvent('stopped').then((event) => {
						assert.strictEqual(event.body.reason, 'step');
						assert.strictEqual(event.body.threadId, parkedGoid);
					})
				]);
			} else {
				console.log('Unable to find a goroutine to step.');
			}
		}

		test('next', async function () {
			if (!isDlvDap) {
				// Not implemented in the legacy adapter.
				this.skip();
			}
			await runSwitchGoroutineTest('next');
		});

		test('step in', async function () {
			if (!isDlvDap) {
				// Not implemented in the legacy adapter.
				this.skip();
			}
			await runSwitchGoroutineTest('step in');
		});

		test('step out', async function () {
			if (!isDlvDap) {
				// Not implemented in the legacy adapter.
				this.skip();
			}
			await runSwitchGoroutineTest('step in');
		});
	});

	suite('logDest attribute tests', () => {
		const PROGRAM = path.join(DATA_ROOT, 'baseTest');

		let tmpDir: string;
		suiteSetup(() => {
			tmpDir = fs.mkdtempSync(path.join(tmpdir(), 'logDestTest'));
		});
		suiteTeardown(() => {
			tryRmdirRecursive(tmpDir);
		});

		test('logs are written to logDest file', async function () {
			if (!isDlvDap || process.platform === 'win32') {
				this.skip();
			}
			const DELVE_LOG = path.join(tmpDir, 'delve.log');
			const config = {
				name: 'Launch',
				type: 'go',
				request: 'launch',
				mode: 'debug',
				program: PROGRAM,
				logDest: DELVE_LOG
			};

			const debugConfig = await initializeDebugConfig(config);
			await Promise.all([dc.configurationSequence(), dc.launch(debugConfig), dc.waitForEvent('terminated')]);
			await dc.stop();
			dc = undefined!;
			const dapLog = fs.readFileSync(DELVE_LOG)?.toString();
			const preamble =
				debugConfig?.console === 'integratedTerminal' || debugConfig?.console === 'externalTerminal'
					? 'DAP server for a predetermined client'
					: 'DAP server listening at';
			assert(
				dapLog.includes(preamble) &&
					dapLog.includes('"command":"initialize"') &&
					dapLog.includes('"event":"terminated"'),
				dapLog
			);
		});

		async function testWithInvalidLogDest(logDest: any, wantedErrorMessage: string) {
			const config = {
				name: 'Launch',
				type: 'go',
				request: 'launch',
				mode: 'debug',
				program: PROGRAM,
				logDest
			};

			await initializeDebugConfig(config);
			try {
				await dc.initializeRequest();
				assert.fail('dlv dap started normally, wanted the invalid logDest to cause failure');
			} catch (error) {
				assert((error as Error)?.message.includes(wantedErrorMessage), `unexpected error: ${error}`);
			}
		}
		test('relative path as logDest triggers an error', async function () {
			if (!isDlvDap || withConsole || process.platform === 'win32') this.skip();
			await testWithInvalidLogDest('delve.log', 'relative path');
		});

		test('number as logDest triggers an error', async function () {
			if (!isDlvDap || withConsole || process.platform === 'win32') this.skip();
			await testWithInvalidLogDest(3, 'file descriptor');
		});
	});

	suite('substitute path', () => {
		// TODO(suzmue): add unit tests for substitutePath.
		let tmpDir: string;

		suiteSetup(() => {
			tmpDir = fs.mkdtempSync(path.join(DATA_ROOT, 'substitutePathTest'));
		});

		suiteTeardown(() => {
			tryRmdirRecursive(tmpDir);
		});

		function copyDirectory(name: string) {
			const from = path.join(DATA_ROOT, name);
			const to = path.join(tmpDir, name);
			fs.mkdirSync(to);
			fs.readdirSync(from).forEach((file) => {
				fs.copyFileSync(path.join(from, file), path.join(to, file));
			});
			return to;
		}

		async function buildGoProgram(cwd: string, outputFile: string): Promise<string> {
			const goRuntimePath = getBinPath('go');
			const execFile = util.promisify(cp.execFile);
			const child = await execFile(goRuntimePath, ['build', '-o', outputFile, "--gcflags='all=-N -l'", '.'], {
				cwd
			});
			if (child.stderr.length > 0) {
				throw Error(child.stderr);
			}
			return outputFile;
		}

		suite('substitutePath with missing files', () => {
			let goBuildOutput: string;
			suiteSetup(() => {
				goBuildOutput = fs.mkdtempSync(path.join(tmpdir(), 'output'));
			});

			suiteTeardown(() => {
				tryRmdirRecursive(goBuildOutput);
			});

			async function copyBuildDelete(program: string): Promise<{ program: string; output: string }> {
				const wd = copyDirectory(program);
				const output = await buildGoProgram(wd, path.join(goBuildOutput, program));
				tryRmdirRecursive(wd);
				return { program: wd, output };
			}

			test('should stop on a breakpoint set in file with substituted path', async () => {
				const { program, output } = await copyBuildDelete('baseTest');
				const FILE = path.join(DATA_ROOT, 'baseTest', 'test.go');
				const BREAKPOINT_LINE = 11;

				const config = {
					name: 'Launch',
					type: 'go',
					request: 'launch',
					mode: 'exec',
					program: output,
					substitutePath: [
						{
							from: path.join(DATA_ROOT, 'baseTest'),
							to: program
						}
					]
				};
				const debugConfig = await initializeDebugConfig(config);

				await dc.hitBreakpoint(debugConfig, getBreakpointLocation(FILE, BREAKPOINT_LINE));
			});
		});

		suite('substitutePath with remote program', () => {
			let server: number;
			let remoteAttachDebugConfig: DebugConfiguration;
			let helloWorldLocal: string;
			let helloWorldRemote: string;
			setup(async () => {
				server = await getPort();
				remoteAttachConfig.port = await getPort();
				remoteAttachDebugConfig = remoteAttachConfig;
			});

			suiteSetup(() => {
				helloWorldLocal = copyDirectory('helloWorldServer');
				helloWorldRemote = path.join(DATA_ROOT, 'helloWorldServer');
			});

			suiteTeardown(() => {
				tryRmdirRecursive(helloWorldLocal);
			});

			test('stopped for a breakpoint set during initialization using substitutePath (remote attach)', async () => {
				const FILE = path.join(helloWorldLocal, 'main.go');
				const BREAKPOINT_LINE = 29;
				const remoteProgram = await setUpRemoteProgram(remoteAttachConfig.port, server);

				const breakpointLocation = getBreakpointLocation(FILE, BREAKPOINT_LINE);
				// Setup attach with a breakpoint.
				remoteAttachDebugConfig.cwd = tmpDir;
				remoteAttachDebugConfig.remotePath = '';
				remoteAttachDebugConfig.substitutePath = [{ from: helloWorldLocal, to: helloWorldRemote }];
				await setUpRemoteAttach(remoteAttachDebugConfig, [breakpointLocation]);

				// Calls the helloworld server to make the breakpoint hit.
				await waitForBreakpoint(
					() => http.get(`http://localhost:${server}`).on('error', (data) => console.log(data)),
					breakpointLocation
				);

				await dc.disconnectRequest({ restart: false });
				await killProcessTree(remoteProgram);
				await new Promise((resolve) => setTimeout(resolve, 2_000));
			});

			// Skip because it times out in nightly release workflow.
			// BUG(https://github.com/golang/vscode-go/issues/1043)
			test.skip('stopped for a breakpoint set during initialization using remotePath (remote attach)', async function () {
				if (isDlvDap) {
					this.skip(); // remotePath is not used in dlv-dap
				}

				const FILE = path.join(helloWorldLocal, 'main.go');
				const BREAKPOINT_LINE = 29;
				const remoteProgram = await setUpRemoteProgram(remoteAttachConfig.port, server);

				const breakpointLocation = getBreakpointLocation(FILE, BREAKPOINT_LINE);
				// Setup attach with a breakpoint.
				remoteAttachDebugConfig.cwd = helloWorldLocal;
				remoteAttachDebugConfig.remotePath = helloWorldRemote;
				// This is a bad mapping, make sure that the remotePath config is used first.
				remoteAttachDebugConfig.substitutePath = [{ from: helloWorldLocal, to: helloWorldLocal }];
				await setUpRemoteAttach(remoteAttachDebugConfig, [breakpointLocation]);

				// Calls the helloworld server to make the breakpoint hit.
				await waitForBreakpoint(
					() => http.get(`http://localhost:${server}`).on('error', (data) => console.log(data)),
					breakpointLocation
				);

				await dc.disconnectRequest({ restart: false });
				await killProcessTree(remoteProgram);
				await new Promise((resolve) => setTimeout(resolve, 2_000));
			});
		});

		suite('substitutePath with symlink', () => {
			let realPath: string;
			let symlinkPath: string;

			suiteSetup(() => {
				realPath = copyDirectory('baseTest');
				symlinkPath = path.join(tmpDir, 'symlinked');
				fs.symlinkSync(realPath, symlinkPath, 'dir');
			});
			suiteTeardown(() => {
				fs.unlinkSync(symlinkPath);
				tryRmdirRecursive(realPath);
			});
			test('should stop on a breakpoint', async function () {
				if (!isDlvDap) this.skip(); // BUG: the legacy adapter fails with 'breakpoint verification mismatch' error.
				const FILE = path.join(symlinkPath, 'test.go');
				const BREAKPOINT_LINE = 11;
				const config = {
					name: 'Launch',
					type: 'go',
					request: 'launch',
					mode: 'debug',
					program: FILE,
					substitutePath: [
						{
							from: symlinkPath,
							to: realPath
						}
					]
				};
				const debugConfig = await initializeDebugConfig(config);
				await dc.hitBreakpoint(debugConfig, getBreakpointLocation(FILE, BREAKPOINT_LINE));
			});
		});
	});

	let testNumber = 0;
	async function initializeDebugConfig(config: DebugConfiguration, keepUserLogSettings?: boolean) {
		// be explicit and prevent resolveDebugConfiguration from picking
		// a default debugAdapter for us.
		config['debugAdapter'] = isDlvDap ? 'dlv-dap' : 'legacy';
		if (withConsole) {
			config['console'] = withConsole;
		}

		if (!keepUserLogSettings) {
			dapTraced = true;

			// Log the output for easier test debugging.
			config['logOutput'] = isDlvDap ? 'dap,debugger' : 'rpc,debugger';
			config['showLog'] = true;
			config['trace'] = 'verbose';
		}

		// disable version check (like in dlv-dap).
		if (!isDlvDap) {
			const dlvFlags = config['dlvFlags'] || [];
			config['dlvFlags'] = ['--check-go-version=false'].concat(dlvFlags);
		}
		// Give each test a distinct debug binary. If a previous test
		// and a new test use the same binary location, it is possible
		// that the second test could build the binary, and then the
		// first test could delete that binary during cleanup before the
		// second test has a chance to run it.
		if (!config['output'] && ['debug', 'auto', 'test'].includes(config['mode'])) {
			const dir = parseDebugProgramArgSync(config['program']).dirname;
			config['output'] = path.join(dir, `__debug_bin_${testNumber}`);
		}
		testNumber++;

		let debugConfig: DebugConfiguration | null | undefined = await debugConfigProvider.resolveDebugConfiguration(
			undefined,
			config
		);
		debugConfig = await debugConfigProvider.resolveDebugConfigurationWithSubstitutedVariables(
			undefined,
			debugConfig!
		);

		if (isDlvDap) {
			dlvDapAdapter = await DelveDAPDebugAdapterOnSocket.create(debugConfig!);
			const port = await dlvDapAdapter.serve();
			await dc.start(port); // This will connect to the adapter's port.
		}
		return debugConfig;
	}
};

suite('Go Debug Adapter Tests (legacy)', function () {
	this.timeout(60_000);
	testAll(this.ctx, false);
});

suite('Go Debug Adapter Tests (dlv-dap)', function () {
	this.timeout(60_000);
	testAll(this.ctx, true);
});

suite('Go Debug Adapter Tests (dlv-dap, console=integratedTerminal)', function () {
	this.timeout(60_000);
	testAll(this.ctx, true, 'integratedTerminal');
});

// DelveDAPDebugAdapterOnSocket runs a DelveDAPOutputAdapter
// over a network socket. This allows tests to instantiate
// the thin adapter for Delve DAP and the debug test support's
// DebugClient to communicate with the adapter over a network socket.
class DelveDAPDebugAdapterOnSocket extends proxy.DelveDAPOutputAdapter {
	static async create(config: DebugConfiguration) {
		const d = new DelveDAPDebugAdapterOnSocket(config);
		return d;
	}

	private constructor(config: DebugConfiguration) {
		super(config, new TimestampedLogger('error', undefined, PRINT_TO_CONSOLE));
	}

	private static TWO_CRLF = '\r\n\r\n';
	private _rawData?: Buffer;
	private _contentLength?: number;
	private _writableStream?: NodeJS.WritableStream;
	private _server?: net.Server;
	private _port?: number; // port for the thin adapter.

	public serve(): Promise<number | undefined> {
		return new Promise(async (resolve, reject) => {
			this._port = await getPort();
			this._server = net.createServer((c) => {
				this.log('>> accepted connection from client');
				c.on('end', () => {
					this.log('>> client disconnected');
					this.dispose();
				});
				this.run(c, c);
			});
			this._server.on('error', (err) => reject(err));
			this._server.listen(this._port, () => resolve(this._port));
		});
	}

	private run(inStream: NodeJS.ReadableStream, outStream: NodeJS.WritableStream): void {
		this._writableStream = outStream;
		this._rawData = Buffer.alloc(0);

		// forward to DelveDAPDebugAdapter, which will forward to dlv dap.
		inStream.on('data', (data: Buffer) => this._handleData(data));
		// DebugClient silently drops reverse requests. Handle runInTerminal request here.
		this.onDidSendMessage((m) => {
			if (this.handleRunInTerminal(m)) {
				return;
			}
			this._send(m);
		});

		inStream.resume();
	}

	// handleRunInTerminal spawns the requested command and simulates RunInTerminal
	// handler implementation inside an editor.
	private _dlvInTerminal: cp.ChildProcess | undefined;
	private handleRunInTerminal(m: vscode.DebugProtocolMessage) {
		const m0 = m as any;
		if (m0['type'] !== 'request' || m0['command'] !== 'runInTerminal') {
			return false;
		}
		const json = JSON.stringify(m0);
		this.log(`<- server: ${json}`);

		const resp = {
			seq: 0,
			type: 'response',
			success: false,
			request_seq: m0['seq'],
			command: m0['command'],
			body: {}
		};

		if (!this._dlvInTerminal && m0['arguments']?.args?.length > 0) {
			const args = m0['arguments'].args as string[];
			const env = m0['arguments'].env ? Object.assign({}, process.env, m0['arguments'].env) : undefined;
			const p = cp.spawn(args[0], args.slice(1), {
				cwd: m0['arguments'].cwd,
				env
			});
			// stdout/stderr are supposed to appear in the terminal, but
			// some of noDebug tests depend on access to stdout/stderr.
			// For those tests, let's pump the output as OutputEvent.
			p.stdout.on('data', (chunk) => {
				this.outputEvent('stdout', chunk.toString());
			});
			p.stderr.on('data', (chunk) => {
				this.outputEvent('stderr', chunk.toString());
			});
			resp.success = true;
			resp.body = { processId: p.pid };
			this._dlvInTerminal = p;
		}

		this.log(`-> server: ${JSON.stringify(resp)}`);
		this.handleMessage(resp);

		return true;
	}

	private _disposed = false;
	public async dispose(timeoutMS?: number) {
		if (this._disposed) {
			return;
		}
		this._disposed = true;
		this.log('adapter disposing');
		await this._server?.close();
		await super.dispose(timeoutMS);
		this.log('adapter disposed');
	}

	// Code from
	// https://github.com/microsoft/vscode-debugadapter-node/blob/2235a2227d1a439372be578cd3f55e15211851b7/testSupport/src/protocolClient.ts#L96-L97
	private _send(message: DebugProtocolMessage): void {
		if (this._writableStream) {
			const json = JSON.stringify(message);
			this.log(`<- server: ${json}`);
			if (!this._writableStream.writable) {
				this.log('socket closed already');
				return;
			}
			this._writableStream.write(
				`Content-Length: ${Buffer.byteLength(json, 'utf8')}${DelveDAPDebugAdapterOnSocket.TWO_CRLF}${json}`,
				'utf8'
			);
		}
	}

	// Code from
	// https://github.com/microsoft/vscode-debugadapter-node/blob/2235a2227d1a439372be578cd3f55e15211851b7/testSupport/src/protocolClient.ts#L100-L132
	private _handleData(data: Buffer): void {
		this._rawData = Buffer.concat([this._rawData!, data]);

		// eslint-disable-next-line no-constant-condition
		while (true) {
			if (this._contentLength! >= 0) {
				if (this._rawData.length >= this._contentLength!) {
					const message = this._rawData.toString('utf8', 0, this._contentLength);
					this._rawData = this._rawData.slice(this._contentLength);
					this._contentLength = -1;
					if (message.length > 0) {
						try {
							this.log(`-> server: ${message}`);
							const msg: DebugProtocol.ProtocolMessage = JSON.parse(message);
							this.handleMessage(msg);
						} catch (e) {
							throw new Error('Error handling data: ' + (e && (e as Error).message));
						}
					}
					continue; // there may be more complete messages to process
				}
			} else {
				const idx = this._rawData.indexOf(DelveDAPDebugAdapterOnSocket.TWO_CRLF);
				if (idx !== -1) {
					const header = this._rawData.toString('utf8', 0, idx);
					const lines = header.split('\r\n');
					for (let i = 0; i < lines.length; i++) {
						const pair = lines[i].split(/: +/);
						if (pair[0] === 'Content-Length') {
							this._contentLength = +pair[1];
						}
					}
					this._rawData = this._rawData.slice(idx + DelveDAPDebugAdapterOnSocket.TWO_CRLF.length);
					continue;
				}
			}
			break;
		}
	}
	/* --- accumulate log messages so we can output when the test fails --- */
	private _log = [] as string[];
	private log(msg: string) {
		this._log.push(msg);
		if (PRINT_TO_CONSOLE) {
			console.log(msg);
		}
	}
	public printLog() {
		this._log.forEach((msg) => console.log(msg));
	}
}

function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function tryRmdirRecursive(dir: string) {
	try {
		rmdirRecursive(dir);
	} catch (e) {
		console.log(`failed to delete ${dir}: ${e}`);
	}
}
