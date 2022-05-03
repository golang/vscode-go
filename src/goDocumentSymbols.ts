/*---------------------------------------------------------
 * Copyright 2022 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

import vscode = require('vscode');
import { ExecuteCommandParams, ExecuteCommandRequest } from 'vscode-languageserver-protocol';
import { getGoConfig } from './config';
import { goCtx } from './goMain';
import { GoLegacyDocumentSymbolProvider } from './language/legacy/goOutline';

export function GoDocumentSymbolProvider(
	includeImports?: boolean
): GoplsDocumentSymbolProvider | GoLegacyDocumentSymbolProvider {
	const { latestConfig } = goCtx;
	if (!latestConfig?.enabled) {
		return new GoLegacyDocumentSymbolProvider(includeImports);
	}
	return new GoplsDocumentSymbolProvider(includeImports);
}

const GOPLS_LIST_IMPORTS = 'gopls.list_imports';
export class GoplsDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
	constructor(private includeImports?: boolean) {}

	public async provideDocumentSymbols(document: vscode.TextDocument): Promise<vscode.DocumentSymbol[]> {
		if (typeof this.includeImports !== 'boolean') {
			const gotoSymbolConfig = getGoConfig(document.uri)['gotoSymbol'];
			this.includeImports = gotoSymbolConfig ? gotoSymbolConfig['includeImports'] : false;
		}
		const { languageClient, serverInfo } = goCtx;
		if (!languageClient) {
			return [];
		}

		const symbols: vscode.DocumentSymbol[] | undefined = await vscode.commands.executeCommand(
			'vscode.executeDocumentSymbolProvider',
			document.uri
		);
		if (!symbols || symbols.length === 0) {
			return [];
		}

		// Stitch the results together to make the results look like
		// go-outline.
		let pkgDeclRng = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 0));
		let pkgName = '';

		// Try to find the package statement.
		const text = document.getText();
		const packageStatement = new RegExp('^[ \\t]*package[ \\t]*(\\S+)', 'm');
		const match = packageStatement.exec(text);
		if (match && match.length === 2) {
			const packageDecl = match[0];
			const start = text.indexOf(packageDecl);
			pkgDeclRng = new vscode.Range(document.positionAt(start), document.positionAt(start + packageDecl.length));
			pkgName = packageDecl[1];
		}
		const packageSymbol = new vscode.DocumentSymbol(
			pkgName,
			'package',
			vscode.SymbolKind.Package,
			pkgDeclRng,
			pkgDeclRng
		);
		packageSymbol.children = symbols;
		if (this.includeImports && serverInfo?.Commands?.includes(GOPLS_LIST_IMPORTS)) {
			try {
				const imports = await listImports(document);
				imports?.forEach((value) => {
					packageSymbol.children.unshift(
						new vscode.DocumentSymbol(
							value.Path,
							'import',
							vscode.SymbolKind.Namespace,
							new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 0)),
							new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 0))
						)
					);
				});
			} catch (err) {
				console.log('Failed to list imports: {err}');
			}
		}
		return [packageSymbol];
	}
}

async function listImports(document: vscode.TextDocument): Promise<{ Path: string; Name: string }[]> {
	const { languageClient } = goCtx;
	const uri = languageClient?.code2ProtocolConverter.asTextDocumentIdentifier(document).uri;
	const params: ExecuteCommandParams = {
		command: GOPLS_LIST_IMPORTS,
		arguments: [
			{
				URI: uri
			}
		]
	};
	const resp = await languageClient?.sendRequest(ExecuteCommandRequest.type, params);
	return resp.Imports;
}
