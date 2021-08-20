/*---------------------------------------------------------
 * Copyright 2021 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/
import assert = require('assert');
import path = require('path');
import fs = require('fs-extra');
import { TextDocument, TestItemCollection, TextDocumentChangeEvent, ExtensionContext, workspace, Uri } from 'vscode';
import { GoTestExplorer } from '../../src/goTest/explore';
import { getCurrentGoPath } from '../../src/util';
import { MockTestController, MockTestWorkspace } from '../mocks/MockTest';
import { getSymbols_Regex, populateModulePathCache } from './goTest.utils';

type Files = Record<string, string | { contents: string; language: string }>;

interface TestCase {
	workspace: string[];
	files: Files;
}

function setupCtor<T extends GoTestExplorer>(
	folders: string[],
	files: Files,
	ctor: new (...args: ConstructorParameters<typeof GoTestExplorer>) => T
) {
	const ws = MockTestWorkspace.from(folders, files);
	const ctrl = new MockTestController();
	const expl = new ctor(ws, ctrl, getSymbols_Regex);
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

suite('Go Test Explorer', () => {
	suite('Document opened', () => {
		class DUT extends GoTestExplorer {
			async _didOpen(doc: TextDocument) {
				await this.didOpenTextDocument(doc);
			}
		}

		interface TC extends TestCase {
			open: string;
			expect: string[];
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
				open: 'file:///src/proj/foo_test.go',
				expect: [
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
				open: 'file:///src/proj/foo_test.go',
				expect: [
					'file:///src/proj?module',
					'file:///src/proj/foo_test.go?file',
					'file:///src/proj/foo_test.go?test#TestFoo'
				]
			}
		};

		for (const name in cases) {
			test(name, async () => {
				const { workspace, files, open, expect } = cases[name];
				const { ctrl, expl, ws } = setupCtor(workspace, files, DUT);

				await expl._didOpen(ws.fs.files.get(open));

				assertTestItems(ctrl.items, expect);
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
				const { ctrl, expl, ws } = setupCtor(workspace, files, DUT);

				await expl._didOpen(ws.fs.files.get(open));

				assertTestItems(ctrl.items, expect.before);

				for (const [file, contents] of changes) {
					const doc = ws.fs.files.get(file);
					doc.contents = contents;
					await expl._didChange({
						document: doc,
						contentChanges: []
					});
				}

				assertTestItems(ctrl.items, expect.after);
			});
		}
	});

	suite('stretchr', () => {
		let gopath: string;
		let repoPath: string;
		let fixturePath: string;
		let fixtureSourcePath: string;
		let document: TextDocument;
		let testExplorer: GoTestExplorer;

		const ctx: Partial<ExtensionContext> = {
			subscriptions: []
		};

		suiteSetup(async () => {
			gopath = getCurrentGoPath();
			if (!gopath) {
				assert.fail('Cannot run tests without a configured GOPATH');
			}
			console.log(`Using GOPATH: ${gopath}`);

			// Set up the test fixtures.
			repoPath = path.join(gopath, 'src', 'test');
			fixturePath = path.join(repoPath, 'testfixture');
			fixtureSourcePath = path.join(__dirname, '..', '..', '..', 'test', 'testdata', 'stretchrTestSuite');

			await fs.remove(repoPath);
			await fs.copy(fixtureSourcePath, fixturePath, {
				recursive: true
			});

			testExplorer = GoTestExplorer.setup(ctx as ExtensionContext);

			const uri = Uri.file(path.join(fixturePath, 'suite_test.go'));
			document = await workspace.openTextDocument(uri);

			// Force didOpenTextDocument to fire. Without this, the test may run
			// before the event is handled.
			//
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			await (testExplorer as any).didOpenTextDocument(document);
		});

		suiteTeardown(() => {
			fs.removeSync(repoPath);
			ctx.subscriptions.forEach((x) => x.dispose());
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
});
