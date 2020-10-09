import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as sinon from 'sinon';
import {DebugClient} from 'vscode-debugadapter-testsupport';
import { ILocation } from 'vscode-debugadapter-testsupport/lib/debugClient';
import {DebugProtocol} from 'vscode-debugprotocol';
import {
	Delve,
	escapeGoModPath,
	GoDebugSession,
	PackageBuildInfo,
	RemoteSourcesAndPackages,
} from '../../src/debugAdapter/goDebug';
import { GoDebugConfigurationProvider } from '../../src/goDebugConfiguration';

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
	this.timeout(50000);

	const debugConfigProvider = new GoDebugConfigurationProvider();
	const DEBUG_ADAPTER = path.join('.', 'out', 'src', 'debugAdapter', 'goDebug.js');

	const PROJECT_ROOT = path.normalize(path.join(__dirname, '..', '..', '..'));
	const DATA_ROOT = path.join(PROJECT_ROOT, 'test', 'fixtures');

	let dc: DebugClient;

	setup( () => {
		dc = new DebugClient('node', path.join(PROJECT_ROOT, DEBUG_ADAPTER), 'go');

		// Launching delve may take longer than the default timeout of 5000.
		dc.defaultTimeout = 20000;

		// To connect to a running debug server for debugging the tests, specify PORT.
		return dc.start();
	});

	teardown( () =>  dc.stop() );

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
				assert.strictEqual(response.body.supportsConfigurationDoneRequest, true);
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

	// The file paths returned from delve use '/' not the native path
	// separator, so we can replace any instances of '\' with '/', which
	// allows the hitBreakpoint check to match.
	const getBreakpointLocation =  (FILE: string, LINE: number) => {
		return {path: FILE.replace(/\\/g, '/'), line: LINE };
	};

	suite('setBreakpoints', () => {

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

			return dc.hitBreakpoint(debugConfig, getBreakpointLocation(FILE, BREAKPOINT_LINE) );
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

			return dc.hitBreakpoint(debugConfig, getBreakpointLocation(FILE, BREAKPOINT_LINE) );
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
						filters: [ 'all' ]
					});
				}).then(() => {
					return dc.configurationDoneRequest();
				}),

				dc.launch(debugConfig),

				dc.assertStoppedLocation('panic', {} )
			]);
		});
	});
});
