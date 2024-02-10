/*---------------------------------------------------------
 * Copyright 2022 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

import vscode = require('vscode');
import { DocumentSymbolRequest, ExecuteCommandParams, ExecuteCommandRequest } from 'vscode-languageserver-protocol';
import { getGoConfig } from './config';
import { GoExtensionContext } from './context';

export function GoDocumentSymbolProvider(
	goCtx: GoExtensionContext,
	includeImports?: boolean
): GoplsDocumentSymbolProvider {
	return new GoplsDocumentSymbolProvider(goCtx, includeImports);
}

const GOPLS_LIST_IMPORTS = 'gopls.list_imports';
export class GoplsDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
	constructor(private readonly goCtx: GoExtensionContext, private includeImports?: boolean) {}

	public async provideDocumentSymbols(document: vscode.TextDocument): Promise<vscode.DocumentSymbol[]> {
		if (!this.goCtx.languageServerIsRunning) {
			return [];
		}
		// TODO(suzmue): consider providing an interface for providing document symbols that only requires
		// the URI. Getting a TextDocument from a filename requires opening the file, which can lead to
		// files being opened that were not requested by the user in order to get information that we just
		// need the URI to access.
		if (typeof this.includeImports !== 'boolean') {
			const gotoSymbolConfig = getGoConfig(document.uri)['gotoSymbol'];
			this.includeImports = gotoSymbolConfig ? gotoSymbolConfig['includeImports'] : false;
		}
		const { languageClient, serverInfo } = this.goCtx;
		if (!languageClient) {
			return [];
		}

		const p = languageClient?.getFeature(DocumentSymbolRequest.method)?.getProvider(document);
		if (!p) {
			return [];
		}
		const cancel = new vscode.CancellationTokenSource();
		const symbols = await p.provideDocumentSymbols(document, cancel.token);
		cancel.dispose();
		if (!symbols || symbols.length === 0 || !isDocumentSymbol(symbols)) {
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
				const imports = await listImports(this.goCtx, document);
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
				console.log(`Failed to list imports: ${err}`);
			}
		}
		return [packageSymbol];
	}
}

async function listImports(
	goCtx: GoExtensionContext,
	document: vscode.TextDocument
): Promise<{ Path: string; Name: string }[]> {
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
	return resp.PackageImports;
}

function isDocumentSymbol(r: vscode.SymbolInformation[] | vscode.DocumentSymbol[]): r is vscode.DocumentSymbol[] {
	return r[0] instanceof vscode.DocumentSymbol;
}
