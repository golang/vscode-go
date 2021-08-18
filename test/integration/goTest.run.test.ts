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
	const sandbox = sinon.createSandbox();
	const fixtureDir = path.join(__dirname, '..', '..', '..', 'test', 'testdata', 'subTest');

	let testExplorer: GoTestExplorer;
	let runSpy: sinon.SinonSpy<[testUtils.TestConfig], Promise<boolean>>;

	setup(() => {
		runSpy = sinon.spy(testUtils, 'goTest');
	});

	teardown(() => {
		sandbox.restore();
	});

	suite('Subtest', () => {
		const ctx = MockExtensionContext.new();
		let uri: Uri;

		suiteSetup(async () => {
			testExplorer = GoTestExplorer.setup(ctx);

			uri = Uri.file(path.join(fixtureDir, 'sub_test.go'));
			await forceDidOpenTextDocument(workspace, testExplorer, uri);
		});

		suiteTeardown(() => {
			ctx.teardown();
		});

		test('discover and run', async () => {
			// Locate TestMain and TestOther
			const tests = testExplorer.resolver.find(uri).filter((x) => GoTest.parseId(x.id).kind === 'test');
			tests.sort((a, b) => a.label.localeCompare(b.label));
			assert.deepStrictEqual(
				tests.map((x) => x.label),
				['TestMain', 'TestOther']
			);
			const [tMain, tOther] = tests;

			// Run TestMain
			await testExplorer.runner.run({ include: [tMain] });
			assert(runSpy.calledOnce, 'goTest was not called');

			// Verify TestMain was run
			let call = runSpy.lastCall.args[0];
			assert.strictEqual(call.dir, fixtureDir);
			assert.deepStrictEqual(call.functions, ['TestMain']);
			runSpy.resetHistory();

			// Locate subtest
			const tSub = tMain.children.get(GoTest.id(uri, 'test', 'TestMain/Sub'));
			assert(tSub, 'Subtest was not created');

			// Run subtest by itself
			await testExplorer.runner.run({ include: [tSub] });
			assert(runSpy.calledOnce, 'goTest was not called');

			// Verify TestMain/Sub was run
			call = runSpy.lastCall.args[0];
			assert.strictEqual(call.dir, fixtureDir);
			assert.deepStrictEqual(call.functions, ['TestMain/Sub']);
			runSpy.resetHistory();

			// Ensure the subtest hasn't been disposed
			assert(tSub.parent, 'Subtest was disposed');

			// Attempt to run subtest and other test - should not work
			await testExplorer.runner.run({ include: [tSub, tOther] });
			assert(!runSpy.called, 'goTest was called');
		});
	});
});
