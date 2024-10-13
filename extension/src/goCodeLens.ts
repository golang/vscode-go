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
import { GoExtensionContext } from './context';
import { GO_MODE } from './goMode';
import { getSymbolImplementations } from './language/goLanguageServer';

export class GoCodeLensProvider extends GoBaseCodeLensProvider {
	static activate(ctx: vscode.ExtensionContext, goCtx: GoExtensionContext) {
		const codeLensProvider = new this(goCtx);
		ctx.subscriptions.push(vscode.languages.registerCodeLensProvider(GO_MODE, codeLensProvider));
		ctx.subscriptions.push(
			vscode.workspace.onDidChangeConfiguration(async (e: vscode.ConfigurationChangeEvent) => {
				if (!e.affectsConfiguration('go')) {
					return;
				}
				const updatedGoConfig = getGoConfig();
				if (updatedGoConfig['enableCodeLens']) {
					codeLensProvider.setEnabled(updatedGoConfig['enableCodeLens']['implementation']);
				}
			})
		);

		codeLensProvider.goToImplementations = codeLensProvider.goToImplementations.bind(codeLensProvider);

		vscode.commands.registerCommand('go.codeLens.goToImplementations', codeLensProvider.goToImplementations);
	}

	constructor(private readonly goCtx: GoExtensionContext) {
		super();
	}

	public async provideCodeLenses(document: TextDocument, token: CancellationToken): Promise<CodeLens[]> {
		if (!this.enabled) {
			return [];
		}
		const config = getGoConfig(document.uri);
		const codeLensConfig = config.get<{ [key: string]: any }>('enableCodeLens');
		const codelensEnabled = codeLensConfig ? codeLensConfig['implementation'] : false;
		if (!codelensEnabled || !document.fileName.endsWith('.go')) {
			return [];
		}

		const prefetchImpls = codeLensConfig ? codeLensConfig['prefetchImpls'] : false;

		const abstractCodelenses = this.getCodeLensForAbstractSymbols(document, token, prefetchImpls);
		const concreteCodelenses = this.getCodeLensForConcreteSymbols(document, token, prefetchImpls);

		const codeLenses = await Promise.all([abstractCodelenses, concreteCodelenses]);
		return codeLenses.flat();
	}

	private async getCodeLensForConcreteSymbols(
		document: TextDocument,
		token: CancellationToken,
		prefetchImpls: boolean
	): Promise<CodeLens[]> {
		const concreteTypes = await this.getConcreteTypes(document);
		if (concreteTypes && concreteTypes.length) {
			const concreteTypesCodeLens = await this.mapSymbolsToCodeLenses(document, concreteTypes, prefetchImpls);
			return concreteTypesCodeLens;
		}

		return [];
	}

	private async getCodeLensForAbstractSymbols(
		document: TextDocument,
		token: CancellationToken,
		prefetchImpls: boolean
	): Promise<CodeLens[]> {
		const interfaces = await this.getInterfaces(document);
		if (interfaces && interfaces.length) {
			const interfacesCodeLens = this.mapSymbolsToCodeLenses(document, interfaces, prefetchImpls);

			const methodsCodeLens = this.mapSymbolsToCodeLenses(
				document,
				interfaces.flatMap((i) => i.children),
				prefetchImpls
			);

			const codeLenses = await Promise.all([interfacesCodeLens, methodsCodeLens]);

			return codeLenses.flat();
		}
		return [];
	}

	private async getInterfaces(document: TextDocument): Promise<vscode.DocumentSymbol[]> {
		const documentSymbolProvider = GoDocumentSymbolProvider(this.goCtx);
		const symbols = await documentSymbolProvider.provideDocumentSymbols(document);
		if (!symbols || symbols.length === 0) {
			return [];
		}
		const pkg = symbols[0];
		if (!pkg) {
			return [];
		}
		const children = pkg.children;
		const interfaces = children.filter((s) => s.kind === vscode.SymbolKind.Interface);
		if (!interfaces) {
			return [];
		}

		return interfaces;
	}

	private async getConcreteTypes(document: TextDocument): Promise<vscode.DocumentSymbol[]> {
		const documentSymbolProvider = GoDocumentSymbolProvider(this.goCtx);
		const symbols = await documentSymbolProvider.provideDocumentSymbols(document);
		if (!symbols || symbols.length === 0) {
			return [];
		}
		const pkg = symbols[0];
		if (!pkg) {
			return [];
		}
		const children = pkg.children;
		const concreteTypes = children.filter((s) =>
			[vscode.SymbolKind.Struct, vscode.SymbolKind.Method].includes(s.kind)
		);
		if (!concreteTypes) {
			return [];
		}

		return concreteTypes;
	}

	private async mapSymbolsToCodeLenses(
		document: vscode.TextDocument,
		symbols: vscode.DocumentSymbol[],
		prefetchImpls: boolean
	): Promise<vscode.CodeLens[]> {
		if (prefetchImpls) {
			return Promise.all(
				symbols.map(async (s) => {
					const implementations = await this.getImplementations(document, s);
					if (implementations.length) {
						return new CodeLens(s.range, {
							title: `${implementations.length} implementation${implementations.length > 1 ? 's' : ''}`,
							command: 'editor.action.goToLocations',
							arguments: [document.uri, s.range.start, implementations, 'peek']
						});
					}

					return new CodeLens(s.range, {
						title: 'no implementation found',
						command: ''
					});
				})
			);
		}

		return symbols.map((s) => {
			return new CodeLens(s.range, {
				title: 'implementations',
				command: 'go.codeLens.goToImplementations',
				arguments: [document, s]
			});
		});
	}

	private async goToImplementations(document: vscode.TextDocument, symbol: vscode.DocumentSymbol) {
		const implementations = await this.getImplementations(document, symbol);
		await vscode.commands.executeCommand(
			'editor.action.goToLocations',
			document.uri,
			symbol.range.start,
			implementations,
			'peek',
			'No implementation found'
		);
	}

	private async getImplementations(
		document: vscode.TextDocument,
		symbol: vscode.DocumentSymbol
	): Promise<vscode.Location[]> {
		return getSymbolImplementations(this.goCtx, document, symbol);
	}
}
