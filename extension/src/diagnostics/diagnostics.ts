/*---------------------------------------------------------
 * Copyright 2026 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

import vscode = require('vscode');
import { GoExtensionContext } from '../context';

export interface ICheckResult {
	file: string;
	line: number;
	col?: number;
	msg: string;
	severity: string;
}

export function handleErrors(
	goCtx: GoExtensionContext,
	document: vscode.TextDocument | undefined,
	errors: ICheckResult[],
	collection?: vscode.DiagnosticCollection
) {
	const docMap: Map<string, vscode.TextDocument> = new Map();
	{
		if (document) {
			docMap.set(document.uri.toString(), document);
		}

		// Also add other open .go files known to vscode for fast lookup.
		for (const doc of vscode.workspace.textDocuments) {
			const fileName = doc.uri.toString();
			if (!fileName.endsWith('.go')) {
				continue;
			}
			docMap.set(fileName, doc);
		}
	}

	const diagsMap: Map<string, vscode.Diagnostic[]> = new Map();
	for (const error of errors) {
		const uri = vscode.Uri.file(error.file).toString();

		// Some tools output only the line number or the start position.
		// If the file content is available, adjust the diagnostic range so
		// the squiggly underline for the error message is more visible.
		let range: vscode.Range;
		{
			let startColumn = error.col ? error.col - 1 : 0;
			let endColumn = startColumn + 1;
			const doc = docMap.get(uri);
			if (doc) {
				const tempRange = new vscode.Range(
					error.line - 1,
					0,
					error.line - 1,
					doc.lineAt(error.line - 1).range.end.character + 1 // end of the line
				);
				const text = doc.getText(tempRange);
				const [, leading, trailing] = /^(\s*).*(\s*)$/.exec(text)!;
				if (!error.col) {
					startColumn = leading.length; // beginning of the non-white space.
				} else {
					startColumn = error.col - 1; // range is 0-indexed
				}
				endColumn = text.length - trailing.length;
			}

			range = new vscode.Range(error.line - 1, startColumn, error.line - 1, endColumn);
		}

		let severity: vscode.DiagnosticSeverity = vscode.DiagnosticSeverity.Error;
		if (error.severity === 'warning') {
			severity = vscode.DiagnosticSeverity.Warning;
		}

		const diag = new vscode.Diagnostic(range, error.msg, severity);
		diag.source = collection?.name; // vscode uses source for deduping diagnostics.

		let diags = diagsMap.get(uri);
		if (!diags) {
			diags = [];
		}
		diags.push(diag);

		diagsMap.set(uri, diags);
	}

	collection?.clear();
	for (const [uriStr, fileDiags] of diagsMap) {
		let diags = fileDiags;
		const uri = vscode.Uri.parse(uriStr);

		const { buildDiagnosticCollection, lintDiagnosticCollection, vetDiagnosticCollection, languageClient } = goCtx;
		if (collection === buildDiagnosticCollection) {
			// If there are lint/vet warnings on current file, remove the ones
			// co-inciding with the new build errors.
			removeDuplicateDiagnostics(lintDiagnosticCollection, uri, diags);
			removeDuplicateDiagnostics(vetDiagnosticCollection, uri, diags);
		} else if (buildDiagnosticCollection && buildDiagnosticCollection.has(uri)) {
			// If there are build errors on current file, ignore the new lint/vet
			// warnings co-inciding with them.
			diags = deDupeDiagnostics(buildDiagnosticCollection.get(uri)!.slice(), diags);
		}
		// If there are errors from the language client that are on the current file,
		// ignore the warnings co-inciding with them.
		if (languageClient && languageClient.diagnostics?.has(uri)) {
			diags = deDupeDiagnostics(languageClient.diagnostics.get(uri)!.slice(), diags);
		}
		collection?.set(uri, diags);
	}
}

/**
 * Removes any diagnostics in collection, where there is a diagnostic in
 * newDiagnostics on the same line in fileUri.
 */
export function removeDuplicateDiagnostics(
	collection: vscode.DiagnosticCollection | undefined,
	fileUri: vscode.Uri,
	newDiagnostics: vscode.Diagnostic[]
) {
	if (collection && collection.has(fileUri)) {
		collection.set(fileUri, deDupeDiagnostics(newDiagnostics, collection.get(fileUri)!.slice()));
	}
}

/**
 * Removes any diagnostics in otherDiagnostics, where there is a diagnostic in
 * buildDiagnostics on the same line.
 */
function deDupeDiagnostics(
	buildDiagnostics: vscode.Diagnostic[],
	otherDiagnostics: vscode.Diagnostic[]
): vscode.Diagnostic[] {
	const buildDiagnosticsLines = buildDiagnostics.map((x) => x.range.start.line);
	return otherDiagnostics.filter((x) => buildDiagnosticsLines.indexOf(x.range.start.line) === -1);
}
