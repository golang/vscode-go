/*---------------------------------------------------------
 * Copyright 2026 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

import cp = require('child_process');
import path = require('path');
import vscode = require('vscode');
import { FeatureState, HandleDiagnosticsSignature, LanguageClient, StaticFeature } from 'vscode-languageclient/node';
import { GoExtensionContext } from '../context';
import { outputChannel } from '../goStatus';
import { getBinPath } from '../util';
import { fixDriveCasingInWindows } from '../utils/pathUtils';
import { killProcessTree } from '../utils/processUtils';

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

/**
 * Runs given Go tool and returns errors/warnings that can be fed to the Problems Matcher
 * @param args Arguments to be passed while running given tool
 * @param cwd cwd that will passed in the env object while running given tool
 * @param severity error or warning
 * @param useStdErr If true, the stderr of the output of the given tool will be used, else stdout will be used
 * @param toolName The name of the Go tool to run. If none is provided, the go runtime itself is used
 * @param printUnexpectedOutput If true, then output that doesnt match expected format is printed to the output channel
 */
export function runTool(
	args: string[],
	cwd: string,
	severity: string,
	useStdErr: boolean,
	toolName: string,
	env: any,
	printUnexpectedOutput: boolean,
	token?: vscode.CancellationToken
): Promise<ICheckResult[]> {
	let cmd: string;
	if (toolName) {
		cmd = getBinPath(toolName);
	} else {
		const goRuntimePath = getBinPath('go');
		if (!goRuntimePath) {
			return Promise.reject(new Error('Cannot find "go" binary. Update PATH or GOROOT appropriately'));
		}
		cmd = goRuntimePath;
	}

	let p: cp.ChildProcess;
	if (token) {
		token.onCancellationRequested(() => {
			if (p) {
				void killProcessTree(p);
			}
		});
	}
	cwd = fixDriveCasingInWindows(cwd);
	return new Promise((resolve, reject) => {
		p = cp.execFile(cmd, args, { env, cwd }, (err, stdout, stderr) => {
			try {
				if (err && (<any>err).code === 'ENOENT') {
					// Since the tool is run on save which can be frequent
					// we avoid sending explicit notification if tool is missing
					console.log(`Cannot find ${toolName ? toolName : 'go'}`);
					return resolve([]);
				}
				if (err && stderr && !useStdErr) {
					outputChannel.error(['Error while running tool:', cmd, ...args].join(' '));
					outputChannel.error(stderr);
					return resolve([]);
				}
				const lines = (useStdErr ? stderr : stdout).toString().split('\n');
				outputChannel.info([cwd + '>Finished running tool:', cmd, ...args].join(' '));

				const ret: ICheckResult[] = [];
				let unexpectedOutput = false;
				let atLeastSingleMatch = false;
				for (const l of lines) {
					if (l[0] === '\t' && ret.length > 0) {
						ret[ret.length - 1].msg += '\n' + l;
						continue;
					}
					const match = /^([^:]*: )?((.:)?[^:]*):(\d+)(:(\d+)?)?:(?:\w+:)? (.*)$/.exec(l);
					if (!match) {
						if (printUnexpectedOutput && useStdErr && stderr) {
							unexpectedOutput = true;
						}
						continue;
					}
					atLeastSingleMatch = true;
					const [, , file, , lineStr, , colStr, msg] = match;
					const line = +lineStr;
					const col = colStr ? +colStr : undefined;

					// Building skips vendor folders,
					// But vet and lint take in directories and not import paths, so no way to skip them
					// So prune out the results from vendor folders here.
					if (
						!path.isAbsolute(file) &&
						(file.startsWith(`vendor${path.sep}`) || file.indexOf(`${path.sep}vendor${path.sep}`) > -1)
					) {
						continue;
					}

					const filePath = path.resolve(cwd, file);
					ret.push({ file: filePath, line, col, msg, severity });
					outputChannel.info(`${filePath}:${line}:${col ?? ''} ${msg}`);
				}
				if (!atLeastSingleMatch && unexpectedOutput && vscode.window.activeTextEditor) {
					outputChannel.error(stderr);
					if (err) {
						ret.push({
							file: vscode.window.activeTextEditor.document.fileName,
							line: 1,
							col: 1,
							msg: stderr,
							severity: 'error'
						});
					}
				}
				outputChannel.info('');
				resolve(ret);
			} catch (e) {
				reject(e);
			}
		});
	});
}

/**
 * GoDiagnosticsFeature is a static feature that hooks into the language client's
 * handleDiagnostics middleware to evict colliding diagnostics from lower-priority
 * collections (build, vet, lint) whenever gopls publishes diagnostics.
 */
export class GoDiagnosticsFeature implements StaticFeature {
	constructor(
		private readonly client: LanguageClient,
		private readonly goCtx: GoExtensionContext
	) {
		this.addMiddleware();
	}

	public fillClientCapabilities(): void {}

	public clear(): void {}

	public getState(): FeatureState {
		return { kind: 'static' };
	}

	public initialize(): void {}

	private addMiddleware(): void {
		const middleware = this.client.clientOptions.middleware ?? {};
		const original = middleware.handleDiagnostics;

		middleware.handleDiagnostics = (
			uri: vscode.Uri,
			diagnostics: vscode.Diagnostic[],
			next: HandleDiagnosticsSignature
		) => {
			const { buildDiagnosticCollection, lintDiagnosticCollection, vetDiagnosticCollection } = this.goCtx;
			// Deduplicate diagnostics with those found by the other tools.
			removeDuplicateDiagnostics(vetDiagnosticCollection, uri, diagnostics);
			removeDuplicateDiagnostics(buildDiagnosticCollection, uri, diagnostics);
			removeDuplicateDiagnostics(lintDiagnosticCollection, uri, diagnostics);

			return original ? original(uri, diagnostics, next) : next(uri, diagnostics);
		};

		this.client.clientOptions.middleware = middleware;
	}
}
