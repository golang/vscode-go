/*---------------------------------------------------------
 * Copyright 2026 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

import assert from 'assert';
import os = require('os');
import * as path from 'path';
import sinon from 'sinon';
import * as vscode from 'vscode';
import * as config from '../../src/config';
import { GoExtensionContext } from '../../src/context';
import { handleErrors, ICheckResult } from '../../src/diagnostics/diagnostics';
import { lintCode } from '../../src/diagnostics/goLint';
import { MockWorkspaceConfiguration } from '../integration/mocks/configuration';
import { Env } from './goplsTestEnv.utils';

interface expectedDiagnostic {
	line: number;
	source: string;
	severity: vscode.DiagnosticSeverity;
}

function compareDiags(a: vscode.Diagnostic, b: vscode.Diagnostic): number {
	if (a.range.start.line !== b.range.start.line) {
		return a.range.start.line - b.range.start.line;
	}
	if (a.range.start.character !== b.range.start.character) {
		return a.range.start.character - b.range.start.character;
	}
	if (a.severity !== b.severity) {
		return a.severity - b.severity;
	}
	return (a.source ?? '').localeCompare(b.source ?? '');
}

suite('Diagnostic consolidation - unit', () => {
	let goCtx: GoExtensionContext;

	const fileURI = vscode.Uri.file(path.join(os.tmpdir(), 'diagnostic_priority_test.go')); // fake file
	const filePath = fileURI.fsPath;

	interface TestDiagnosticTestCase {
		name: string;
		diags: {
			gopls?: ICheckResult[];
			build?: ICheckResult[];
			vet?: ICheckResult[];
			lint?: ICheckResult[];
		};
		want: expectedDiagnostic[];
	}

	const testCases: TestDiagnosticTestCase[] = [
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
				{ line: 10, source: 'gopls-test', severity: vscode.DiagnosticSeverity.Warning },
				{ line: 20, source: 'build-test', severity: vscode.DiagnosticSeverity.Warning },
				{ line: 30, source: 'vet-test', severity: vscode.DiagnosticSeverity.Warning },
				{ line: 40, source: 'lint-test', severity: vscode.DiagnosticSeverity.Warning }
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
				{ line: 10, source: 'gopls-test', severity: vscode.DiagnosticSeverity.Error },
				{ line: 20, source: 'build-test', severity: vscode.DiagnosticSeverity.Error },
				{ line: 30, source: 'vet-test', severity: vscode.DiagnosticSeverity.Warning },
				{ line: 40, source: 'lint-test', severity: vscode.DiagnosticSeverity.Warning }
			]
		},
		// TODO(hxjiang): update test case once dedup based on line and column
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
			want: [{ line: 10, source: 'gopls-test', severity: vscode.DiagnosticSeverity.Error }]
		},
		{
			name: 'Same line and column, lower priority has higher severity',
			diags: {
				gopls: [{ file: filePath, line: 10, col: 5, msg: 'unmasked - highest priority', severity: 'warning' }],
				lint: [
					{ file: filePath, line: 10, col: 5, msg: 'masked by gopls', severity: 'warning' },
					{
						file: filePath,
						line: 10,
						col: 5,
						msg: 'unmasked - higher severity than gopls warning',
						severity: 'error'
					}
				]
			},
			want: [
				{ line: 10, source: 'lint-test', severity: vscode.DiagnosticSeverity.Error },
				{ line: 10, source: 'gopls-test', severity: vscode.DiagnosticSeverity.Warning }
			]
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
				const sorted = [...problems].sort(compareDiags);

				assert.strictEqual(
					sorted.length,
					tc.want.length,
					`[${tc.name}] Expected ${tc.want.length} diagnostics, got ${sorted.length}: ${JSON.stringify(sorted.map((p) => ({ line: p.range.start.line + 1, source: p.source, msg: p.message })))}`
				);

				for (let i = 0; i < tc.want.length; i++) {
					const want = tc.want[i];
					const got = sorted[i];
					assert.strictEqual(got.range.start.line, want.line - 1, `[${tc.name}] Line mismatch at index ${i}`);
					assert.strictEqual(got.source, want.source, `[${tc.name}] Source mismatch at index ${i}`);
					assert.strictEqual(got.severity, want.severity, `[${tc.name}] Severity mismatch at index ${i}`);
				}
			});
		}
	}
});

// Regression tests for golang/vscode-go#3511.
suite('Diagnostic consolidation - regression (#3511)', function () {
	this.timeout(30000);
	const projectDir = path.join(__dirname, '..', '..', '..');
	const testdataDir = path.join(projectDir, 'test', 'testdata', 'diagnosticsTest');
	let env: Env;

	async function pollDiagnostics(uri: vscode.Uri, predicate: (diags: vscode.Diagnostic[]) => boolean): Promise<void> {
		const start = Date.now();
		// Polling deadline of 10s. Analyzing a module with only a few files
		// should finish within 10s for both gopls and external linters.
		while (Date.now() - start < 10000) {
			const problems = vscode.languages.getDiagnostics(uri);
			if (predicate(problems)) {
				return;
			}
			await new Promise((resolve) => setTimeout(resolve, 50));
		}
		assert.fail(
			`timed out waiting for expected diags on ${path.basename(uri.fsPath)}, got: ${JSON.stringify(
				vscode.languages
					.getDiagnostics(uri)
					.map((p) => ({ line: p.range.start.line + 1, source: p.source, msg: p.message }))
			)}`
		);
	}

	suiteSetup(async () => {
		env = new Env();
		const goplsConfig = new MockWorkspaceConfiguration(
			config.getGoplsConfig(),
			new Map<string, any>([
				['ui.diagnostic.staticcheck', true],
				['ui.diagnostic.analyses', { ST1017: true }]
			])
		);
		sinon.stub(config, 'getGoplsConfig').returns(goplsConfig);

		const goConfig = new MockWorkspaceConfiguration(
			config.getGoConfig(),
			new Map<string, any>([
				['lintTool', 'golangci-lint-v2'],
				['lintOnSave', 'package']
			])
		);
		sinon.stub(config, 'getGoConfig').returns(goConfig);

		env.goCtx.lintDiagnosticCollection = vscode.languages.createDiagnosticCollection('go-lint');

		// Start gopls with workspace
		await env.startGopls(path.join(testdataDir, 'masked.go'), undefined, testdataDir);

		// Open both documents to trigger gopls diagnostics
		const { doc: coexistDoc } = await env.openDoc(path.join(testdataDir, 'coexist.go'));
		const { doc: maskedDoc } = await env.openDoc(path.join(testdataDir, 'masked.go'));
		await vscode.window.showTextDocument(coexistDoc);

		// Run linter once for the package
		lintCode('package')(undefined as any, env.goCtx)();

		// Wait until diagnostics from both gopls and linter are ready
		await pollDiagnostics(coexistDoc.uri, (diags) => diags.length >= 2);
		await pollDiagnostics(maskedDoc.uri, (diags) => diags.length >= 1);
	});

	suiteTeardown(async () => {
		sinon.restore();
		env.goCtx.lintDiagnosticCollection?.dispose();
		await env.teardown();
		env.flushTrace(false);
	});

	interface DiagnosticTestCase {
		name: string;
		fileName: string;
		want: expectedDiagnostic[];
	}

	const testCases: DiagnosticTestCase[] = [
		{
			name: 'coexist',
			fileName: 'coexist.go',
			// golangci-lint-v2 report a more severe diags so that persist.
			want: [
				{ line: 8, source: 'any', severity: vscode.DiagnosticSeverity.Hint },
				{ line: 8, source: 'go-lint', severity: vscode.DiagnosticSeverity.Warning }
			]
		},
		{
			name: 'masked',
			fileName: 'masked.go',
			// golangci-lint-v2 will report the same diags but prefer gopls'.
			want: [{ line: 4, source: 'ST1017', severity: vscode.DiagnosticSeverity.Warning }]
		}
	];

	for (const tc of testCases) {
		test(tc.name, () => {
			const uri = vscode.Uri.file(path.join(testdataDir, tc.fileName));
			const problems = vscode.languages.getDiagnostics(uri);
			const sorted = [...problems].sort(compareDiags);

			assert.strictEqual(
				sorted.length,
				tc.want.length,
				`[${tc.name}] Expected ${tc.want.length} diagnostics, got ${sorted.length}: ${JSON.stringify(sorted.map((p) => ({ line: p.range.start.line + 1, source: p.source, msg: p.message })))}`
			);

			for (let i = 0; i < tc.want.length; i++) {
				const want = tc.want[i];
				const got = sorted[i];
				assert.strictEqual(got.range.start.line, want.line - 1, `[${tc.name}] Line mismatch at index ${i}`);
				assert.strictEqual(got.source, want.source, `[${tc.name}] Source mismatch at index ${i}`);
				assert.strictEqual(got.severity, want.severity, `[${tc.name}] Severity mismatch at index ${i}`);
			}
		});
	}
});
