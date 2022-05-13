import assert = require('assert');
import path = require('path');
import sinon = require('sinon');
import { Uri, workspace } from 'vscode';
import * as testUtils from '../../src/testUtils';
import { forceDidOpenTextDocument } from './goTest.utils';
import { GoTestExplorer } from '../../src/goTest/explore';
import { MockExtensionContext } from '../mocks/MockContext';
import { GoTest } from '../../src/goTest/utils';

suite('Go Test Runner', () => {
	const fixtureDir = path.join(__dirname, '..', '..', '..', 'test', 'testdata');

	let testExplorer: GoTestExplorer;

	suite('Profile', () => {
		const sandbox = sinon.createSandbox();
		const ctx = MockExtensionContext.new();

		let uri: Uri;
		let stub: sinon.SinonStub<[testUtils.TestConfig], Promise<boolean>>;

		suiteSetup(async () => {
			testExplorer = GoTestExplorer.setup(ctx, {});

			uri = Uri.file(path.join(fixtureDir, 'codelens', 'codelens2_test.go'));
			await forceDidOpenTextDocument(workspace, testExplorer, uri);
		});

		setup(() => {
			stub = sandbox.stub(testUtils, 'goTest');
			stub.callsFake((cfg) => {
				const send = cfg.goTestOutputConsumer;
				if (send && cfg.functions instanceof Array) {
					cfg.functions.forEach((name) => send({ Test: name, Action: 'run' }));
					cfg.functions.forEach((name) => send({ Test: name, Action: 'pass' }));
				}
				return Promise.resolve(true);
			});
		});

		teardown(() => {
			sandbox.restore();
		});

		suiteTeardown(() => {
			ctx.teardown();
		});

		test('creates a profile', async () => {
			const test = Array.from(testExplorer.resolver.allItems).filter((x) => GoTest.parseId(x.id).name)[0];
			assert(test, 'No tests found');

			assert(
				await testExplorer.runner.run({ include: [test] }, null, { kind: 'cpu' }),
				'Failed to execute `go test`'
			);
			assert.strictEqual(stub.callCount, 1, 'expected one call to goTest');
			assert(stub.lastCall.args[0].flags.some((x) => x === '--cpuprofile'));
			assert(testExplorer.profiler.hasProfileFor(test.id), 'Did not create profile for test');
		});

		test('tests are run together when not profiling', async () => {
			const tests = Array.from(testExplorer.resolver.allItems).filter((x) => GoTest.parseId(x.id).name);
			assert(tests, 'No tests found');

			assert(await testExplorer.runner.run({ include: tests }), 'Failed to execute `go test`');
			assert.strictEqual(stub.callCount, 1, 'expected one call to goTest');
			assert.deepStrictEqual(
				stub.lastCall.args[0].functions,
				tests.map((x) => GoTest.parseId(x.id).name)
			);
		});

		test('tests are run individually when profiling', async () => {
			const tests = Array.from(testExplorer.resolver.allItems).filter((x) => GoTest.parseId(x.id).name);
			assert(tests, 'No tests found');

			console.log(`running ${tests.length} tests`);

			assert(
				await testExplorer.runner.run({ include: tests }, null, { kind: 'cpu' }),
				'Failed to execute `go test`'
			);
			console.log('verify we got expected calls');
			const calls = await stub.getCalls();
			assert.strictEqual(calls.length, tests.length, 'expected one call to goTest per test');
			calls.forEach((call, i) =>
				assert.deepStrictEqual(call.args[0].functions, [GoTest.parseId(tests[i].id).name])
			);
			tests.forEach((test) =>
				assert(testExplorer.profiler.hasProfileFor(test.id), `Missing profile for ${test.id}`)
			);
		});
	});

	suite('Subtest', () => {
		const sandbox = sinon.createSandbox();
		const subTestDir = path.join(fixtureDir, 'subTest');
		const ctx = MockExtensionContext.new();

		let uri: Uri;
		let spy: sinon.SinonSpy<[testUtils.TestConfig], Promise<boolean>>;

		suiteSetup(async () => {
			testExplorer = GoTestExplorer.setup(ctx, {});

			uri = Uri.file(path.join(subTestDir, 'sub_test.go'));
			await forceDidOpenTextDocument(workspace, testExplorer, uri);

			spy = sandbox.spy(testUtils, 'goTest');
		});

		suiteTeardown(() => {
			ctx.teardown();
			sandbox.restore();
		});

		test('discover and run', async () => {
			console.log('discover and run');
			// Locate TestMain and TestOther
			const tests = testExplorer.resolver.find(uri).filter((x) => GoTest.parseId(x.id).kind === 'test');
			tests.sort((a, b) => a.label.localeCompare(b.label));
			assert.deepStrictEqual(
				tests.map((x) => x.label),
				['TestMain', 'TestOther']
			);
			const [tMain, tOther] = tests;

			// Run TestMain
			console.log('Run TestMain');
			assert(await testExplorer.runner.run({ include: [tMain] }), 'Failed to execute `go test`');
			assert.strictEqual(spy.callCount, 1, 'expected one call to goTest');

			// Verify TestMain was run
			console.log('Verify TestMain was run');
			let call = spy.lastCall.args[0];
			assert.strictEqual(call.dir, subTestDir);
			assert.deepStrictEqual(call.functions, ['TestMain']);
			spy.resetHistory();

			// Locate subtest
			console.log('Locate subtest');
			const tSub = tMain.children.get(GoTest.id(uri, 'test', 'TestMain/Sub'));
			assert(tSub, 'Subtest was not created');

			console.log('Locate subtests with conflicting names');
			const tSub2 = tMain.children.get(GoTest.id(uri, 'test', 'TestMain/Sub#01'));
			assert(tSub2, 'Subtest #01 was not created');
			const tSub3 = tMain.children.get(GoTest.id(uri, 'test', 'TestMain/Sub#01#01'));
			assert(tSub3, 'Subtest #01#01 was not created');

			// Run subtest by itself
			console.log('Run subtest by itself');
			assert(await testExplorer.runner.run({ include: [tSub] }), 'Failed to execute `go test`');
			assert.strictEqual(spy.callCount, 1, 'expected one call to goTest');

			// Verify TestMain/Sub was run
			console.log('Verify TestMain/Sub was run');
			call = spy.lastCall.args[0];
			assert.strictEqual(call.dir, subTestDir);
			assert.deepStrictEqual(call.functions, ['TestMain/Sub']);
			spy.resetHistory();

			// Ensure the subtest hasn't been disposed
			console.log('Ensure the subtest has not been disposed');
			assert(tSub.parent, 'Subtest was disposed');

			// Attempt to run subtest and other test - should not work
			console.log('Attempt to run subtest and other test');
			assert(await testExplorer.runner.run({ include: [tSub, tOther] }), 'Failed to execute `go test`');
			assert.strictEqual(spy.callCount, 0, 'expected no calls to goTest');
		}).timeout(4000);
	});
});
