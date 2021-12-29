/*---------------------------------------------------------
 * Copyright 2021 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/
import assert = require('assert');
import { TestItem, Uri } from 'vscode';
import { GoTestResolver } from '../../src/goTest/resolve';
import { GoTest, GoTestKind } from '../../src/goTest/utils';
import { MockTestController, MockTestWorkspace } from '../mocks/MockTest';
import { getSymbols_Regex, populateModulePathCache } from './goTest.utils';

type Files = Record<string, string | { contents: string; language: string }>;

interface TestCase {
	workspace: string[];
	files: Files;
}

function setup(folders: string[], files: Files) {
	const workspace = MockTestWorkspace.from(folders, files);
	const ctrl = new MockTestController();
	const resolver = new GoTestResolver(workspace, ctrl, getSymbols_Regex);
	populateModulePathCache(workspace);
	return { resolver, ctrl };
}

suite('Go Test Resolver', () => {
	interface TC extends TestCase {
		item?: ([string, string, GoTestKind] | [string, string, GoTestKind, string])[];
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
					const { ctrl, resolver } = setup(workspace, files);

					let item: TestItem | undefined;
					for (const [label, uri, kind, name] of itemData) {
						const u = Uri.parse(uri);
						const child = ctrl.createTestItem(GoTest.id(u, kind, name), label, u);
						(item?.children || resolver.items).add(child);
						item = child;
					}
					await resolver.resolve(item);

					const actual: string[] = [];
					(item?.children || resolver.items).forEach((x) => actual.push(x.id));
					assert.deepStrictEqual(actual, expect);
				});
			}
		});
	}
});
