/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

'use strict';

import vscode = require('vscode');
import { CancellationToken, CodeLens, TextDocument } from 'vscode';
import { getGoConfig } from './config';
import { GoBaseCodeLensProvider } from './goBaseCodelens';
import { GoDocumentSymbolProvider } from './goDocumentSymbols';
import { getBenchmarkFunctions, getTestFunctions } from './testUtils';
import { GoExtensionContext } from './context';
import { GO_MODE } from './goMode';
import { experiments } from './experimental';

export class GoRunTestCodeLensProvider extends GoBaseCodeLensProvider {
	static activate(ctx: vscode.ExtensionContext, goCtx: GoExtensionContext) {
		const testCodeLensProvider = new this(goCtx);
		const setEnabled = () => {
			const updatedGoConfig = getGoConfig();
			if (updatedGoConfig['enableCodeLens']) {
				testCodeLensProvider.setEnabled(
					updatedGoConfig['enableCodeLens']['runtest'] && !experiments.testExplorer
				);
			}
		};

		ctx.subscriptions.push(vscode.languages.registerCodeLensProvider(GO_MODE, testCodeLensProvider));
		ctx.subscriptions.push(experiments.onDidChange(() => setEnabled()));
		ctx.subscriptions.push(
			vscode.workspace.onDidChangeConfiguration(async (e: vscode.ConfigurationChangeEvent) => {
				if (e.affectsConfiguration('go')) {
					setEnabled();
				}
			})
		);
	}

	constructor(private readonly goCtx: GoExtensionContext) {
		super();
	}

	private readonly benchmarkRegex = /^Benchmark.+/;

	public async provideCodeLenses(document: TextDocument, token: CancellationToken): Promise<CodeLens[]> {
		if (!this.enabled) {
			return [];
		}
		const config = getGoConfig(document.uri);
		const codeLensConfig = config.get<{ [key: string]: any }>('enableCodeLens');
		const codelensEnabled = codeLensConfig ? codeLensConfig['runtest'] : false;
		if (!codelensEnabled || !document.fileName.endsWith('_test.go')) {
			return [];
		}

		const codelenses = await Promise.all([
			this.getCodeLensForPackage(document, token),
			this.getCodeLensForFunctions(document, token)
		]);
		return ([] as CodeLens[]).concat(...codelenses);
	}

	private async getCodeLensForPackage(document: TextDocument, token: CancellationToken): Promise<CodeLens[]> {
		const documentSymbolProvider = GoDocumentSymbolProvider(this.goCtx);
		const symbols = await documentSymbolProvider.provideDocumentSymbols(document);
		if (!symbols || symbols.length === 0) {
			return [];
		}
		const pkg = symbols[0];
		if (!pkg) {
			return [];
		}
		const range = pkg.range;
		const packageCodeLens = [
			new CodeLens(range, {
				title: 'run package tests',
				command: 'go.test.package'
			}),
			new CodeLens(range, {
				title: 'run file tests',
				command: 'go.test.file'
			})
		];
		if (pkg.children.some((sym) => sym.kind === vscode.SymbolKind.Function && this.benchmarkRegex.test(sym.name))) {
			packageCodeLens.push(
				new CodeLens(range, {
					title: 'run package benchmarks',
					command: 'go.benchmark.package'
				}),
				new CodeLens(range, {
					title: 'run file benchmarks',
					command: 'go.benchmark.file'
				})
			);
		}
		return packageCodeLens;
	}

	private async getCodeLensForFunctions(document: TextDocument, token: CancellationToken): Promise<CodeLens[]> {
		const testPromise = async (): Promise<CodeLens[]> => {
			const codelens: CodeLens[] = [];

			const testFunctions = await getTestFunctions(this.goCtx, document, token);
			if (!testFunctions) {
				return codelens;
			}

			// Captures receiver name and function name.
			// reason is: function name coming from f.name is not compatible with struct methods.
			const testSuiteRegex = /func \((.*?) .*?\) (Test.*?)\(/;

			for (const f of testFunctions) {
				let functionName = f.name;
				const line = document.lineAt(f.range.start.line);
				const testSuiteMatch = line.text.match(testSuiteRegex);
				if (testSuiteMatch) functionName = testSuiteMatch[2]
				var receiverName = testSuiteMatch ? testSuiteMatch[1] : 't';

				codelens.push(
					new CodeLens(f.range, {
						title: 'run test',
						command: 'go.test.cursor',
						arguments: [{ 
							functionName: functionName,
							isTestSuite: !!testSuiteMatch
						}]
					}),
					new CodeLens(f.range, {
						title: 'debug test',
						command: 'go.debug.cursor',
						arguments: [{ 
							functionName: functionName,
							isTestSuite: !!testSuiteMatch
						}]
					})
				);

				// Dynamic regex for capturing receiverName.Run("testName", ...)
				// receiver name is either t for normal test functions or the receiver of a test suite.
				// example: func (s *testSuite) TestFunc() // Returns 's'
				let testCaseRegex = new RegExp(receiverName + "\.Run\\(\"([^\"]+)\",");

				for (let i = f.range.start.line; i < f.range.end.line; i++) {
					const line = document.lineAt(i);
					const simpleMatch = line.text.match(testCaseRegex);

					// BUG: this does not handle nested subtests. This should
					// be solved once codelens is handled by gopls and not by
					// vscode.
					if (simpleMatch) {
						const subTestName = simpleMatch[1];

						codelens.push(
							new CodeLens(line.range, {
								title: 'run test',
								command: 'go.subtest.cursor',
								arguments: [{ 
									functionName: functionName, 
									subTestName: subTestName,
									isTestSuite: !!testSuiteMatch
								}]
							}),
							new CodeLens(line.range, {
								title: 'debug test',
								command: 'go.debug.subtest.cursor',
								arguments: [{ 
									functionName: functionName, 
									subTestName: subTestName,
									isTestSuite: !!testSuiteMatch
								}]
							})
						);
					}
				}
			}

			return codelens;
		};

		const benchmarkPromise = async (): Promise<CodeLens[]> => {
			const benchmarkFunctions = await getBenchmarkFunctions(this.goCtx, document, token);
			if (!benchmarkFunctions) {
				return [];
			}
			const codelens: CodeLens[] = [];
			for (const f of benchmarkFunctions) {
				codelens.push(
					new CodeLens(f.range, {
						title: 'run benchmark',
						command: 'go.benchmark.cursor',
						arguments: [{ functionName: f.name }]
					})
				);
				codelens.push(
					new CodeLens(f.range, {
						title: 'debug benchmark',
						command: 'go.debug.cursor',
						arguments: [{ functionName: f.name }]
					})
				);
			}
			return codelens;
		};

		const codelenses = await Promise.all([testPromise(), benchmarkPromise()]);
		return ([] as CodeLens[]).concat(...codelenses);
	}
}
