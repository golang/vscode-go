/*---------------------------------------------------------
 * Copyright 2021 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/
import assert = require('assert');
import path = require('path');
import sinon = require('sinon');
import { TextDocument, TestItem, TestItemCollection, TextDocumentChangeEvent, workspace, Uri } from 'vscode';
import { GoTestExplorer } from '../../src/goTest/explore';
import { MockTestController, MockTestWorkspace } from '../mocks/MockTest';
import { forceDidOpenTextDocument, getSymbols_Regex, populateModulePathCache } from './goTest.utils';
import { MockExtensionContext } from '../mocks/MockContext';
import { MockMemento } from '../mocks/MockMemento';
import * as config from '../../src/config';
import { GoTestResolver } from '../../src/goTest/resolve';
import * as testUtils from '../../src/testUtils';
import { GoTest } from '../../src/goTest/utils';

type Files = Record<string, string | { contents: string; language: string }>;

interface TestCase {
	workspace: string[];
	files: Files;
}

function newExplorer<T extends GoTestExplorer>(
	folders: string[],
	files: Files,
	ctor: new (...args: ConstructorParameters<typeof GoTestExplorer>) => T
) {
	const ws = MockTestWorkspace.from(folders, files);
	const ctrl = new MockTestController();
	const expl = new ctor({}, ws, ctrl, new MockMemento(), getSymbols_Regex);
	populateModulePathCache(ws);
	return { ctrl, expl, ws };
}

function assertTestItems(items: TestItemCollection, expect: string[]) {
	const actual: string[] = [];
	function walk(items: TestItemCollection) {
		items.forEach((item) => {
			actual.push(item.id);
			walk(item.children);
		});
	}
	walk(items);
	assert.deepStrictEqual(actual, expect);
}

async function forceResolve(resolver: GoTestResolver, item?: TestItem) {
	await resolver.resolve(item);
	const items: TestItem[] = [];
	(item?.children || resolver.items).forEach((x) => items.push(x));
	await Promise.all(items.map((x) => forceResolve(resolver, x)));
}

suite('Go Test Explorer', () => {
	suite('Document opened', () => {
		class DUT extends GoTestExplorer {
			async _didOpen(doc: TextDocument) {
				await this.didOpenTextDocument(doc);
			}

			async _didCreate(doc: TextDocument) {
				await this.didCreateFile(doc.uri);
			}
		}

		interface TC extends TestCase {
			uri: string;
			expectCreate: string[];
			expectOpen: string[];
		}

		const cases: Record<string, TC> = {
			'In workspace': {
				workspace: ['/src/proj'],
				files: {
					'/src/proj/go.mod': 'module test',
					'/src/proj/foo_test.go': 'package main\nfunc TestFoo(*testing.T) {}',
					'/src/proj/bar_test.go': 'package main\nfunc TestBar(*testing.T) {}',
					'/src/proj/baz/main_test.go': 'package main\nfunc TestBaz(*testing.T) {}'
				},
				uri: 'file:///src/proj/foo_test.go',
				expectCreate: ['file:///src/proj?module', 'file:///src/proj/foo_test.go?file'],
				expectOpen: [
					'file:///src/proj?module',
					'file:///src/proj/foo_test.go?file',
					'file:///src/proj/foo_test.go?test#TestFoo'
				]
			},
			'Outside workspace': {
				workspace: [],
				files: {
					'/src/proj/go.mod': 'module test',
					'/src/proj/foo_test.go': 'package main\nfunc TestFoo(*testing.T) {}'
				},
				uri: 'file:///src/proj/foo_test.go',
				expectCreate: ['file:///src/proj?module', 'file:///src/proj/foo_test.go?file'],
				expectOpen: [
					'file:///src/proj?module',
					'file:///src/proj/foo_test.go?file',
					'file:///src/proj/foo_test.go?test#TestFoo'
				]
			}
		};

		for (const name in cases) {
			test(name, async () => {
				const { workspace, files, uri: uri, expectCreate: expectCreate, expectOpen: expectOpen } = cases[name];
				const { ctrl, expl, ws } = newExplorer(workspace, files, DUT);

				const doc = ws.fs.files.get(uri);
				assert(doc);

				await expl._didCreate(doc);
				assertTestItems(ctrl.items, expectCreate);

				await expl._didOpen(doc);
				assertTestItems(ctrl.items, expectOpen);
			});
		}
	});

	suite('Document edited', async () => {
		class DUT extends GoTestExplorer {
			async _didOpen(doc: TextDocument) {
				await this.didOpenTextDocument(doc);
			}

			async _didChange(e: TextDocumentChangeEvent) {
				await this.didChangeTextDocument(e);
			}
		}

		interface TC extends TestCase {
			open: string;
			changes: [string, string][];
			expect: {
				before: string[];
				after: string[];
			};
		}

		const cases: Record<string, TC> = {
			'Add test': {
				workspace: ['/src/proj'],
				files: {
					'/src/proj/go.mod': 'module test',
					'/src/proj/foo_test.go': 'package main'
				},
				open: 'file:///src/proj/foo_test.go',
				changes: [['file:///src/proj/foo_test.go', 'package main\nfunc TestFoo(*testing.T) {}']],
				expect: {
					before: ['file:///src/proj?module'],
					after: [
						'file:///src/proj?module',
						'file:///src/proj/foo_test.go?file',
						'file:///src/proj/foo_test.go?test#TestFoo'
					]
				}
			},
			'Remove test': {
				workspace: ['/src/proj'],
				files: {
					'/src/proj/go.mod': 'module test',
					'/src/proj/foo_test.go': 'package main\nfunc TestFoo(*testing.T) {}'
				},
				open: 'file:///src/proj/foo_test.go',
				changes: [['file:///src/proj/foo_test.go', 'package main']],
				expect: {
					before: [
						'file:///src/proj?module',
						'file:///src/proj/foo_test.go?file',
						'file:///src/proj/foo_test.go?test#TestFoo'
					],
					after: ['file:///src/proj?module']
				}
			}
		};

		for (const name in cases) {
			test(name, async () => {
				const { workspace, files, open, changes, expect } = cases[name];
				const { ctrl, expl, ws } = newExplorer(workspace, files, DUT);

				const doc = ws.fs.files.get(open);
				assert(doc);
				await expl._didOpen(doc);

				assertTestItems(ctrl.items, expect.before);

				for (const [file, contents] of changes) {
					const doc = ws.fs.files.get(file);
					assert(doc);
					doc.contents = contents;
					await expl._didChange({
						document: doc,
						contentChanges: [],
						reason: undefined
					});
				}

				assertTestItems(ctrl.items, expect.after);
			});
		}
	});

	suite('stretchr', () => {
		const fixtureDir = path.join(__dirname, '..', '..', '..', 'test', 'testdata', 'stretchrTestSuite');
		const ctx = MockExtensionContext.new();
		let document: TextDocument;
		let testExplorer: GoTestExplorer;

		suiteSetup(async () => {
			testExplorer = GoTestExplorer.setup(ctx, {});

			const uri = Uri.file(path.join(fixtureDir, 'suite_test.go'));
			document = await forceDidOpenTextDocument(workspace, testExplorer, uri);
		});

		suiteTeardown(() => {
			ctx.teardown();
		});

		test('discovery', () => {
			const tests = testExplorer.resolver.find(document.uri).map((x) => x.id);
			assert.deepStrictEqual(tests.sort(), [
				document.uri.with({ query: 'file' }).toString(),
				document.uri.with({ query: 'test', fragment: '(*ExampleTestSuite).TestExample' }).toString(),
				document.uri.with({ query: 'test', fragment: 'TestExampleTestSuite' }).toString()
			]);
		});
	});

	suite('settings', () => {
		const sandbox = sinon.createSandbox();

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		let goConfig: any;

		setup(() => {
			goConfig = Object.create(config.getGoConfig());
			sandbox.stub(config, 'getGoConfig').returns(goConfig);
		});

		teardown(() => {
			sandbox.restore();
		});

		suite('packageDisplayMode', () => {
			let resolver: GoTestResolver;

			setup(() => {
				const { expl } = newExplorer(
					['/src/proj'],
					{
						'/src/proj/go.mod': 'module test',
						'/src/proj/pkg/main_test.go': 'package main\nfunc TestFoo(t *testing.T) {}',
						'/src/proj/pkg/sub/main_test.go': 'package main\nfunc TestBar(t *testing.T) {}'
					},
					GoTestExplorer
				);
				resolver = expl.resolver;
			});

			test('flat', async () => {
				// Expect:
				// - module
				//   - package pkg
				//   - package pkg/sub

				sinon.stub(goConfig, 'get').withArgs('testExplorer.packageDisplayMode').returns('flat');
				await forceResolve(resolver);

				const mod = resolver.items.get('file:///src/proj?module');
				assert(mod, 'Module is missing or is not at the root');

				const pkg = mod.children.get('file:///src/proj/pkg?package');
				assert(pkg, 'Package pkg is missing or not a child of the module');

				const sub = mod.children.get('file:///src/proj/pkg/sub?package');
				assert(sub, 'Package pkg/sub is missing or not a child of the module');
			});

			test('nested', async () => {
				// Expect:
				// - module
				//   - package pkg
				//     - package pkg/sub

				sinon.stub(goConfig, 'get').withArgs('testExplorer.packageDisplayMode').returns('nested');
				await forceResolve(resolver);

				const mod = resolver.items.get('file:///src/proj?module');
				assert(mod, 'Module is missing or is not at the root');

				const pkg = mod.children.get('file:///src/proj/pkg?package');
				assert(pkg, 'Package pkg is missing or not a child of the module');

				const sub = pkg.children.get('file:///src/proj/pkg/sub?package');
				assert(sub, 'Package pkg/sub is missing or not a child of package pkg');
			});
		});

		suite('alwaysRunBenchmarks', () => {
			let explorer: GoTestExplorer;
			let runStub: sinon.SinonStub<[testUtils.TestConfig], Promise<boolean>>;

			const expectedTests = [
				'file:///src/proj/pkg/main_test.go?file',
				'file:///src/proj/pkg/main_test.go?test#TestFoo',
				'file:///src/proj/pkg/main_test.go?benchmark#BenchmarkBar'
			];

			setup(() => {
				runStub = sandbox.stub(testUtils, 'goTest');
				runStub.callsFake(() => Promise.resolve(true));

				explorer = newExplorer(
					['/src/proj'],
					{
						'/src/proj/go.mod': 'module test',
						'/src/proj/pkg/main_test.go': `
							package main

							func TestFoo(t *testing.T) {}
							func BenchmarkBar(b *testing.B) {}
						`
					},
					GoTestExplorer
				).expl;
			});

			test('false', async () => {
				// Running the file should only run the test

				sinon.stub(goConfig, 'get').withArgs('testExplorer.alwaysRunBenchmarks').returns(false);
				await forceResolve(explorer.resolver);

				const tests = explorer.resolver.find(Uri.parse('file:///src/proj/pkg/main_test.go'));
				assert.deepStrictEqual(
					tests.map((x) => x.id),
					expectedTests
				);

				await explorer.runner.run({
					include: [tests[0]],
					exclude: undefined,
					profile: undefined
				});
				assert.strictEqual(runStub.callCount, 1, 'Expected goTest to be called once');
				assert.deepStrictEqual(runStub.lastCall.args[0].functions, ['TestFoo']);
			});

			test('true', async () => {
				// Running the file should run the test and the benchmark

				sinon.stub(goConfig, 'get').withArgs('testExplorer.alwaysRunBenchmarks').returns(true);
				await forceResolve(explorer.resolver);

				const tests = explorer.resolver.find(Uri.parse('file:///src/proj/pkg/main_test.go'));
				assert.deepStrictEqual(
					tests.map((x) => x.id),
					expectedTests
				);

				await explorer.runner.run({
					include: [tests[0]],
					exclude: undefined,
					profile: undefined
				});
				assert.strictEqual(runStub.callCount, 2, 'Expected goTest to be called twice');
				assert.deepStrictEqual(runStub.firstCall.args[0].functions, ['TestFoo']);
				assert.deepStrictEqual(runStub.secondCall.args[0].functions, ['BenchmarkBar']);
			});
		});

		suite('showDynamicSubtestsInEditor', () => {
			let explorer: GoTestExplorer;
			let runStub: sinon.SinonStub<[testUtils.TestConfig], Promise<boolean>>;

			setup(() => {
				runStub = sandbox.stub(testUtils, 'goTest');
				runStub.callsFake((cfg) => {
					// Trigger creation of dynamic subtest
					cfg.goTestOutputConsumer?.({
						Test: 'TestFoo/Bar',
						Action: 'run'
					});
					return Promise.resolve(true);
				});

				explorer = newExplorer(
					['/src/proj'],
					{
						'/src/proj/go.mod': 'module test',
						'/src/proj/main_test.go': 'package main\nfunc TestFoo(t *testing.T) {}'
					},
					GoTestExplorer
				).expl;
			});

			test('false', async () => {
				// Dynamic subtests should have no location

				sinon.stub(goConfig, 'get').withArgs('testExplorer.showDynamicSubtestsInEditor').returns(false);
				await forceResolve(explorer.resolver);

				const test = explorer.resolver
					.find(Uri.parse('file:///src/proj/main_test.go'))
					.filter((x) => GoTest.parseId(x.id).name)[0];
				assert(test, 'Could not find test');

				await explorer.runner.run({
					include: [test],
					exclude: undefined,
					profile: undefined
				});
				assert.strictEqual(runStub.callCount, 1, 'Expected goTest to be called once');

				const subTest = test.children.get('file:///src/proj/main_test.go?test#TestFoo%2FBar');
				assert(subTest, 'Could not find subtest');

				assert(!subTest.range, 'Subtest should not have a range');
			});

			test('true', async () => {
				// Dynamic subtests should have the same location as their parents

				sinon.stub(goConfig, 'get').withArgs('testExplorer.showDynamicSubtestsInEditor').returns(true);
				await forceResolve(explorer.resolver);

				const test = explorer.resolver
					.find(Uri.parse('file:///src/proj/main_test.go'))
					.filter((x) => GoTest.parseId(x.id).name)[0];
				assert(test, 'Could not find test');

				await explorer.runner.run({
					include: [test],
					exclude: undefined,
					profile: undefined
				});
				assert.strictEqual(runStub.callCount, 1, 'Expected goTest to be called once');

				const subTest = test.children.get('file:///src/proj/main_test.go?test#TestFoo%2FBar');
				assert(subTest, 'Could not find subtest');

				assert.deepStrictEqual(subTest.range, test.range, 'Subtest range should match parent range');
			});
		});
	});
});
