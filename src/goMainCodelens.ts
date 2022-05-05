/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

'use strict';

import vscode = require('vscode');
import cp = require('child_process');

import { CancellationToken, CodeLens, TextDocument } from 'vscode';
import { getGoConfig } from './config';
import { GoBaseCodeLensProvider } from './goBaseCodelens';
import { GoDocumentSymbolProvider } from './goOutline';
import { getBinPath } from './util';
import { envPath, getCurrentGoRoot } from './utils/pathUtils';
import { reject } from 'lodash';

export class GoMainCodeLensProvider extends GoBaseCodeLensProvider {
	private readonly mainRegex = /^main$/;

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

		return children.find(sym => sym.kind === vscode.SymbolKind.Function && this.mainRegex.test(sym.name));
	}

	private async getCodeLensForMainFunc(document: TextDocument, token: CancellationToken): Promise<CodeLens[]> {
		const mainPromise = async (): Promise<CodeLens[]> => {
			const mainFunc = await this.getMainFunc(document, token);
			if (!mainFunc) {
				return [];
			}

			return [
				new CodeLens(mainFunc.range, {
					title: 'run main',
					command: 'go.runMain',
					arguments: [{ functionName: mainFunc.name }]
				})
			];
		};

		return await mainPromise();
	}
}

const mainFuncOutputChannel = vscode.window.createOutputChannel('Go Main');

export async function runMainFunc() {
	let outputChannel = mainFuncOutputChannel
	const goRuntimePath = getBinPath('go');
	if (!goRuntimePath) {
		vscode.window.showErrorMessage(
			`Failed to run "go run ." as the "go" binary cannot be found in either GOROOT(${getCurrentGoRoot}) or PATH(${envPath})`
		);
		return Promise.resolve(false);
	}

	const editor = vscode.window.activeTextEditor;
	const documentUri = editor ? editor.document.uri : null;
	const args = ['run', documentUri.path];

	outputChannel.clear()
	outputChannel.show(true)
	outputChannel.appendLine(["Running main func: ", goRuntimePath, ...args].join(' '))

	cp.execFile(
		goRuntimePath,
		args,
		{ },
		(err, stdout, stderr) => {
			try {
				if (err) {
					outputChannel.appendLine(err.message);
					return;
				}
				if (stdout) {
					outputChannel.append(stdout);
				}
				if (stderr) {
					outputChannel.append(stderr);
				}
			} catch (e) {
				reject(e);
			}
		}
	)
}