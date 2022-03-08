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
import { GoDocumentSymbolProvider } from './goOutline';
import { getBenchmarkFunctions, getTestFunctions } from './testUtils';

const mainFuncRegx = /^main$/u;

export class GoMainCodeLensProvider extends GoBaseCodeLensProvider {
	private readonly mainRegex = /^main.+/;

	public async provideCodeLenses(document: TextDocument, token: CancellationToken): Promise<CodeLens[]> {
		if (!this.enabled) {
			return [];
		}
		const config = getGoConfig(document.uri);
		const codeLensConfig = config.get<{ [key: string]: any }>('enableCodeLens');
		const codelensEnabled = codeLensConfig ? codeLensConfig['runmain'] : false;
		if (!codelensEnabled || !document.fileName.match('main.go')) {
			return [];
		}

		const codelenses = await Promise.all([
			this.getCodeLensForMainFunc(document, token)
		]);
		return ([] as CodeLens[]).concat(...codelenses);
	}

	// Return the first main function
	private async getMainFunc(
		doc: vscode.TextDocument,
		token: vscode.CancellationToken
	): Promise<vscode.DocumentSymbol | undefined> {
		const documentSymbolProvider = new GoDocumentSymbolProvider(true);
		const symbols = await documentSymbolProvider.provideDocumentSymbols(doc, token);
		if (!symbols || symbols.length === 0) {
			return;
		}
		const symbol = symbols[0];
		if (!symbol) {
			return;
		}
		const children = symbol.children;

		return children.find(sym => sym.kind === vscode.SymbolKind.Function && mainFuncRegx.test(sym.name));
	}

	private async getCodeLensForMainFunc(document: TextDocument, token: CancellationToken): Promise<CodeLens[]> {
		const mainPromise = async (): Promise<CodeLens[]> => {
			const mainFunc = await this.getMainFunc(document, token);
			if (!mainFunc) {
				return [];
			}

			return [
				new CodeLens(mainFunc.range, {
					title: 'run',
					command: 'go.main.run',
					arguments: [{ functionName: mainFunc.name }]
				}),
				new CodeLens(mainFunc.range, {
					title: 'package run',
					command: 'go.main.package',
					arguments: [{ functionName: mainFunc.name }]
				})
			];
		};

		return await mainPromise();
	}
}
