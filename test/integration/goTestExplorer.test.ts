import assert = require('assert');
import path = require('path');
import {
	DocumentSymbol,
	FileType,
	TestItem,
	Uri,
	TextDocument,
	SymbolKind,
	Range,
	Position,
	TestItemCollection
} from 'vscode';
import { packagePathToGoModPathMap as pkg2mod } from '../../src/goModules';
import { TestExplorer, testID } from '../../src/goTestExplorer';
import { MockTestController, MockTestItem, MockTestWorkspace } from '../mocks/MockTest';

type Files = Record<string, string | { contents: string; language: string }>;

interface TestCase {
	workspace: string[];
	files: Files;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function symbols(doc: TextDocument, token: unknown): Thenable<DocumentSymbol[]> {
	const syms: DocumentSymbol[] = [];
	const range = new Range(new Position(0, 0), new Position(0, 0));
	doc.getText().replace(/^func (Test|Benchmark|Example)([A-Z]\w+)(\(.*\))/gm, (m, type, name, details) => {
		syms.push(new DocumentSymbol(type + name, details, SymbolKind.Function, range, range));
		return m;
	});
	return Promise.resolve(syms);
}

function rethrow(e: unknown) {
	throw e;
}

function setup(folders: string[], files: Files) {
	const ws = MockTestWorkspace.from(folders, files);
	const ctrl = new MockTestController();
	const expl = new TestExplorer(ctrl, ws, rethrow, symbols);

	// Override TestExplorer.createItem so we can control the TestItem implementation
	expl.createItem = (label: string, uri: Uri, kind: string, name?: string) => {
		const id = testID(uri, kind, name);
		return new MockTestItem(id, label, uri, ctrl);
	};

	function walk(dir: Uri, modpath?: string) {
		const dirs: Uri[] = [];
		for (const [name, type] of ws.fs.dirs.get(dir.toString())) {
			const uri = dir.with({ path: path.join(dir.path, name) });
			if (type === FileType.Directory) {
				dirs.push(uri);
			} else if (name === 'go.mod') {
				modpath = dir.path;
			}
		}
		pkg2mod[dir.path] = modpath || '';
		for (const dir of dirs) {
			walk(dir, modpath);
		}
	}

	// prevent getModFolderPath from actually doing anything;
	for (const pkg in pkg2mod) delete pkg2mod[pkg];
	walk(Uri.file('/'));

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

suite('Test Explorer', () => {
	suite('Items', () => {
		interface TC extends TestCase {
			item?: ([string, string, string] | [string, string, string, string])[];
			expect: string[];
		}

		const cases: Record<string, Record<string, TC>> = {
			Root: {
				'Basic module': {
					workspace: ['/src/proj'],
					files: {
						'/src/proj/go.mod': 'module test',
						'/src/proj/main.go': 'package main'
					},
					expect: ['file:///src/proj?module']
				},
				'Basic workspace': {
					workspace: ['/src/proj'],
					files: {
						'/src/proj/main.go': 'package main'
					},
					expect: ['file:///src/proj?workspace']
				},
				'Module and workspace': {
					workspace: ['/src/proj1', '/src/proj2'],
					files: {
						'/src/proj1/go.mod': 'module test',
						'/src/proj2/main.go': 'package main'
					},
					expect: ['file:///src/proj1?module', 'file:///src/proj2?workspace']
				},
				'Module in workspace': {
					workspace: ['/src/proj'],
					files: {
						'/src/proj/mod/go.mod': 'module test',
						'/src/proj/main.go': 'package main'
					},
					expect: ['file:///src/proj/mod?module', 'file:///src/proj?workspace']
				}
			},
			Module: {
				'Empty': {
					workspace: ['/src/proj'],
					files: {
						'/src/proj/go.mod': 'module test',
						'/src/proj/main.go': 'package main'
					},
					item: [['test', '/src/proj', 'module']],
					expect: []
				},
				'Root package': {
					workspace: ['/src/proj'],
					files: {
						'/src/proj/go.mod': 'module test',
						'/src/proj/main_test.go': 'package main'
					},
					item: [['test', '/src/proj', 'module']],
					expect: ['file:///src/proj/main_test.go?file']
				},
				'Sub packages': {
					workspace: ['/src/proj'],
					files: {
						'/src/proj/go.mod': 'module test',
						'/src/proj/foo/main_test.go': 'package main',
						'/src/proj/bar/main_test.go': 'package main'
					},
					item: [['test', '/src/proj', 'module']],
					expect: ['file:///src/proj/foo?package', 'file:///src/proj/bar?package']
				},
				'Nested packages': {
					workspace: ['/src/proj'],
					files: {
						'/src/proj/go.mod': 'module test',
						'/src/proj/main_test.go': 'package main',
						'/src/proj/foo/main_test.go': 'package main',
						'/src/proj/foo/bar/main_test.go': 'package main'
					},
					item: [['test', '/src/proj', 'module']],
					expect: [
						'file:///src/proj/foo?package',
						'file:///src/proj/foo/bar?package',
						'file:///src/proj/main_test.go?file'
					]
				}
			},
			Package: {
				'Empty': {
					workspace: ['/src/proj'],
					files: {
						'/src/proj/go.mod': 'module test',
						'/src/proj/pkg/main.go': 'package main'
					},
					item: [
						['test', '/src/proj', 'module'],
						['pkg', '/src/proj/pkg', 'package']
					],
					expect: []
				},
				'Flat': {
					workspace: ['/src/proj'],
					files: {
						'/src/proj/go.mod': 'module test',
						'/src/proj/pkg/main_test.go': 'package main',
						'/src/proj/pkg/sub/main_test.go': 'package main'
					},
					item: [
						['test', '/src/proj', 'module'],
						['pkg', '/src/proj/pkg', 'package']
					],
					expect: ['file:///src/proj/pkg/main_test.go?file']
				},
				'Sub package': {
					workspace: ['/src/proj'],
					files: {
						'/src/proj/go.mod': 'module test',
						'/src/proj/pkg/sub/main_test.go': 'package main'
					},
					item: [
						['test', '/src/proj', 'module'],
						['pkg', '/src/proj/pkg', 'package']
					],
					expect: []
				}
			},
			File: {
				'Empty': {
					workspace: ['/src/proj'],
					files: {
						'/src/proj/go.mod': 'module test',
						'/src/proj/main_test.go': 'package main'
					},
					item: [
						['test', '/src/proj', 'module'],
						['main_test.go', '/src/proj/main_test.go', 'file']
					],
					expect: []
				},
				'One of each': {
					workspace: ['/src/proj'],
					files: {
						'/src/proj/go.mod': 'module test',
						'/src/proj/main_test.go': `
							package main

							func TestMain(*testing.M) {}
							func TestFoo(*testing.T) {}
							func BenchmarkBar(*testing.B) {}
							func ExampleBaz() {}
						`
					},
					item: [
						['test', '/src/proj', 'module'],
						['main_test.go', '/src/proj/main_test.go', 'file']
					],
					expect: [
						'file:///src/proj/main_test.go?test#TestFoo',
						'file:///src/proj/main_test.go?benchmark#BenchmarkBar',
						'file:///src/proj/main_test.go?example#ExampleBaz'
					]
				}
			}
		};

		for (const n in cases) {
			suite(n, () => {
				for (const m in cases[n]) {
					test(m, async () => {
						const { workspace, files, expect, item: itemData = [] } = cases[n][m];
						const { expl, ctrl } = setup(workspace, files);

						let item: TestItem | undefined;
						for (const [label, uri, kind, name] of itemData) {
							const child = expl.createItem(label, Uri.parse(uri), kind, name);
							(item?.children || ctrl.items).add(child);
							item = child;
						}
						await ctrl.resolveHandler(item);

						const actual: string[] = [];
						(item?.children || ctrl.items).forEach((x) => actual.push(x.id));
						assert.deepStrictEqual(actual, expect);
					});
				}
			});
		}
	});

	suite('Events', () => {
		suite('Document opened', () => {
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
					const { ctrl, expl, ws } = setup(workspace, files);

					await expl.didOpenTextDocument(ws.fs.files.get(open));

					assertTestItems(ctrl.items, expect);
				});
			}
		});

		suite('Document edited', async () => {
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
					const { ctrl, expl, ws } = setup(workspace, files);

					await expl.didOpenTextDocument(ws.fs.files.get(open));

					assertTestItems(ctrl.items, expect.before);

					for (const [file, contents] of changes) {
						const doc = ws.fs.files.get(file);
						doc.contents = contents;
						await expl.didChangeTextDocument({
							document: doc,
							contentChanges: []
						});
					}

					assertTestItems(ctrl.items, expect.after);
				});
			}
		});
	});
});
