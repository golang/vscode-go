/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

'use strict';

import cp = require('child_process');
import fs = require('fs');
import path = require('path');
import util = require('util');
import vscode = require('vscode');
import { isModSupported } from './goModules';
import { envPath } from './goPath';
import { getTestFlags, goTest, showTestOutput, TestConfig } from './testUtils';
import { getBinPath, getCurrentGoPath, getGoConfig, getWorkspaceFolderPath } from './util';

let gutterSvgs: { [key: string]: string };
let decorators: {
	type: string;
	coveredGutterDecorator: vscode.TextEditorDecorationType;
	uncoveredGutterDecorator: vscode.TextEditorDecorationType;
	coveredHighlightDecorator: vscode.TextEditorDecorationType;
	uncoveredHighlightDecorator: vscode.TextEditorDecorationType;
};
let decoratorConfig: {
	[key: string]: any;
	type: string;
	coveredHighlightColor: string;
	uncoveredHighlightColor: string;
	coveredGutterStyle: string;
	uncoveredGutterStyle: string;
};
// a list of modified, unsaved go files with actual code edits (rather than comment edits)
let modifiedFiles: {
	[key: string]: boolean;
} = {};

/**
 * Initializes the decorators used for Code coverage.
 * @param ctx The extension context
 */
export function initCoverageDecorators(ctx: vscode.ExtensionContext) {
	// Initialize gutter svgs
	gutterSvgs = {
		blockred: ctx.asAbsolutePath('images/gutter-blockred.svg'),
		blockgreen: ctx.asAbsolutePath('images/gutter-blockgreen.svg'),
		blockblue: ctx.asAbsolutePath('images/gutter-blockblue.svg'),
		blockyellow: ctx.asAbsolutePath('images/gutter-blockyellow.svg'),
		slashred: ctx.asAbsolutePath('images/gutter-slashred.svg'),
		slashgreen: ctx.asAbsolutePath('images/gutter-slashgreen.svg'),
		slashblue: ctx.asAbsolutePath('images/gutter-slashblue.svg'),
		slashyellow: ctx.asAbsolutePath('images/gutter-slashyellow.svg'),
		verticalred: ctx.asAbsolutePath('images/gutter-vertred.svg'),
		verticalgreen: ctx.asAbsolutePath('images/gutter-vertgreen.svg'),
		verticalblue: ctx.asAbsolutePath('images/gutter-vertblue.svg'),
		verticalyellow: ctx.asAbsolutePath('images/gutter-vertyellow.svg')
	};

	// Update the coverageDecorator in User config, if they are using the old style.
	const goConfig = getGoConfig();
	const inspectResult = goConfig.inspect('coverageDecorator');
	if (inspectResult) {
		if (typeof inspectResult.globalValue === 'string') {
			goConfig.update(
				'coverageDecorator',
				{ type: inspectResult.globalValue },
				vscode.ConfigurationTarget.Global
			);
		}
		if (typeof inspectResult.workspaceValue === 'string') {
			goConfig.update(
				'coverageDecorator',
				{ type: inspectResult.workspaceValue },
				vscode.ConfigurationTarget.Workspace
			);
		}
		if (typeof inspectResult.workspaceFolderValue === 'string') {
			goConfig.update(
				'coverageDecorator',
				{ type: inspectResult.workspaceValue },
				vscode.ConfigurationTarget.WorkspaceFolder
			);
		}
	}

	// Update the decorators
	updateCodeCoverageDecorators(goConfig.get('coverageDecorator'));
}

/**
 * Updates the decorators used for Code coverage.
 * @param coverageDecoratorConfig The coverage decorated as configured by the user
 */
export function updateCodeCoverageDecorators(coverageDecoratorConfig: any) {
	// These defaults are chosen to be distinguishable in nearly any color scheme (even Red)
	// as well as by people who have difficulties with color perception.
	// (how do these relate the defaults in package.json?)
	// and where do the defaults actually come from? (raised as issue #256)
	decoratorConfig = {
		type: 'highlight',
		coveredHighlightColor: 'rgba(64,128,128,0.5)',
		uncoveredHighlightColor: 'rgba(128,64,64,0.25)',
		coveredGutterStyle: 'blockblue',
		uncoveredGutterStyle: 'slashyellow'
	};

	// Update from configuration
	if (typeof coverageDecoratorConfig === 'string') {
		decoratorConfig.type = coverageDecoratorConfig;
	} else {
		for (const k in coverageDecoratorConfig) {
			if (coverageDecoratorConfig.hasOwnProperty(k)) {
				decoratorConfig[k] = coverageDecoratorConfig[k];
			}
		}
	}
	setDecorators();
	vscode.window.visibleTextEditors.forEach(applyCodeCoverage);
}

function setDecorators() {
	disposeDecorators();
	decorators = {
		type: decoratorConfig.type,
		coveredGutterDecorator: vscode.window.createTextEditorDecorationType({
			gutterIconPath: gutterSvgs[decoratorConfig.coveredGutterStyle]
		}),
		uncoveredGutterDecorator: vscode.window.createTextEditorDecorationType({
			gutterIconPath: gutterSvgs[decoratorConfig.uncoveredGutterStyle]
		}),
		coveredHighlightDecorator: vscode.window.createTextEditorDecorationType({
			backgroundColor: decoratorConfig.coveredHighlightColor
		}),
		uncoveredHighlightDecorator: vscode.window.createTextEditorDecorationType({
			backgroundColor: decoratorConfig.uncoveredHighlightColor
		})
	};
}

/**
 * Disposes decorators so that the current coverage is removed from the editor.
 */
function disposeDecorators() {
	if (decorators) {
		decorators.coveredGutterDecorator.dispose();
		decorators.uncoveredGutterDecorator.dispose();
		decorators.coveredHighlightDecorator.dispose();
		decorators.uncoveredHighlightDecorator.dispose();
	}
}

interface CoverageData {
	uncoveredRange: vscode.Range[];
	coveredRange: vscode.Range[];
}

let coverageFiles: { [key: string]: CoverageData } = {};
let coveragePath = new Map<string, CoverageData>();
let pathsToDirs = new Map<string, string>();
let isCoverageApplied: boolean = false;

/**
 * Clear the coverage on all files
 */
function clearCoverage() {
	coverageFiles = {};
	coveragePath = new Map<string, CoverageData>();
	pathsToDirs = new Map<string, string>();
	disposeDecorators();
	isCoverageApplied = false;
}

/**
 * Extract the coverage data from the given cover profile & apply them on the files in the open editors.
 * @param coverProfilePath Path to the file that has the cover profile data
 * @param packageDirPath Absolute path of the package for which the coverage was calculated
 * @param testDir Directory to execute go list in, when there is no workspace, for some tests
 */
export function applyCodeCoverageToAllEditors(coverProfilePath: string, testDir?: string): Promise<void> {
	const v = new Promise<void>((resolve, reject) => {
		try {
			// Clear existing coverage files
			clearCoverage();

			// collect the packages named in the coverage file
			const seenPaths = new Set<string>();
			// for now read synchronously and hope for no errors
			const contents = fs.readFileSync(coverProfilePath).toString();
			contents.split('\n').forEach((line) => {
				const parse = line.match(/([^:]+)\:([\d]+)\.([\d]+)\,([\d]+)\.([\d]+)\s([\d]+)\s([\d]+)/);
				if (!parse) { return; }
				const lastSlash = parse[1].lastIndexOf('/'); // ok for windows?
				if (lastSlash !== -1) {
					seenPaths.add(parse[1].slice(0, lastSlash));
				}

				// and fill in coveragePath
				const coverage = getPathData(parse[1]);
				const range = new vscode.Range(
					// Start Line converted to zero based
					parseInt(parse[2], 10) - 1,
					// Start Column converted to zero based
					parseInt(parse[3], 10) - 1,
					// End Line converted to zero based
					parseInt(parse[4], 10) - 1,
					// End Column converted to zero based
					parseInt(parse[5], 10) - 1
				);
				// If is Covered (CoverCount > 0)
				if (parseInt(parse[7], 10) > 0) {
					coverage.coveredRange.push(range);
				} else {
					coverage.uncoveredRange.push(range);
				}
				setPathData(parse[1], coverage);
			});
			const pathPromise = getPathsToDirs(seenPaths, pathsToDirs, testDir);
			pathPromise.then(() => {
				createCoverageData();
				setDecorators();
				vscode.window.visibleTextEditors.forEach(applyCodeCoverage);
				resolve();
			});
		} catch (e) {
			vscode.window.showInformationMessage(e.msg);
			reject(e);
		}
	});
	return v;
}

/**
 * Get the object that holds the coverage data for given file path.
 * @param filePath
 */
function getCoverageData(filePath: string): CoverageData {
	if (filePath.startsWith('_')) {
		filePath = filePath.substr(1);
	}
	if (process.platform === 'win32') {
		const parts = filePath.split('/');
		if (parts.length) {
			filePath = parts.join(path.sep);
		}
	}
	return coverageFiles[filePath] || { coveredRange: [], uncoveredRange: [] };
}

/**
 * Get the CoverageData for an import path.
 * @param importPath
 */
function getPathData(importPath: string): CoverageData {
	return coveragePath.get(importPath) || { coveredRange: [], uncoveredRange: [] };
}

/**
 * Set the CoverageData for an import path.
 * @param importPath
 * @param data
 */
function setPathData(importPath: string, data: CoverageData) {
	coveragePath.set(importPath, data);
}

function createCoverageData() {
	coveragePath.forEach((cd, ip) => {
		const lastSlash = ip.lastIndexOf('/');
		const importPath = ip.slice(0, lastSlash);
		const fileDir = pathsToDirs.get(importPath);
		const file = fileDir + ip.slice(lastSlash); // what about Windows?
		setCoverageData(file, cd);
	});
}

/**
 * Set the object that holds the coverage data for given file path.
 * @param filePath
 * @param data
 */
function setCoverageData(filePath: string, data: CoverageData) {
	if (filePath.startsWith('_')) {
		filePath = filePath.substr(1);
	}
	if (process.platform === 'win32') {
		const parts = filePath.split('/');
		if (parts.length) {
			filePath = parts.join(path.sep);
		}
	}
	coverageFiles[filePath] = data;
}

/**
 * Apply the code coverage highlighting in given editor
 * @param editor
 */
export function applyCodeCoverage(editor: vscode.TextEditor) {
	if (!editor || editor.document.languageId !== 'go' || editor.document.fileName.endsWith('_test.go')) {
		return;
	}

	const cfg = getGoConfig(editor.document.uri);
	const coverageOptions = cfg['coverageOptions'];
	for (const filename in coverageFiles) {
		if (editor.document.uri.fsPath.endsWith(filename)) {
			isCoverageApplied = true;
			const coverageData = coverageFiles[filename];
			if (coverageOptions === 'showCoveredCodeOnly' || coverageOptions === 'showBothCoveredAndUncoveredCode') {
				editor.setDecorations(
					decorators.type === 'gutter'
						? decorators.coveredGutterDecorator
						: decorators.coveredHighlightDecorator,
					coverageData.coveredRange
				);
			}

			if (coverageOptions === 'showUncoveredCodeOnly' || coverageOptions === 'showBothCoveredAndUncoveredCode') {
				editor.setDecorations(
					decorators.type === 'gutter'
						? decorators.uncoveredGutterDecorator
						: decorators.uncoveredHighlightDecorator,
					coverageData.uncoveredRange
				);
			}
		}
	}
}

/**
 * Listener for file save that clears potential stale coverage data.
 * Local cache tracks files with changes outside of comments to determine
 * files for which the save event can cause stale coverage data.
 * @param e TextDocument
 */
export function removeCodeCoverageOnFileSave(e: vscode.TextDocument) {
	if (e.languageId !== 'go' || !isCoverageApplied) {
		return;
	}

	if (vscode.window.visibleTextEditors.every((editor) => editor.document !== e)) {
		return;
	}

	if (modifiedFiles[e.fileName]) {
		clearCoverage();
		modifiedFiles = {}; // reset the list of modified files
	}
}

/**
 * Listener for file change that tracks files with changes outside of comments
 * to determine files for which an eventual save can cause stale coverage data.
 * @param e TextDocumentChangeEvent
 */
export function trackCodeCoverageRemovalOnFileChange(e: vscode.TextDocumentChangeEvent) {
	if (e.document.languageId !== 'go' || !e.contentChanges.length || !isCoverageApplied) {
		return;
	}

	if (vscode.window.visibleTextEditors.every((editor) => editor.document !== e.document)) {
		return;
	}

	if (isPartOfComment(e)) {
		return;
	}

	modifiedFiles[e.document.fileName] = true;
}

/**
 * Fill the map of directory paths corresponding to input package paths
 * @param set Set<string> of import package paths
 */
async function getPathsToDirs(set: Set<string>, res: Map<string, string>, testDir?: string) {
	const goRuntimePath = getBinPath('go');
	if (!goRuntimePath) {
		vscode.window.showErrorMessage(
			`Failed to run, as the "go" binary cannot be found in either GOROOT(${process.env['GOROOT']}) or PATH(${envPath})`
		);
	}
	const args: string[] = ['list', '-f', '{{.ImportPath}}:{{.Dir}}'];
	set.forEach((s) => args.push(s));

	const options: { [key: string]: any } = {
		env: Object.assign({}, process.env, { GOPATH: getCurrentGoPath() })
	};
	const workDir = getWorkspaceFolderPath();
	// If there is a workDir then probably it is what we want
	// Otherwise maybe a test suggested a directory.
	if (workDir) {
		options['cwd'] = workDir;
	} else if (testDir) {
		options['cwd'] = testDir;
	}

	const execFile = util.promisify(cp.execFile);
	const { stdout } = await execFile(goRuntimePath, args, options);
	stdout.split('\n').forEach((line) => {
		const flds = line.split(':');
		if (flds.length !== 2) { return; }
		res.set(flds[0], flds[1]);
	});
}

/**
 * If current editor has Code coverage applied, then remove it.
 * Else run tests to get the coverage and apply.
 */
export async function toggleCoverageCurrentPackage() {
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		vscode.window.showInformationMessage('No editor is active.');
		return;
	}

	if (isCoverageApplied) {
		clearCoverage();
		return;
	}

	const goConfig = getGoConfig();
	const cwd = path.dirname(editor.document.uri.fsPath);

	const testFlags = getTestFlags(goConfig);
	const isMod = await isModSupported(editor.document.uri);
	const testConfig: TestConfig = {
		goConfig,
		dir: cwd,
		flags: testFlags,
		background: true,
		isMod,
		applyCodeCoverage: true
	};

	return goTest(testConfig).then((success) => {
		if (!success) {
			showTestOutput();
		}
	});
}

export function isPartOfComment(e: vscode.TextDocumentChangeEvent): boolean {
	return e.contentChanges.every((change) => {
		// We cannot be sure with using just regex on individual lines whether a multi line change is part of a comment or not
		// So play it safe and treat it as not a comment
		if (!change.range.isSingleLine || change.text.includes('\n')) {
			return false;
		}

		const text = e.document.lineAt(change.range.start).text;
		const idx = text.search('//');
		return idx > -1 && idx <= change.range.start.character;
	});
}

// These routines enable testing without starting an editing session.

export function coverageFilesForTest():  { [key: string]: CoverageData; } {
	return coverageFiles;
}

export function initForTest() {
	if (!decoratorConfig) {
		// this code is unnecessary except for testing, where there may be no workspace
		// nor the normal flow of initializations
		const x = 'rgba(0,0,0,0)';
		if (!gutterSvgs) {
			gutterSvgs = { x };
		}
		decoratorConfig = {
			type: 'highlight',
			coveredHighlightColor: x,
			uncoveredHighlightColor: x,
			coveredGutterStyle: x,
			uncoveredGutterStyle: x
		};
	}
}
