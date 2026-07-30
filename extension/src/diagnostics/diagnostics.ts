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

export function handleDiagnosticErrors(
	goCtx: GoExtensionContext,
	document: vscode.TextDocument | undefined,
	errors: ICheckResult[],
	diagnosticCollection?: vscode.DiagnosticCollection,
	diagnosticSource?: string
) {
	diagnosticCollection?.clear();

	const diagnosticMap: Map<string, vscode.Diagnostic[]> = new Map();

	const textDocumentMap: Map<string, vscode.TextDocument> = new Map();
	if (document) {
		textDocumentMap.set(document.uri.toString(), document);
	}
	// Also add other open .go files known to vscode for fast lookup.
	vscode.workspace.textDocuments.forEach((t) => {
		const fileName = t.uri.toString();
		if (!fileName.endsWith('.go')) {
			return;
		}
		textDocumentMap.set(fileName, t);
	});

	errors.forEach((error) => {
		const canonicalFile = vscode.Uri.file(error.file).toString();
		let startColumn = error.col ? error.col - 1 : 0;
		let endColumn = startColumn + 1;
		// Some tools output only the line number or the start position.
		// If the file content is available, adjust the diagnostic range so
		// the squiggly underline for the error message is more visible.
		const doc = textDocumentMap.get(canonicalFile);
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
		const range = new vscode.Range(error.line - 1, startColumn, error.line - 1, endColumn);
		const severity = mapSeverityToVSCodeSeverity(error.severity);
		const diagnostic = new vscode.Diagnostic(range, error.msg, severity);
		// vscode uses source for deduping diagnostics.
		diagnostic.source = diagnosticSource || diagnosticCollection?.name;
		let diagnostics = diagnosticMap.get(canonicalFile);
		if (!diagnostics) {
			diagnostics = [];
		}
		diagnostics.push(diagnostic);
		diagnosticMap.set(canonicalFile, diagnostics);
	});

	diagnosticMap.forEach((newDiagnostics, file) => {
		const fileUri = vscode.Uri.parse(file);

		const { buildDiagnosticCollection, lintDiagnosticCollection, vetDiagnosticCollection, languageClient } = goCtx;
		if (diagnosticCollection === buildDiagnosticCollection) {
			// If there are lint/vet warnings on current file, remove the ones co-inciding with the new build errors
			removeDuplicateDiagnostics(lintDiagnosticCollection, fileUri, newDiagnostics);
			removeDuplicateDiagnostics(vetDiagnosticCollection, fileUri, newDiagnostics);
		} else if (buildDiagnosticCollection && buildDiagnosticCollection.has(fileUri)) {
			// If there are build errors on current file, ignore the new lint/vet warnings co-inciding with them
			newDiagnostics = deDupeDiagnostics(buildDiagnosticCollection.get(fileUri)!.slice(), newDiagnostics);
		}
		// If there are errors from the language client that are on the current file, ignore the warnings co-inciding
		// with them.
		if (languageClient && languageClient.diagnostics?.has(fileUri)) {
			newDiagnostics = deDupeDiagnostics(languageClient.diagnostics.get(fileUri)!.slice(), newDiagnostics);
		}
		diagnosticCollection?.set(fileUri, newDiagnostics);
	});
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

function mapSeverityToVSCodeSeverity(sev: string): vscode.DiagnosticSeverity {
	switch (sev) {
		case 'error':
			return vscode.DiagnosticSeverity.Error;
		case 'warning':
			return vscode.DiagnosticSeverity.Warning;
		default:
			return vscode.DiagnosticSeverity.Error;
	}
}
