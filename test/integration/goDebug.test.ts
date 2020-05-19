import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import {IMock, Mock} from 'typemoq';
import { Delve, escapeGoModPath, GoDebugSession,
	PackageBuildInfo, RemoteSourcesAndPackages } from '../../src/debugAdapter/goDebug';

suite('Path Manipulation Tests', () => {
	test('escapeGoModPath works', () => {
		assert.strictEqual(escapeGoModPath('BurnSushi/test.go'), '!burn!sushi/test.go');
	});
});

suite('GoDebugSession Tests', () => {
	const workspaceFolder = '/usr/workspacefolder';

	let goDebugSession: GoDebugSession;
	let remoteSourcesAndPackagesMock: IMock<RemoteSourcesAndPackages>;
	let fileSystemMock: IMock<typeof fs>;
	let delve: IMock<Delve>;
	setup(() => {
		remoteSourcesAndPackagesMock = Mock.ofType<RemoteSourcesAndPackages>();
		fileSystemMock = Mock.ofType<typeof fs>();
		delve = Mock.ofType<Delve>();
		delve.setup((mock) => mock.program).returns(() => workspaceFolder);
		goDebugSession = new GoDebugSession(true, false, fileSystemMock.object);
		goDebugSession['delve'] = delve.object;
		goDebugSession['remoteSourcesAndPackages'] = remoteSourcesAndPackagesMock.object;
	});

	test('inferRemotePathFromLocalPath works', () => {
		const sourceFileMapping = new Map<string, string[]>();
		sourceFileMapping.set('main.go', ['/app/hello-world/main.go', '/app/main.go']);
		sourceFileMapping.set('blah.go', ['/app/blah.go']);

		remoteSourcesAndPackagesMock.setup((mock) => mock.remoteSourceFilesNameGrouping)
			.returns(() => (sourceFileMapping));

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

		process.env.GOPATH = '/usr/go';
		const localPath = path.join(workspaceFolder, 'hello-world/morestrings/morestrings.go');
		fileSystemMock.setup((mock) => mock.existsSync(localPath))
			.returns(() => true);

		remoteSourcesAndPackagesMock.setup((mock) => mock.remotePackagesBuildInfo)
			.returns(() => [helloPackage, testPackage]);

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

		process.env.GOPATH = '/usr/go';
		const localPath = path.join(process.env.GOPATH, 'pkg/mod/!foo!bar/test@v1.0.2/test.go');
		fileSystemMock.setup((mock) => mock.existsSync(localPath))
			.returns(() => true);

		remoteSourcesAndPackagesMock.setup((mock) => mock.remotePackagesBuildInfo)
			.returns(() => [helloPackage, testPackage]);

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

		process.env.GOPATH = '/usr/go';
		const localPath = path.join(process.env.GOPATH, 'pkg/mod/!foo!bar/test@v1.0.2/test.go');
		fileSystemMock.setup((mock) => mock.existsSync(localPath))
			.returns(() => true);

		remoteSourcesAndPackagesMock.setup((mock) => mock.remotePackagesBuildInfo)
			.returns(() => [helloPackage, testPackage]);

		goDebugSession['localPathSeparator'] = '/';
		const inferredLocalPath = goDebugSession['inferLocalPathFromRemoteGoPackage'](remotePath);
		assert.strictEqual(inferredLocalPath, localPath);
	});

	test('inferLocalPathFromRemoteGoPackage works for package in GOPATH/src', () => {
		const remotePath = 'remote/gopath/src/foobar/test@v1.0.2/test.go';
		const helloPackage: PackageBuildInfo = {
			ImportPath: 'hello-world',
			DirectoryPath: '/src/hello-world',
			Files: ['src/hello-world/hello.go', 'src/hello-world/world.go']
		};

		const testPackage: PackageBuildInfo = {
			ImportPath: 'foobar/test',
			DirectoryPath: 'remote/gopath/src/foobar/test@v1.0.2',
			Files: ['remote/gopath/src/foobar/test@v1.0.2/test.go']
		};

		process.env.GOPATH = '/usr/go';
		const localPath = path.join(process.env.GOPATH, 'src', 'foobar/test@v1.0.2/test.go');
		fileSystemMock.setup((mock) => mock.existsSync(localPath))
			.returns(() => true);

		remoteSourcesAndPackagesMock.setup((mock) => mock.remotePackagesBuildInfo)
			.returns(() => [helloPackage, testPackage]);

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

		process.env.GOPATH = '/usr/go';
		const localPath = path.join(process.env.GOPATH, 'src', 'foobar/test@v1.0.2/test.go');
		fileSystemMock.setup((mock) => mock.existsSync(localPath))
			.returns(() => true);

		remoteSourcesAndPackagesMock.setup((mock) => mock.remotePackagesBuildInfo)
			.returns(() => [helloPackage, testPackage]);

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

		process.env.GOROOT = '/usr/go';
		const localPath = path.join(process.env.GOROOT, 'src', 'foobar/test@v1.0.2/test.go');
		fileSystemMock.setup((mock) => mock.existsSync(localPath))
			.returns(() => true);

		remoteSourcesAndPackagesMock.setup((mock) => mock.remotePackagesBuildInfo)
			.returns(() => [helloPackage, testPackage]);

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

		process.env.GOROOT = '/usr/go';
		const localPath = path.join(process.env.GOROOT, 'src', 'foobar/test@v1.0.2/test.go');
		fileSystemMock.setup((mock) => mock.existsSync(localPath))
			.returns(() => true);

		remoteSourcesAndPackagesMock.setup((mock) => mock.remotePackagesBuildInfo)
			.returns(() => [helloPackage, testPackage]);

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
	let delve: IMock<Delve>;
	setup(() => {
		delve = Mock.ofType<Delve>();
		delve.setup((mock) => mock.isApiV1).returns(() => false);
		remoteSourcesAndPackages = new RemoteSourcesAndPackages();
	});

	test('initializeRemotePackagesAndSources retrieves remote packages and sources', async () => {
		delve.setup((mock) => mock.callPromise('ListPackagesBuildInfo', [{IncludeFiles: true}]))
			.returns(() => Promise.resolve({List: [helloPackage, testPackage]}));
		delve.setup((mock) => mock.callPromise('ListSources', [{}]))
			.returns(() => Promise.resolve({Sources: sources}));

		await remoteSourcesAndPackages.initializeRemotePackagesAndSources(delve.object);
		assert.deepEqual(remoteSourcesAndPackages.remoteSourceFiles, sources);
		assert.deepEqual(remoteSourcesAndPackages.remotePackagesBuildInfo, [helloPackage, testPackage]);
	});
});
