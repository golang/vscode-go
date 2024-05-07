/* eslint-disable @typescript-eslint/no-explicit-any */
/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

import cp = require('child_process');
import fs = require('fs');
import os = require('os');
import path = require('path');
import semver = require('semver');
import util = require('util');
import vscode = require('vscode');
import { getGoConfig } from './config';
import { extensionId } from './const';
import { GoExtensionContext } from './context';
import { toolExecutionEnvironment } from './goEnv';
import { outputChannel } from './goStatus';
import { getFromWorkspaceState } from './stateUtils';
import {
	getEnvPath,
	fixDriveCasingInWindows,
	getBinPathWithPreferredGopathGorootWithExplanation,
	getCurrentGoRoot,
	getInferredGopath,
	resolveHomeDir
} from './utils/pathUtils';
import { killProcessTree } from './utils/processUtils';

export class GoVersion {
	public sv?: semver.SemVer;
	// Go version tags are not following the strict semver format
	// so semver drops the prerelease tags used in Go version.
	// If sv is valid, let's keep the original version string
	// including the prerelease tag parts.
	public svString?: string;

	public isDevel?: boolean;
	private devVersion?: string;

	constructor(public binaryPath: string, public version: string) {
		const matchesRelease = /^go version go(\d\.\d+\S*)\s+/.exec(version);
		const matchesDevel = /^go version devel go(\d\.\d+\S*)\s+/.exec(version);
		if (matchesRelease) {
			// note: semver.parse does not work with Go version string like go1.14.
			const sv = semver.coerce(matchesRelease[1]);
			if (sv) {
				this.sv = sv;
				this.svString = matchesRelease[1];
			}
		} else if (matchesDevel) {
			this.isDevel = true;
			this.devVersion = matchesDevel[1];
		}
	}

	public isValid(): boolean {
		return !!this.sv || !!this.isDevel;
	}

	public format(includePrerelease?: boolean): string {
		if (this.sv) {
			if (includePrerelease && this.svString) {
				return this.svString;
			}
			return this.sv.format();
		}
		if (this.isDevel) {
			return `devel ${this.devVersion}`;
		}
		return 'unknown';
	}

	public lt(version: string): boolean {
		// Assume a developer version is always above any released version.
		// This is not necessarily true.
		if (this.isDevel || !this.sv) {
			return false;
		}
		const v = semver.coerce(version);
		if (!v) {
			return false;
		}
		return semver.lt(this.sv, v);
	}

	public gt(version: string): boolean {
		// Assume a developer version is always above any released version.
		// This is not necessarily true.
		if (this.isDevel || !this.sv) {
			return true;
		}
		const v = semver.coerce(version);
		if (!v) {
			return false;
		}
		return semver.gt(this.sv, v);
	}
}

let cachedGoBinPath: string | undefined;
let cachedGoVersion: GoVersion | undefined;
let toolsGopath: string;

// getCheckForToolsUpdatesConfig returns go.toolsManagement.checkForUpdates configuration.
export function getCheckForToolsUpdatesConfig(gocfg: vscode.WorkspaceConfiguration) {
	return gocfg.get('toolsManagement.checkForUpdates') as string;
}

export function byteOffsetAt(document: vscode.TextDocument, position: vscode.Position): number {
	const offset = document.offsetAt(position);
	const text = document.getText();
	return Buffer.byteLength(text.substr(0, offset));
}

export interface Prelude {
	imports: Array<{ kind: string; start: number; end: number; pkgs: string[] }>;
	pkg: { start: number; end: number; name: string } | null;
}

export function parseFilePrelude(text: string): Prelude {
	const lines = text.split('\n');
	const ret: Prelude = { imports: [], pkg: null };
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const pkgMatch = line.match(/^(\s)*package(\s)+(\w+)/);
		if (pkgMatch) {
			ret.pkg = { start: i, end: i, name: pkgMatch[3] };
		}
		if (line.match(/^(\s)*import(\s)+\(/)) {
			ret.imports.push({ kind: 'multi', start: i, end: -1, pkgs: [] });
		} else if (line.match(/^\s*import\s+"C"/)) {
			ret.imports.push({ kind: 'pseudo', start: i, end: i, pkgs: [] });
		} else if (line.match(/^(\s)*import(\s)+[^(]/)) {
			ret.imports.push({ kind: 'single', start: i, end: i, pkgs: [] });
		}
		if (line.match(/^(\s)*(\/\*.*\*\/)*\s*\)/)) {
			// /* comments */
			if (ret.imports[ret.imports.length - 1].end === -1) {
				ret.imports[ret.imports.length - 1].end = i;
			}
		} else if (ret.imports.length) {
			if (ret.imports[ret.imports.length - 1].end === -1) {
				const importPkgMatch = line.match(/"([^"]+)"/);
				if (importPkgMatch) {
					ret.imports[ret.imports.length - 1].pkgs.push(importPkgMatch[1]);
				}
			}
		}

		if (line.match(/^(\s)*(func|const|type|var)\s/)) {
			break;
		}
	}
	return ret;
}

/**
 * Gets version of Go based on the output of the command `go version`.
 * Throws if go version can't be determined because go is not available
 * or `go version` fails.
 * If GOTOOLCHAIN is provided, it will be used to set GOTOOLCHAIN env var.
 * For example, getGoVersion(binPath, 'local') can be used to query
 * the local toolchain's go version regardless of the go version specified
 * in the workspace go.mod or go.work.
 */
export async function getGoVersion(goBinPath?: string, GOTOOLCHAIN?: string): Promise<GoVersion> {
	// TODO(hyangah): limit the number of concurrent getGoVersion call.
	// When the extension starts, at least 4 concurrent calls race
	// and end up calling `go version`.

	const goRuntimePath = goBinPath ?? getBinPath('go');

	const error = (msg: string) => {
		outputChannel.appendLine(msg);
		console.warn(msg);
		return new Error(msg);
	};

	if (!goRuntimePath) {
		throw error(`unable to locate "go" binary in GOROOT (${getCurrentGoRoot()}) or PATH (${getEnvPath()})`);
	}
	if (GOTOOLCHAIN === undefined && cachedGoBinPath === goRuntimePath && cachedGoVersion) {
		if (cachedGoVersion.isValid()) {
			return Promise.resolve(cachedGoVersion);
		}
		// Don't throw an the error. Continue and recompute go version.
		error(`cached Go version (${JSON.stringify(cachedGoVersion)}) is invalid, recomputing`);
	}
	const docUri = vscode.window.activeTextEditor?.document.uri;
	const cwd = getWorkspaceFolderPath(docUri && docUri.fsPath.endsWith('.go') ? docUri : undefined);

	let goVersion: GoVersion | undefined;
	try {
		const env = toolExecutionEnvironment();
		if (GOTOOLCHAIN !== undefined) {
			env['GOTOOLCHAIN'] = GOTOOLCHAIN;
		}
		const execFile = util.promisify(cp.execFile);
		const { stdout, stderr } = await execFile(goRuntimePath, ['version'], { env, cwd });
		if (stderr) {
			error(`failed to run "${goRuntimePath} version": stdout: ${stdout}, stderr: ${stderr}`);
		}
		goVersion = new GoVersion(goRuntimePath, stdout);
	} catch (err) {
		throw error(`failed to run "${goRuntimePath} version": ${err} cwd: ${cwd}`);
	}
	if (!goBinPath && GOTOOLCHAIN === undefined) {
		// if getGoVersion was called with a given goBinPath or an explicit GOTOOLCHAIN env var, don't cache the result.
		cachedGoBinPath = goRuntimePath;
		cachedGoVersion = goVersion;
		if (!cachedGoVersion.isValid()) {
			error(`unable to determine version from the output of "${goRuntimePath} version": "${goVersion.svString}"`);
		}
	}
	return goVersion;
}

/**
 * Returns the output of `go env` from the specified directory.
 * Throws an error if the command fails.
 */
export async function getGoEnv(cwd?: string): Promise<string> {
	const goRuntime = getBinPath('go');
	const execFile = util.promisify(cp.execFile);
	const opts = { cwd, env: toolExecutionEnvironment() };
	const { stdout, stderr } = await execFile(goRuntime, ['env'], opts);
	if (stderr) {
		throw new Error(`failed to run 'go env': ${stderr}`);
	}
	return stdout;
}

/**
 * Returns boolean indicating if GOPATH is set or not
 * If not set, then prompts user to do set GOPATH
 */
export function isGoPathSet(): boolean {
	if (!getCurrentGoPath()) {
		// TODO(hyangah): is it still possible after go1.8? (https://golang.org/doc/go1.8#gopath)
		vscode.window
			.showInformationMessage(
				'Set GOPATH environment variable and restart VS Code or set GOPATH in Workspace settings',
				'Set GOPATH in Workspace Settings'
			)
			.then((selected) => {
				if (selected === 'Set GOPATH in Workspace Settings') {
					vscode.commands.executeCommand('workbench.action.openWorkspaceSettings');
				}
			});
		return false;
	}

	return true;
}

export function getToolsGopath(useCache = true): string {
	if (!useCache || !toolsGopath) {
		toolsGopath = resolveToolsGopath();
	}
	return toolsGopath;
}

function resolveToolsGopath(): string {
	let toolsGopathForWorkspace = substituteEnv(getGoConfig()['toolsGopath'] || '');

	// In case of single root
	if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length <= 1) {
		return resolvePath(toolsGopathForWorkspace);
	}

	// In case of multi-root, resolve ~ and ${workspaceFolder}
	if (toolsGopathForWorkspace.startsWith('~')) {
		toolsGopathForWorkspace = path.join(os.homedir(), toolsGopathForWorkspace.substr(1));
	}
	if (
		toolsGopathForWorkspace &&
		toolsGopathForWorkspace.trim() &&
		!/\${workspaceFolder}|\${workspaceRoot}/.test(toolsGopathForWorkspace)
	) {
		return toolsGopathForWorkspace;
	}

	if (!vscode.workspace.isTrusted) {
		return toolsGopathForWorkspace;
	}

	// If any of the folders in multi root have toolsGopath set and the workspace is trusted, use it.
	for (const folder of vscode.workspace.workspaceFolders) {
		let toolsGopathFromConfig = <string>getGoConfig(folder.uri).inspect('toolsGopath')?.workspaceFolderValue;
		toolsGopathFromConfig = resolvePath(toolsGopathFromConfig, folder.uri.fsPath);
		if (toolsGopathFromConfig) {
			return toolsGopathFromConfig;
		}
	}
	return toolsGopathForWorkspace;
}

// getBinPath returns the path to the tool.
export function getBinPath(tool: string, useCache = true): string {
	const r = getBinPathWithExplanation(tool, useCache);
	return r.binPath;
}

// getBinPathWithExplanation returns the path to the tool, and the explanation on why
// the path was chosen. See getBinPathWithPreferredGopathGorootWithExplanation for details.
export function getBinPathWithExplanation(
	tool: string,
	useCache = true,
	uri?: vscode.Uri
): { binPath: string; why?: string } {
	const cfg = getGoConfig(uri);
	const alternateTools: { [key: string]: string } | undefined = cfg.get('alternateTools');
	const alternateToolPath: string | undefined = alternateTools?.[tool];

	const goroot = cfg.get<string>('goroot');
	const gorootInSetting = goroot && resolvePath(substituteEnv(goroot));

	let selectedGoPath: string | undefined;
	if (tool === 'go' && !gorootInSetting) {
		selectedGoPath = getFromWorkspaceState('selectedGo')?.binpath;
	}

	return getBinPathWithPreferredGopathGorootWithExplanation(
		tool,
		tool === 'go' ? [] : [getToolsGopath(), getCurrentGoPath()],
		tool === 'go' ? gorootInSetting : undefined,
		selectedGoPath ?? (alternateToolPath && resolvePath(substituteEnv(alternateToolPath))),
		useCache
	);
}

export function getFileArchive(document: vscode.TextDocument): string {
	const fileContents = document.getText();
	return document.fileName + '\n' + Buffer.byteLength(fileContents, 'utf8') + '\n' + fileContents;
}

export function substituteEnv(input: string): string {
	return input.replace(/\${env:([^}]+)}/g, (match, capture) => {
		return process.env[capture.trim()] || '';
	});
}

let currentGopath = '';
export function getCurrentGoPath(workspaceUri?: vscode.Uri): string {
	const activeEditorUri = vscode.window.activeTextEditor?.document.uri;
	const currentFilePath = fixDriveCasingInWindows(activeEditorUri?.fsPath ?? '');
	const currentRoot = (workspaceUri && workspaceUri.fsPath) || getWorkspaceFolderPath(activeEditorUri) || '';
	const config = getGoConfig(workspaceUri || activeEditorUri);

	// Infer the GOPATH from the current root or the path of the file opened in current editor
	// Last resort: Check for the common case where GOPATH itself is opened directly in VS Code
	let inferredGopath: string | undefined;
	if (config['inferGopath'] === true) {
		inferredGopath = getInferredGopath(currentRoot) || getInferredGopath(currentFilePath);
		if (!inferredGopath) {
			try {
				if (fs.statSync(path.join(currentRoot, 'src')).isDirectory()) {
					inferredGopath = currentRoot;
				}
			} catch (e) {
				// No op
			}
		}
		if (inferredGopath) {
			// inferred GOPATH must not have go.mod in it.
			try {
				if (fs.existsSync(path.join(inferredGopath, 'go.mod'))) {
					inferredGopath = '';
				}
			} catch (e) {
				// No op
			}
		}
		if (inferredGopath && process.env['GOPATH'] && inferredGopath !== process.env['GOPATH']) {
			inferredGopath += path.delimiter + process.env['GOPATH'];
		}
	}

	const configGopath = config['gopath'] ? resolvePath(substituteEnv(config['gopath']), currentRoot) : '';
	currentGopath = (inferredGopath ? inferredGopath : configGopath || process.env['GOPATH']) ?? '';
	return currentGopath;
}

export function getModuleCache(): string | undefined {
	if (process.env['GOMODCACHE']) {
		return process.env['GOMODCACHE'];
	}
	if (currentGopath) {
		return path.join(currentGopath.split(path.delimiter)[0], 'pkg', 'mod');
	}
}

export function getExtensionCommands(): any[] {
	const pkgJSON = vscode.extensions.getExtension(extensionId)?.packageJSON;
	if (!pkgJSON.contributes || !pkgJSON.contributes.commands) {
		return [];
	}
	const extensionCommands: any[] = vscode.extensions
		.getExtension(extensionId)
		?.packageJSON.contributes.commands.filter((x: any) => x.command !== 'go.show.commands');
	return extensionCommands;
}

export class LineBuffer {
	private buf = '';
	private lineListeners: { (line: string): void }[] = [];
	private lastListeners: { (last: string | null): void }[] = [];

	public append(chunk: string) {
		this.buf += chunk;
		for (;;) {
			const idx = this.buf.indexOf('\n');
			if (idx === -1) {
				break;
			}

			this.fireLine(this.buf.substring(0, idx));
			this.buf = this.buf.substring(idx + 1);
		}
	}

	public done() {
		this.fireDone(this.buf !== '' ? this.buf : null);
	}

	public onLine(listener: (line: string) => void) {
		this.lineListeners.push(listener);
	}

	public onDone(listener: (last: string | null) => void) {
		this.lastListeners.push(listener);
	}

	private fireLine(line: string) {
		this.lineListeners.forEach((listener) => listener(line));
	}

	private fireDone(last: string | null) {
		this.lastListeners.forEach((listener) => listener(last));
	}
}

/**
 * Expands ~ to homedir in non-Windows platform and resolves
 * ${workspaceFolder}, ${workspaceRoot} and ${workspaceFolderBasename}
 */
export function resolvePath(inputPath: string, workspaceFolder?: string): string {
	if (!inputPath || !inputPath.trim()) {
		return inputPath;
	}

	if (!workspaceFolder && vscode.workspace.workspaceFolders) {
		workspaceFolder = getWorkspaceFolderPath(
			vscode.window.activeTextEditor && vscode.window.activeTextEditor.document.uri
		);
	}

	if (workspaceFolder) {
		inputPath = inputPath.replace(/\${workspaceFolder}|\${workspaceRoot}/g, workspaceFolder);
		inputPath = inputPath.replace(/\${workspaceFolderBasename}/g, path.basename(workspaceFolder));
	}
	return resolveHomeDir(inputPath);
}

/**
 * Returns the import path in a passed in string.
 * @param text The string to search for an import path
 */
export function getImportPath(text: string): string {
	// Catch cases like `import alias "importpath"` and `import "importpath"`
	const singleLineImportMatches = text.match(/^\s*import\s+([a-z,A-Z,_,.]\w*\s+)?"([^"]+)"/);
	if (singleLineImportMatches) {
		return singleLineImportMatches[2];
	}

	// Catch cases like `alias "importpath"` and "importpath"
	const groupImportMatches = text.match(/^\s*([a-z,A-Z,_,.]\w*\s+)?"([^"]+)"/);
	if (groupImportMatches) {
		return groupImportMatches[2];
	}

	return '';
}

export interface ICheckResult {
	file: string;
	line: number;
	col: number | undefined;
	msg: string;
	severity: string;
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
				killProcessTree(p);
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
				outputChannel.appendLine([cwd + '>Finished running tool:', cmd, ...args].join(' '));

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
					outputChannel.appendLine(`${filePath}:${line}:${col ?? ''} ${msg}`);
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
				outputChannel.appendLine('');
				resolve(ret);
			} catch (e) {
				reject(e);
			}
		});
	});
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

export function getWorkspaceFolderPath(fileUri?: vscode.Uri): string | undefined {
	if (fileUri) {
		const workspace = vscode.workspace.getWorkspaceFolder(fileUri);
		if (workspace) {
			return fixDriveCasingInWindows(workspace.uri.fsPath);
		}
	}

	// fall back to the first workspace
	const folders = vscode.workspace.workspaceFolders;
	if (folders && folders.length) {
		return fixDriveCasingInWindows(folders[0].uri.fsPath);
	}
	return undefined;
}

export function rmdirRecursive(dir: string) {
	if (fs.existsSync(dir)) {
		fs.readdirSync(dir).forEach((file) => {
			const relPath = path.join(dir, file);
			if (fs.lstatSync(relPath).isDirectory()) {
				rmdirRecursive(relPath);
			} else {
				try {
					fs.unlinkSync(relPath);
				} catch (err) {
					console.log(`failed to remove ${relPath}: ${err}`);
				}
			}
		});
		fs.rmdirSync(dir);
	}
}

let tmpDir: string | undefined;

/**
 * Returns file path for given name in temp dir
 * @param name Name of the file
 */
export function getTempFilePath(name: string): string {
	if (!tmpDir) {
		tmpDir = fs.mkdtempSync(os.tmpdir() + path.sep + 'vscode-go');
	}

	if (!fs.existsSync(tmpDir)) {
		fs.mkdirSync(tmpDir);
	}

	return path.normalize(path.join(tmpDir, name));
}

export function cleanupTempDir() {
	if (tmpDir) {
		rmdirRecursive(tmpDir);
	}
	tmpDir = undefined;
}
