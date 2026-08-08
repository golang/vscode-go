/*---------------------------------------------------------
 * Copyright 2026 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

import assert from 'assert';
import os = require('os');
import path = require('path');
import * as vscode from 'vscode';
import { GoExtensionContext } from '../../src/context';
import { handleErrors, ICheckResult } from '../../src/diagnostics/diagnostics';

interface DiagnosticTestCase {
	name: string;
	diags: {
		gopls?: ICheckResult[];
		build?: ICheckResult[];
		vet?: ICheckResult[];
		lint?: ICheckResult[];
	};
	want: {
		line: number;
		source: string;
	}[];
}

suite('Diagnostic consolidation', () => {
	let goCtx: GoExtensionContext;

	const fileURI = vscode.Uri.file(path.join(os.tmpdir(), 'diagnostic_priority_test.go')); // fake file
	const filePath = fileURI.fsPath;

	const testCases: DiagnosticTestCase[] = [
		{
			name: 'Symmetric priority masking (Gopls > Build > Vet > Lint)',
			diags: {
				gopls: [{ file: filePath, line: 10, msg: 'unmasked - highest priority', severity: 'warning' }],
				build: [
					{ file: filePath, line: 10, msg: 'masked by gopls', severity: 'warning' },
					{ file: filePath, line: 20, msg: 'unmasked - no higher priority', severity: 'warning' }
				],
				vet: [
					{ file: filePath, line: 10, msg: 'masked by gopls', severity: 'warning' },
					{ file: filePath, line: 20, msg: 'masked by build', severity: 'warning' },
					{ file: filePath, line: 30, msg: 'unmasked - no higher priority', severity: 'warning' }
				],
				lint: [
					{ file: filePath, line: 10, msg: 'masked by gopls', severity: 'warning' },
					{ file: filePath, line: 20, msg: 'masked by build', severity: 'warning' },
					{ file: filePath, line: 30, msg: 'masked by vet', severity: 'warning' },
					{ file: filePath, line: 40, msg: 'unmasked - no higher priority', severity: 'warning' }
				]
			},
			want: [
				{ line: 10, source: 'gopls-test' },
				{ line: 20, source: 'build-test' },
				{ line: 30, source: 'vet-test' },
				{ line: 40, source: 'lint-test' }
			]
		},
		{
			name: 'Diagnostics with columns and severity',
			diags: {
				gopls: [{ file: filePath, line: 10, col: 5, msg: 'unmasked - highest priority', severity: 'error' }],
				build: [
					{ file: filePath, line: 10, col: 5, msg: 'masked by gopls', severity: 'error' },
					{ file: filePath, line: 20, col: 12, msg: 'unmasked - no higher priority', severity: 'error' }
				],
				vet: [
					{ file: filePath, line: 20, col: 12, msg: 'masked by build', severity: 'warning' },
					{ file: filePath, line: 30, col: 8, msg: 'unmasked - no higher priority', severity: 'warning' }
				],
				lint: [
					{ file: filePath, line: 30, col: 8, msg: 'masked by vet', severity: 'warning' },
					{ file: filePath, line: 40, col: 15, msg: 'unmasked - no higher priority', severity: 'warning' }
				]
			},
			want: [
				{ line: 10, source: 'gopls-test' },
				{ line: 20, source: 'build-test' },
				{ line: 30, source: 'vet-test' },
				{ line: 40, source: 'lint-test' }
			]
		},
		// TODO(hxjiang): update test case once dedup based on line and column and severity
		{
			name: 'Same line, different columns, same severity',
			diags: {
				gopls: [{ file: filePath, line: 10, col: 5, msg: 'unmasked - highest priority', severity: 'error' }],
				build: [
					{ file: filePath, line: 10, col: 5, msg: 'masked by gopls', severity: 'error' },
					{ file: filePath, line: 10, col: 15, msg: 'masked by gopls', severity: 'error' }
				],
				vet: [{ file: filePath, line: 10, col: 25, msg: 'masked by gopls', severity: 'error' }],
				lint: [{ file: filePath, line: 10, col: 35, msg: 'masked by gopls', severity: 'error' }]
			},
			want: [{ line: 10, source: 'gopls-test' }]
		},
		// TODO(hxjiang): update test case once dedup based on line and column and severity
		{
			name: 'Same line and column, lower priority has higher severity',
			diags: {
				gopls: [{ file: filePath, line: 10, col: 5, msg: 'unmasked - highest priority', severity: 'warning' }],
				lint: [
					{ file: filePath, line: 10, col: 5, msg: 'masked by gopls', severity: 'warning' },
					{ file: filePath, line: 10, col: 5, msg: 'masked by gopls', severity: 'error' }
				]
			},
			want: [{ line: 10, source: 'gopls-test' }]
		}
	];

	setup(() => {
		goCtx = {
			languageClient: { diagnostics: vscode.languages.createDiagnosticCollection('gopls-test') } as any,
			buildDiagnosticCollection: vscode.languages.createDiagnosticCollection('build-test'),
			vetDiagnosticCollection: vscode.languages.createDiagnosticCollection('vet-test'),
			lintDiagnosticCollection: vscode.languages.createDiagnosticCollection('lint-test')
		};
	});

	teardown(() => {
		goCtx.languageClient?.diagnostics?.dispose();
		goCtx.buildDiagnosticCollection?.dispose();
		goCtx.vetDiagnosticCollection?.dispose();
		goCtx.lintDiagnosticCollection?.dispose();
	});

	for (const tc of testCases) {
		for (let round = 1; round <= 5; round++) {
			test(`${tc.name} (round ${round})`, async () => {
				const collections = [
					{ key: 'gopls' as const, collection: goCtx.languageClient!.diagnostics! },
					{ key: 'build' as const, collection: goCtx.buildDiagnosticCollection! },
					{ key: 'vet' as const, collection: goCtx.vetDiagnosticCollection! },
					{ key: 'lint' as const, collection: goCtx.lintDiagnosticCollection! }
				];

				// Simulate 4 concurrent diagnostic providers reporting diags
				// independently with random delays to verify eventual consistency.
				const tasks = collections.map(({ key, collection }) => {
					const errors = tc.diags[key] || [];
					return new Promise<void>((resolve) => {
						const delay = Math.floor(Math.random() * 15);
						setTimeout(() => {
							handleErrors(goCtx, undefined, errors, collection);
							resolve();
						}, delay);
					});
				});

				// Wait for all concurrent diagnostic providers to finish reporting.
				await Promise.all(tasks);

				// Read diagnostics directly from the "PROBLEMS" tab.
				const problems = vscode.languages.getDiagnostics(fileURI);
				assert.strictEqual(
					problems.length,
					tc.want.length,
					`[${tc.name}] Expected ${tc.want.length} diagnostics in problem tab, got ${problems.length}: ${JSON.stringify(problems.map((p) => ({ source: p.source, msg: p.message })))}`
				);
				const sorted = [...problems].sort((a, b) => a.range.start.line - b.range.start.line);
				for (let i = 0; i < tc.want.length; i++) {
					const want = tc.want[i];
					const got = sorted[i];
					assert.strictEqual(got.range.start.line, want.line - 1, `[${tc.name}] Line mismatch at index ${i}`);
					assert.strictEqual(got.source, want.source, `[${tc.name}] Source mismatch at index ${i}`);
				}
			});
		}
	}
});
