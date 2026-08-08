/*---------------------------------------------------------
 * Copyright 2026 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

/**
 * @fileoverview Diagnostic Consolidation Architecture
 *
 * This module manages diagnostic deduplication and publication across four diagnostic
 * sources according to a strict priority hierarchy:
 *
 *   #0 Language Server (gopls) [Highest]
 *   #1 Build
 *   #2 Vet
 *   #3 Lint                    [Lowest]
 *
 * -------------------------------------------------------------------------------------
 * ### Priority Hierarchy & Deduplication Rules
 * -------------------------------------------------------------------------------------
 * Diagnostics are deduplicated on a per-line basis using two symmetric rules:
 *
 * 1. Upstream Filtering:
 *    When a lower-priority tool runs, any incoming diagnostic on a line that already
 *    contains a diagnostic from a higher-priority source is ignored.
 *
 * 2. Downstream Eviction:
 *    When a higher-priority source publishes diagnostics, any existing diagnostics
 *    from lower-priority sources on those same lines are evicted.
 *
 * -------------------------------------------------------------------------------------
 * ### Runtime Modes
 * -------------------------------------------------------------------------------------
 * In practice, the extension operates under two primary conditions:
 *
 * - Language Server Enabled (Default):
 *   Build and vet on save are disabled because the language server provides compilation
 *   and analysis diagnostics in real time. The active hierarchy on save is effectively:
 *     Language Server > Lint
 *
 * - Language Server Disabled:
 *   The language server is inactive, and build, vet, and lint run on save.
 *   The active hierarchy on save is:
 *     Build > Vet > Lint
 *
 * -------------------------------------------------------------------------------------
 * ### Architecture Note
 * -------------------------------------------------------------------------------------
 * The deduplication logic is coordinated across two separate places in the extension:
 *
 * 1. The Language Server integration (which intercepts language server diagnostic events
 *    and evicts colliding diagnostics from lower-priority collections).
 * 2. The extension tool diagnostic publisher (which handles build, vet, and lint results,
 *    filtering against higher-priority sources and evicting lower-priority ones).
 *
 * Both locations adhere to the same unified priority order.
 */

import cp = require('child_process');
import path = require('path');
import vscode = require('vscode');
import { FeatureState, HandleDiagnosticsSignature, LanguageClient, StaticFeature } from 'vscode-languageclient/node';
import { GoExtensionContext } from '../context';
import { outputChannel } from '../goStatus';
import { getBinPath } from '../util';
import { fixDriveCasingInWindows } from '../utils/pathUtils';
import { killProcessTree } from '../utils/processUtils';

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
			for (const collection of [
				this.goCtx.buildDiagnosticCollection,
				this.goCtx.vetDiagnosticCollection,
				this.goCtx.lintDiagnosticCollection
			]) {
				if (collection?.has(uri)) {
					collection.set(uri, filterDiags(collection.get(uri)!, diagnostics));
				}
			}

			return original ? original(uri, diagnostics, next) : next(uri, diagnostics);
		};

		this.client.clientOptions.middleware = middleware;
	}
}

export interface ICheckResult {
	file: string;
	line: number;
	col?: number;
	msg: string;
	severity: string;
}

/**
 * Processes and publishes tool diagnostics to the given diagnostic collection,
 * applying upstream filtering against higher-priority collections and downstream
 * eviction on lower-priority collections according to the priority hierarchy.
 *
 * TODO(hxjiang): is that possible to make GoExtensionContext holding type
 * `vscode.DiagnosticCollection` instead of `vscode.DiagnosticCollection | undefined`.
 */
export function handleErrors(
	goCtx: GoExtensionContext,
	document: vscode.TextDocument | undefined,
	errors: ICheckResult[],
	collection?: vscode.DiagnosticCollection
) {
	if (!collection) {
		return;
	}

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
		diag.source = collection.name; // vscode uses source for deduping diagnostics.

		let diags = diagsMap.get(uri);
		if (!diags) {
			diags = [];
		}
		diags.push(diag);

		diagsMap.set(uri, diags);
	}

	collection.clear();

	// Ordered from highest priority (#0) to lowest priority (#3)
	const prioritized: (vscode.DiagnosticCollection | undefined)[] = [
		goCtx.languageClient?.diagnostics, // #0 Gopls (Highest)
		goCtx.buildDiagnosticCollection, // #1 Build
		goCtx.vetDiagnosticCollection, // #2 Vet
		goCtx.lintDiagnosticCollection // #3 Lint (Lowest)
	];

	// Find the current collection's rank.
	const rank = prioritized.indexOf(collection);
	if (rank === -1) {
		return; // the collection is disposed, no longer managed by the go extension.
	}

	for (const [uriStr, fileDiags] of diagsMap) {
		let diags = fileDiags;
		const uri = vscode.Uri.parse(uriStr);

		for (let i = 0; i < prioritized.length; i++) {
			const other = prioritized[i];
			if (!other) {
				continue;
			}

			if (i < rank) {
				// Upstream: filter incoming diagnostics against higher-priority source
				if (other.has(uri)) {
					diags = filterDiags(diags, other.get(uri)!);
				}
			} else if (i === rank) {
				// Publish: all higher-priority filtering is done, publish now
				collection.set(uri, diags);
			} else {
				// Downstream: evict colliding diagnostics from lower-priority collection
				if (other.has(uri)) {
					other.set(uri, filterDiags(other.get(uri)!, diags));
				}
			}
		}
	}
}

/**
 * Returns targetDiags with any diagnostics that coincide on the same line
 * with a diagnostic in maskingDiags removed.
 */
export function filterDiags(
	targetDiags: readonly vscode.Diagnostic[],
	maskingDiags: readonly vscode.Diagnostic[]
): vscode.Diagnostic[] {
	const lines = new Set<number>();
	for (const diag of maskingDiags) {
		lines.add(diag.range.start.line);
	}

	const deduped: vscode.Diagnostic[] = [];
	for (const diag of targetDiags) {
		if (!lines.has(diag.range.start.line)) {
			deduped.push(diag);
		}
	}
	return deduped;
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
