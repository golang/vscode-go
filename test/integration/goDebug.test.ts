import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as sinon from 'sinon';
import {
	Delve,
	escapeGoModPath,
	GoDebugSession,
	PackageBuildInfo,
	RemoteSourcesAndPackages,
} from '../../src/debugAdapter/goDebug';

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
