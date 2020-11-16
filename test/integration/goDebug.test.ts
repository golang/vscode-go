import * as assert from 'assert';
import { ChildProcess, spawn } from 'child_process';
import { debug } from 'console';
import * as fs from 'fs';
import getPort = require('get-port');
import * as http from 'http';
import * as path from 'path';
import * as sinon from 'sinon';
import { DebugConfiguration } from 'vscode';
import { DebugClient } from 'vscode-debugadapter-testsupport';
import { ILocation } from 'vscode-debugadapter-testsupport/lib/debugClient';
import { DebugProtocol } from 'vscode-debugprotocol';
import {
	Delve,
	escapeGoModPath,
	GoDebugSession,
	PackageBuildInfo,
	RemoteSourcesAndPackages,
} from '../../src/debugAdapter/goDebug';
import { GoDebugConfigurationProvider } from '../../src/goDebugConfiguration';
import { getBinPath } from '../../src/util';
import { killProcessTree } from '../../src/utils/processUtils';

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
		fileSystem = { existsSync: () => false } as unknown as typeof fs;
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
			'C:\\Users\\Documents\\src\\hello-world\\main.go');
		assert.strictEqual(inferredPath, '/app/hello-world/main.go');
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

		const localPath = path.join(process.env.GOPATH, 'pkg/mod/!foo!bar/test@v1.0.2/test.go');
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

		const localPath = path.join(process.env.GOPATH, 'pkg/mod/!foo!bar/test@v1.0.2/test.go');
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

		const localPath = path.join(process.env.GOPATH, 'src', 'foobar/test@v1.0.2-abcde-34/test.go');
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

		const localPath = path.join(process.env.GOPATH, 'src', 'foobar/test@v1.0.2/test.go');
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

		const localPath = path.join(process.env.GOROOT, 'src', 'foobar/test@v1.0.2/test.go');
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

		const localPath = path.join(process.env.GOROOT, 'src', 'foobar/test@v1.0.2/test.go');
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
		delve = { callPromise: () => ({}), isApiV1: false } as unknown as Delve;
		remoteSourcesAndPackages = new RemoteSourcesAndPackages();
	});

	teardown(() => {
		sinon.restore();
	});

	test('initializeRemotePackagesAndSources retrieves remote packages and sources', async () => {
		const stub = sinon.stub(delve, 'callPromise');
		stub.withArgs('ListPackagesBuildInfo', [{ IncludeFiles: true }])
			.returns(Promise.resolve({ List: [helloPackage, testPackage] }));
		stub.withArgs('ListSources', [{}])
			.returns(Promise.resolve({ Sources: sources }));

		await remoteSourcesAndPackages.initializeRemotePackagesAndSources(delve);
		assert.deepEqual(remoteSourcesAndPackages.remoteSourceFiles, sources);
		assert.deepEqual(remoteSourcesAndPackages.remotePackagesBuildInfo, [helloPackage, testPackage]);
	});
});

// Test suite adapted from:
// https://github.com/microsoft/vscode-mock-debug/blob/master/src/tests/adapter.test.ts
suite('Go Debug Adapter', function () {
	this.timeout(60_000);

	const debugConfigProvider = new GoDebugConfigurationProvider();
	const DEBUG_ADAPTER = path.join('.', 'out', 'src', 'debugAdapter', 'goDebug.js');

	const PROJECT_ROOT = path.normalize(path.join(__dirname, '..', '..', '..'));
	const DATA_ROOT = path.join(PROJECT_ROOT, 'test', 'testdata');

	const remoteAttachConfig = {
		name: 'Attach',
		type: 'go',
		request: 'attach',
		mode: 'remote',
		host: '127.0.0.1',
		port: 3456,
	};

	let dc: DebugClient;

	setup(() => {
		dc = new DebugClient('node', path.join(PROJECT_ROOT, DEBUG_ADAPTER), 'go');

		// Launching delve may take longer than the default timeout of 5000.
		dc.defaultTimeout = 20_000;

		// To connect to a running debug server for debugging the tests, specify PORT.
		return dc.start();
	});

	teardown(() => dc.stop());

	/**
	 * This function sets up a server that returns helloworld on serverPort.
	 * The server will be started as a Delve remote headless instance
	 * that will listen on the specified dlvPort.
	 * We are using a server as opposed to a long-running program
	 * because we can use responses to better test when the program is
	 * running vs stopped/killed.
	 */
	async function setUpRemoteProgram(
			dlvPort: number, serverPort: number,
			acceptMultiClient = true, continueOnStart = true): Promise<ChildProcess> {
		const serverFolder = path.join(DATA_ROOT, 'helloWorldServer');
		const toolPath = getBinPath('dlv');
		const args = ['debug', '--api-version=2', '--headless', `--listen=127.0.0.1:${dlvPort}`];
		if (acceptMultiClient) {
			args.push('--accept-multiclient');
		}
		if (continueOnStart) {
			args.push('--continue');
		}
		const childProcess = spawn(toolPath, args,
			{cwd: serverFolder,  env: { PORT: `${serverPort}`, ...process.env}});

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
		const debugConfig = debugConfigProvider.resolveDebugConfiguration(undefined, config);
		console.log(`Sending initializing request for remote attach setup.`);
		const initializedResult = await dc.initializeRequest();
		assert.ok(initializedResult.success);

		// When the attach request is completed successfully, we should get
		// an initialized event.
		await Promise.all([
			new Promise(async (resolve) => {
				console.log(`Setting up attach request for ${JSON.stringify(debugConfig)}.`);
				const attachResult = await dc.attachRequest(debugConfig as DebugProtocol.AttachRequestArguments);
				assert.ok(attachResult.success);
				resolve();
			}),
			dc.waitForEvent('initialized')
		]);

		if (breakpoints.length) {
			console.log(`Sending set breakpoints request for remote attach setup.`);
			const breakpointsResult = await dc.setBreakpointsRequest({source: {path: breakpoints[0].path}, breakpoints});
			assert.ok(breakpointsResult.success && breakpointsResult.body.breakpoints.length === breakpoints.length);
			// Verify that there are no non-verified breakpoints.
			breakpointsResult.body.breakpoints.forEach((breakpoint) => {
				assert.ok(breakpoint.verified);
			});
		}
		console.log(`Sending configuration done request for remote attach setup.`);
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
	async function assertVariableValue(name: string, val: string): Promise<void> {
		const threadsResponse = await dc.threadsRequest();
		assert(threadsResponse.success);
		const stackTraceResponse = await dc.stackTraceRequest({ threadId: threadsResponse.body.threads[0].id });
		assert(stackTraceResponse.success);
		const scopesResponse = await dc.scopesRequest({ frameId: stackTraceResponse.body.stackFrames[0].id });
		assert(scopesResponse.success);
		const variablesResponse = await dc.variablesRequest({
			variablesReference: scopesResponse.body.scopes[0].variablesReference
		});
		assert(variablesResponse.success);
		// Locate the variable with the matching name.
		const i = variablesResponse.body.variables.findIndex((v) => v.name === name);
		assert(i >= 0);
		// Check that the value of name is val.
		assert.strictEqual(variablesResponse.body.variables[i].value, val);
	}

	suite('basic', () => {

		test('unknown request should produce error', (done) => {
			dc.send('illegal_request').then(() => {
				done(new Error('does not report error on unknown request'));
			}).catch(() => {
				done();
			});
		});
	});

	suite('initialize', () => {

		test('should return supported features', () => {
			return dc.initializeRequest().then((response) => {
				response.body = response.body || {};
				assert.strictEqual(response.body.supportsConditionalBreakpoints, true);
				assert.strictEqual(response.body.supportsConfigurationDoneRequest, true);
				assert.strictEqual(response.body.supportsSetVariable, true);
			});
		});

		test('should produce error for invalid \'pathFormat\'', (done) => {
			dc.initializeRequest({
				adapterID: 'mock',
				linesStartAt1: true,
				columnsStartAt1: true,
				pathFormat: 'url'
			}).then((response) => {
				done(new Error('does not report error on invalid \'pathFormat\' attribute'));
			}).catch((err) => {
				// error expected
				done();
			});
		});
	});

	suite('launch', () => {
		test('should run program to the end', () => {

			const PROGRAM = path.join(DATA_ROOT, 'baseTest');

			const config = {
				name: 'Launch',
				type: 'go',
				request: 'launch',
				mode: 'auto',
				program: PROGRAM,
			};
			const debugConfig = debugConfigProvider.resolveDebugConfiguration(undefined, config);

			return Promise.all([
				dc.configurationSequence(),
				dc.launch(debugConfig),
				dc.waitForEvent('terminated')
			]);
		});

		test('should stop on entry', () => {
			const PROGRAM = path.join(DATA_ROOT, 'baseTest');
			const config = {
				name: 'Launch',
				type: 'go',
				request: 'launch',
				mode: 'auto',
				program: PROGRAM,
				stopOnEntry: true
			};
			const debugConfig = debugConfigProvider.resolveDebugConfiguration(undefined, config);

			return Promise.all([
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

		test('should debug a file', () => {
			const PROGRAM = path.join(DATA_ROOT, 'baseTest', 'test.go');
			const config = {
				name: 'Launch file',
				type: 'go',
				request: 'launch',
				mode: 'auto',
				program: PROGRAM,
				trace: 'verbose'
			};

			const debugConfig = debugConfigProvider.resolveDebugConfiguration(undefined, config);

			return Promise.all([
				dc.configurationSequence(),
				dc.launch(debugConfig),
				dc.waitForEvent('terminated')
			]);
		});

		test('should debug a single test', () => {
			const PROGRAM = path.join(DATA_ROOT, 'baseTest');
			const config = {
				name: 'Launch file',
				type: 'go',
				request: 'launch',
				mode: 'test',
				program: PROGRAM,
				args: [
					'-test.run',
					'TestMe'
				]
			};

			const debugConfig = debugConfigProvider.resolveDebugConfiguration(undefined, config);

			return Promise.all([
				dc.configurationSequence(),
				dc.launch(debugConfig),
				dc.waitForEvent('terminated')
			]);
		});

		test('should debug a test package', () => {
			const PROGRAM = path.join(DATA_ROOT, 'baseTest');
			const config = {
				name: 'Launch file',
				type: 'go',
				request: 'launch',
				mode: 'test',
				program: PROGRAM
			};

			const debugConfig = debugConfigProvider.resolveDebugConfiguration(undefined, config);

			return Promise.all([
				dc.configurationSequence(),
				dc.launch(debugConfig),
				dc.waitForEvent('terminated')
			]);
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
				mode: 'auto',
				program: PROGRAM,
				cwd: WD,
			};
			const debugConfig = debugConfigProvider.resolveDebugConfiguration(undefined, config);

			await dc.hitBreakpoint(debugConfig, getBreakpointLocation(FILE, BREAKPOINT_LINE));

			await assertVariableValue('strdat', '"Hello, World!"');
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
				mode: 'auto',
				program: PROGRAM,
			};
			const debugConfig = debugConfigProvider.resolveDebugConfiguration(undefined, config);

			await dc.hitBreakpoint(debugConfig, getBreakpointLocation(FILE, BREAKPOINT_LINE));

			await assertVariableValue('strdat', '"Goodbye, World."');
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
				mode: 'auto',
				program: PROGRAM,
				cwd: WD,
			};
			const debugConfig = debugConfigProvider.resolveDebugConfiguration(undefined, config);

			await dc.hitBreakpoint(debugConfig, getBreakpointLocation(FILE, BREAKPOINT_LINE));

			await assertVariableValue('strdat', '"Hello, World!"');
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
				mode: 'auto',
				program: PROGRAM,
			};
			const debugConfig = debugConfigProvider.resolveDebugConfiguration(undefined, config);

			await dc.hitBreakpoint(debugConfig, getBreakpointLocation(FILE, BREAKPOINT_LINE));

			await assertVariableValue('strdat', '"Goodbye, World."');
		});

		test('should run program with cwd set (noDebug)', () => {
			const WD = path.join(DATA_ROOT, 'cwdTest');
			const PROGRAM = path.join(WD, 'cwdTest');

			const config = {
				name: 'Launch',
				type: 'go',
				request: 'launch',
				mode: 'auto',
				program: PROGRAM,
				cwd: WD,
				noDebug: true
			};
			const debugConfig = debugConfigProvider.resolveDebugConfiguration(undefined, config);

			return Promise.all([
				dc.launch(debugConfig),
				dc.waitForEvent('output').then((event) => {
					assert.strictEqual(event.body.output, 'Hello, World!\n');
				})
			]);
		});

		test('should run program without cwd set (noDebug)', () => {
			const WD = path.join(DATA_ROOT, 'cwdTest');
			const PROGRAM = path.join(WD, 'cwdTest');

			const config = {
				name: 'Launch',
				type: 'go',
				request: 'launch',
				mode: 'auto',
				program: PROGRAM,
				noDebug: true
			};
			const debugConfig = debugConfigProvider.resolveDebugConfiguration(undefined, config);

			return Promise.all([
				dc.launch(debugConfig),
				dc.waitForEvent('output').then((event) => {
					assert.strictEqual(event.body.output, 'Goodbye, World.\n');
				})
			]);
		});

		test('should run file program with cwd set (noDebug)', () => {
			const WD = path.join(DATA_ROOT, 'cwdTest');
			const PROGRAM = path.join(WD, 'cwdTest', 'main.go');

			const config = {
				name: 'Launch',
				type: 'go',
				request: 'launch',
				mode: 'auto',
				program: PROGRAM,
				cwd: WD,
				noDebug: true
			};
			const debugConfig = debugConfigProvider.resolveDebugConfiguration(undefined, config);

			return Promise.all([
				dc.launch(debugConfig),
				dc.waitForEvent('output').then((event) => {
					assert.strictEqual(event.body.output, 'Hello, World!\n');
				})
			]);
		});

		test('should run file program without cwd set (noDebug)', () => {
			const WD = path.join(DATA_ROOT, 'cwdTest');
			const PROGRAM = path.join(WD, 'cwdTest', 'main.go');

			const config = {
				name: 'Launch',
				type: 'go',
				request: 'launch',
				mode: 'auto',
				program: PROGRAM,
				noDebug: true
			};
			const debugConfig = debugConfigProvider.resolveDebugConfiguration(undefined, config);

			return Promise.all([
				dc.launch(debugConfig),
				dc.waitForEvent('output').then((event) => {
					assert.strictEqual(event.body.output, 'Goodbye, World.\n');
				})
			]);
		});

	});

	suite('remote attach', () => {
		let childProcess: ChildProcess;
		let server: number;
		let debugConfig: DebugConfiguration;
		setup(async () => {
			server = await getPort();
			remoteAttachConfig.port = await getPort();
			debugConfig = debugConfigProvider.resolveDebugConfiguration(undefined, remoteAttachConfig);
		});

		teardown(async () => {
			await dc.disconnectRequest({restart: false});
			await killProcessTree(childProcess);
			// Wait 2 seconds for the process to be killed.
			await new Promise((resolve) => setTimeout(resolve, 2_000));
		});

		test('can connect and initialize using external dlv --headless --accept-multiclient=true --continue=true',
			async () => {
			childProcess = await setUpRemoteProgram(remoteAttachConfig.port, server, true, true);

			await setUpRemoteAttach(debugConfig);
		});

		test('can connect and initialize using external dlv --headless --accept-multiclient=false --continue=false',
			async () => {
			childProcess = await setUpRemoteProgram(remoteAttachConfig.port, server, false, false);

			await setUpRemoteAttach(debugConfig);
		});

		test('can connect and initialize using external dlv --headless --accept-multiclient=true --continue=false',
			async () => {
			childProcess = await setUpRemoteProgram(remoteAttachConfig.port, server, true, false);

			await setUpRemoteAttach(debugConfig);
		});
	});

	// The file paths returned from delve use '/' not the native path
	// separator, so we can replace any instances of '\' with '/', which
	// allows the hitBreakpoint check to match.
	const getBreakpointLocation =  (FILE: string, LINE: number, useBackSlash = true) => {
		return {path: useBackSlash ? FILE.replace(/\\/g, '/') : FILE, line: LINE };
	};

	suite('setBreakpoints', () => {
		let server: number;
		let remoteAttachDebugConfig: DebugConfiguration;
		setup(async () => {
			server = await getPort();
			remoteAttachConfig.port = await getPort();
			remoteAttachDebugConfig = debugConfigProvider.resolveDebugConfiguration(undefined, remoteAttachConfig);
		});

		test('should stop on a breakpoint', () => {

			const PROGRAM = path.join(DATA_ROOT, 'baseTest');

			const FILE = path.join(DATA_ROOT, 'baseTest', 'test.go');
			const BREAKPOINT_LINE = 11;

			const config = {
				name: 'Launch',
				type: 'go',
				request: 'launch',
				mode: 'auto',
				program: PROGRAM,
			};
			const debugConfig = debugConfigProvider.resolveDebugConfiguration(undefined, config);

			return dc.hitBreakpoint(debugConfig, getBreakpointLocation(FILE, BREAKPOINT_LINE));
		});

		test('should stop on a breakpoint in test file', () => {

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
			const debugConfig = debugConfigProvider.resolveDebugConfiguration(undefined, config);

			return dc.hitBreakpoint(debugConfig, getBreakpointLocation(FILE, BREAKPOINT_LINE));
		});

		test('stopped for a breakpoint set during initialization (remote attach)', async () => {
			const FILE = path.join(DATA_ROOT, 'helloWorldServer', 'main.go');
			const BREAKPOINT_LINE = 29;
			const remoteProgram = await setUpRemoteProgram(remoteAttachConfig.port, server);

			const breakpointLocation = getBreakpointLocation(FILE, BREAKPOINT_LINE, false);

			// Setup attach with a breakpoint.
			await setUpRemoteAttach(remoteAttachDebugConfig, [breakpointLocation]);

			// Calls the helloworld server to make the breakpoint hit.
			await waitForBreakpoint(
				() => http.get(`http://localhost:${server}`).on('error', (data) => console.log(data)),
				breakpointLocation);

			await dc.disconnectRequest({restart: false});
			await killProcessTree(remoteProgram);
			await new Promise((resolve) => setTimeout(resolve, 2_000));
		});

		test('stopped for a breakpoint set after initialization (remote attach)', async () => {
			this.timeout(30_000);
			const FILE = path.join(DATA_ROOT, 'helloWorldServer', 'main.go');
			const BREAKPOINT_LINE = 29;
			const remoteProgram = await setUpRemoteProgram(remoteAttachConfig.port, server);

			// Setup attach without a breakpoint.
			await setUpRemoteAttach(remoteAttachDebugConfig);

			// Now sets a breakpoint.
			const breakpointLocation = getBreakpointLocation(FILE, BREAKPOINT_LINE, false);
			const breakpointsResult = await dc.setBreakpointsRequest(
				{source: {path: breakpointLocation.path}, breakpoints: [breakpointLocation]});
			assert.ok(breakpointsResult.success && breakpointsResult.body.breakpoints[0].verified);

			// Calls the helloworld server to make the breakpoint hit.
			await waitForBreakpoint(
				() => http.get(`http://localhost:${server}`).on('error', (data) => console.log(data)),
				breakpointLocation);

			await dc.disconnectRequest({restart: false});
			await killProcessTree(remoteProgram);
			await new Promise((resolve) => setTimeout(resolve, 2_000));
		});

		test('stopped for a breakpoint set during initialization (remote attach)', async () => {
			const FILE = path.join(DATA_ROOT, 'helloWorldServer', 'main.go');
			const BREAKPOINT_LINE = 29;
			const remoteProgram = await setUpRemoteProgram(remoteAttachConfig.port, server);

			const breakpointLocation = getBreakpointLocation(FILE, BREAKPOINT_LINE, false);

			// Setup attach with a breakpoint.
			await setUpRemoteAttach(remoteAttachDebugConfig, [breakpointLocation]);

			// Calls the helloworld server to make the breakpoint hit.
			await waitForBreakpoint(
				() => http.get(`http://localhost:${server}`).on('error', (data) => console.log(data)),
				breakpointLocation);

			await dc.disconnectRequest({restart: false});
			await killProcessTree(remoteProgram);
			await new Promise((resolve) => setTimeout(resolve, 2_000));
		});

	});

	suite('conditionalBreakpoints', () => {
		test('should stop on conditional breakpoint', () => {

			const PROGRAM = path.join(DATA_ROOT, 'condbp');
			const FILE = path.join(DATA_ROOT, 'condbp', 'condbp.go');
			const BREAKPOINT_LINE = 7;
			const location = getBreakpointLocation(FILE, BREAKPOINT_LINE);

			const config = {
				name: 'Launch',
				type: 'go',
				request: 'launch',
				mode: 'auto',
				program: PROGRAM,
			};
			const debugConfig = debugConfigProvider.resolveDebugConfiguration(undefined, config);
			return Promise.all([

				dc.waitForEvent('initialized').then(() => {
					return dc.setBreakpointsRequest({
						lines: [location.line],
						breakpoints: [{ line: location.line, condition: 'i == 2' }],
						source: { path: location.path }
					});
				}).then(() => {
					return dc.configurationDoneRequest();
				}),

				dc.launch(debugConfig),

				dc.assertStoppedLocation('breakpoint', location)

			]).then(() =>
				// The program is stopped at the breakpoint, check to make sure 'i == 1'.
				assertVariableValue('i', '2')
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
				mode: 'auto',
				program: PROGRAM,
			};
			const debugConfig = debugConfigProvider.resolveDebugConfiguration(undefined, config);

			return dc.hitBreakpoint(debugConfig, location).then(() =>
				// The program is stopped at the breakpoint, check to make sure 'i == 0'.
				assertVariableValue('i', '0')
			).then(() =>
				// Add a condition to the breakpoint, and make sure it runs until 'i == 2'.
				dc.setBreakpointsRequest({
					lines: [location.line],
					breakpoints: [{ line: location.line, condition: 'i == 2' }],
					source: { path: location.path }
				}).then(() =>
					Promise.all([
						dc.continueRequest({ threadId: 1 }),
						dc.assertStoppedLocation('breakpoint', location)
					]).then(() =>
						// The program is stopped at the breakpoint, check to make sure 'i == 2'.
						assertVariableValue('i', '2')
					)
				)
			);
		});

		test('should remove breakpoint condition', () => {

			const PROGRAM = path.join(DATA_ROOT, 'condbp');
			const FILE = path.join(DATA_ROOT, 'condbp', 'condbp.go');
			const BREAKPOINT_LINE = 7;
			const location = getBreakpointLocation(FILE, BREAKPOINT_LINE);

			const config = {
				name: 'Launch',
				type: 'go',
				request: 'launch',
				mode: 'auto',
				program: PROGRAM,
			};
			const debugConfig = debugConfigProvider.resolveDebugConfiguration(undefined, config);
			return Promise.all([

				dc.waitForEvent('initialized').then(() => {
					return dc.setBreakpointsRequest({
						lines: [location.line],
						breakpoints: [{ line: location.line, condition: 'i == 2' }],
						source: { path: location.path }
					});
				}).then(() => {
					return dc.configurationDoneRequest();
				}),

				dc.launch(debugConfig),

				dc.assertStoppedLocation('breakpoint', location)

			]).then(() =>
				// The program is stopped at the breakpoint, check to make sure 'i == 2'.
				assertVariableValue('i', '2')
			).then(() =>
				// Remove the breakpoint condition, and make sure the program runs until 'i == 3'.
				dc.setBreakpointsRequest({
					lines: [location.line],
					breakpoints: [{ line: location.line }],
					source: { path: location.path }
				}).then(() =>
					Promise.all([
						dc.continueRequest({ threadId: 1 }),
						dc.assertStoppedLocation('breakpoint', location)
					]).then(() =>
						// The program is stopped at the breakpoint, check to make sure 'i == 3'.
						assertVariableValue('i', '3')
					)
				)
			);
		});
	});

	suite('panicBreakpoints', () => {

		test('should stop on panic', () => {

			const PROGRAM_WITH_EXCEPTION = path.join(DATA_ROOT, 'panic');

			const config = {
				name: 'Launch',
				type: 'go',
				request: 'launch',
				mode: 'auto',
				program: PROGRAM_WITH_EXCEPTION,
			};
			const debugConfig = debugConfigProvider.resolveDebugConfiguration(undefined, config);

			return Promise.all([

				dc.waitForEvent('initialized').then(() => {
					return dc.setExceptionBreakpointsRequest({
						filters: ['all']
					});
				}).then(() => {
					return dc.configurationDoneRequest();
				}),

				dc.launch(debugConfig),

				dc.assertStoppedLocation('panic', {})
			]);
		});
	});

	suite('disconnect', () => {
		// The teardown code for the Go Debug Adapter test suite issues a disconnectRequest.
		// In order for these tests to pass, the debug adapter must not fail if a
		// disconnectRequest is sent after it has already disconnected.

		test('disconnect should work for remote attach', async () => {
			this.timeout(30_000);
			const server = await getPort();
			const remoteProgram = await setUpRemoteProgram(remoteAttachConfig.port, server);

			const debugConfig = debugConfigProvider.resolveDebugConfiguration(undefined, remoteAttachConfig);

			// Setup attach.
			await setUpRemoteAttach(debugConfig);

			// Calls the helloworld server to get a response.
			let response = '';
			await new Promise((resolve) => {
				http.get(`http://localhost:${server}`, (res) => {
					res.on('data', (data) => response += data);
					res.on('end', () => resolve());
				});
			});

			await dc.disconnectRequest();
			// Checks that after the disconnect, the helloworld server still works.
			let secondResponse = '';
			await new Promise((resolve) => {
				http.get(`http://localhost:${server}`, (res) => {
					res.on('data', (data) => secondResponse += data);
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
				mode: 'auto',
				program: PROGRAM,
				stopOnEntry: false
			};
			const debugConfig = debugConfigProvider.resolveDebugConfiguration(undefined, config);

			await Promise.all([
				dc.configurationSequence(),
				dc.launch(debugConfig)
			]);

			return Promise.all([
				dc.disconnectRequest({restart: false}),
				dc.waitForEvent('terminated')
			]);
		});

		test('should disconnect with multiple disconnectRequests', async () => {
			const PROGRAM = path.join(DATA_ROOT, 'loop');

			const config = {
				name: 'Launch',
				type: 'go',
				request: 'launch',
				mode: 'auto',
				program: PROGRAM,
				stopOnEntry: false
			};
			const debugConfig = debugConfigProvider.resolveDebugConfiguration(undefined, config);

			await Promise.all([
				dc.configurationSequence(),
				dc.launch(debugConfig)
			]);

			await Promise.all([
				dc.disconnectRequest({restart: false}).then(() =>
					dc.disconnectRequest({restart: false})
				),
				dc.waitForEvent('terminated')
			]);
		});

		test('should disconnect after continue', async () => {
			const PROGRAM = path.join(DATA_ROOT, 'loop');

			const config = {
				name: 'Launch',
				type: 'go',
				request: 'launch',
				mode: 'auto',
				program: PROGRAM,
				stopOnEntry: true
			};
			const debugConfig = debugConfigProvider.resolveDebugConfiguration(undefined, config);

			await Promise.all([
				dc.configurationSequence(),
				dc.launch(debugConfig)
			]);

			const continueResponse = await dc.continueRequest({ threadId: 1 });
			assert.ok(continueResponse.success);

			return Promise.all([
				dc.disconnectRequest({restart: false}),
				dc.waitForEvent('terminated')
			]);
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
				mode: 'auto',
				program: PROGRAM,
				stopOnEntry: false
			};
			const debugConfig = debugConfigProvider.resolveDebugConfiguration(undefined, config);

			await dc.hitBreakpoint(debugConfig, location);

			const nextResponse = await dc.nextRequest({ threadId: 1 });
			assert.ok(nextResponse.success);

			return Promise.all([
				dc.disconnectRequest({restart: false}),
				dc.waitForEvent('terminated')
			]);
		});

		test('should disconnect while paused on pause', async () => {
			const PROGRAM = path.join(DATA_ROOT, 'loop');

			const config = {
				name: 'Launch',
				type: 'go',
				request: 'launch',
				mode: 'auto',
				program: PROGRAM,
			};
			const debugConfig = debugConfigProvider.resolveDebugConfiguration(undefined, config);

			await Promise.all([
				dc.configurationSequence(),
				dc.launch(debugConfig)
			]);

			const pauseResponse = await dc.pauseRequest({threadId: 1});
			assert.ok(pauseResponse.success);

			return Promise.all([
				dc.disconnectRequest({restart: false}),
				dc.waitForEvent('terminated'),
			]);
		});

		test('should disconnect while paused on breakpoint', async () => {
			const PROGRAM = path.join(DATA_ROOT, 'loop');
			const FILE = path.join(PROGRAM, 'loop.go');
			const BREAKPOINT_LINE = 5;

			const config = {
				name: 'Launch',
				type: 'go',
				request: 'launch',
				mode: 'auto',
				program: PROGRAM,
			};
			const debugConfig = debugConfigProvider.resolveDebugConfiguration(undefined, config);

			await dc.hitBreakpoint(debugConfig, { path: FILE, line: BREAKPOINT_LINE } );

			return Promise.all([
				dc.disconnectRequest({restart: false}),
				dc.waitForEvent('terminated')
			]);
		});

		test('should disconnect while paused on entry', async () => {
			const PROGRAM = path.join(DATA_ROOT, 'loop');

			const config = {
				name: 'Launch',
				type: 'go',
				request: 'launch',
				mode: 'auto',
				program: PROGRAM,
				stopOnEntry: true
			};
			const debugConfig = debugConfigProvider.resolveDebugConfiguration(undefined, config);

			await Promise.all([
				dc.configurationSequence(),
				dc.launch(debugConfig)
			]);

			return Promise.all([
				dc.disconnectRequest({restart: false}),
				dc.waitForEvent('terminated')
			]);
		});

		test('should disconnect while paused on next', async () => {
			const PROGRAM = path.join(DATA_ROOT, 'loop');

			const config = {
				name: 'Launch',
				type: 'go',
				request: 'launch',
				mode: 'auto',
				program: PROGRAM,
				stopOnEntry: true
			};
			const debugConfig = debugConfigProvider.resolveDebugConfiguration(undefined, config);

			await Promise.all([
				dc.configurationSequence(),
				dc.launch(debugConfig)
			]);

			const nextResponse = await dc.nextRequest({ threadId: 1 });
			assert.ok(nextResponse.success);

			return Promise.all([
				dc.disconnectRequest({restart: false}),
				dc.waitForEvent('terminated')
			]);
		});
	});
});
