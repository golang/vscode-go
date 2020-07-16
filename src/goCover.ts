/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

'use strict';

import fs = require('fs');
import path = require('path');
import vscode = require('vscode');
import { isModSupported } from './goModules';
import { getImportPathToFolder } from './goPackages';
import { getTestFlags, goTest, showTestOutput, TestConfig } from './testUtils';
import { getGoConfig } from './util';

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

let coverageData: { [key: string]: CoverageData } = {};  // actual file path to the coverage data.
let isCoverageApplied: boolean = false;

/**
 * Clear the coverage on all files
 */
function clearCoverage() {
	coverageData = {};
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
			const coveragePath = new Map<string, CoverageData>();  // <filename> from the cover profile to the coverage data.

			// Clear existing coverage files
			clearCoverage();

			// collect the packages named in the coverage file
			const seenPaths = new Set<string>();
			// for now read synchronously and hope for no errors
			const contents = fs.readFileSync(coverProfilePath).toString();
			contents.split('\n').forEach((line) => {
				// go test coverageprofile generates output:
				//    filename:StartLine.StartColumn,EndLine.EndColumn Hits CoverCount
				// where the filename is either the import path + '/' + base file name, or
				// the actual file path (either absolute or starting with .)
				// See https://golang.org/issues/40251.
				//
				// The first line will be like "mode: set" which we will ignore.
				const parse = line.match(/([^:]+)\:([\d]+)\.([\d]+)\,([\d]+)\.([\d]+)\s([\d]+)\s([\d]+)/);
				if (!parse) { return; }
				const lastSlash = parse[1].lastIndexOf('/');
				if (lastSlash !== -1) {
					seenPaths.add(parse[1].slice(0, lastSlash));
				}

				// and fill in coveragePath
				const coverage = coveragePath.get(parse[1]) || { coveredRange: [], uncoveredRange: [] };
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
				coveragePath.set(parse[1], coverage);
			});

			getImportPathToFolder([...seenPaths], testDir)
				.then((pathsToDirs) => {
				createCoverageData(pathsToDirs, coveragePath);
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

function createCoverageData(
	pathsToDirs: Map<string, string>,
	coveragePath: Map<string, CoverageData>) {

	coveragePath.forEach((cd, ip) => {
		const lastSlash = ip.lastIndexOf('/');
		if (lastSlash === -1) {  // malformed
			console.log(`invalid entry: ${ip}`);
			return;
		}
		const importPath = ip.slice(0, lastSlash);
		let fileDir = importPath;
		if (path.isAbsolute(importPath)) {
			// This is the true file path.
		} else if (importPath.startsWith('.')) {
			fileDir = path.resolve(fileDir);
		} else {
			// This is the package import path.
			// we need to look up `go list` output stored in pathsToDir.
			fileDir = pathsToDirs.get(importPath) || importPath;
		}
		const file = fileDir + path.sep + ip.slice(lastSlash + 1);
		setCoverageDataByFilePath(file, cd);
	});
}

/**
 * Set the object that holds the coverage data for given file path.
 * @param filePath
 * @param data
 */
function setCoverageDataByFilePath(filePath: string, data: CoverageData) {
	if (filePath.startsWith('_')) {
		filePath = filePath.substr(1);
	}
	if (process.platform === 'win32') {
		const parts = filePath.split('/');
		if (parts.length) {
			filePath = parts.join(path.sep);
		}
	}
	coverageData[filePath] = data;
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
	for (const filename in coverageData) {
		if (editor.document.uri.fsPath.endsWith(filename)) {
			isCoverageApplied = true;
			const cd = coverageData[filename];
			if (coverageOptions === 'showCoveredCodeOnly' || coverageOptions === 'showBothCoveredAndUncoveredCode') {
				editor.setDecorations(
					decorators.type === 'gutter'
						? decorators.coveredGutterDecorator
						: decorators.coveredHighlightDecorator,
					cd.coveredRange
				);
			}

			if (coverageOptions === 'showUncoveredCodeOnly' || coverageOptions === 'showBothCoveredAndUncoveredCode') {
				editor.setDecorations(
					decorators.type === 'gutter'
						? decorators.uncoveredGutterDecorator
						: decorators.uncoveredHighlightDecorator,
					cd.uncoveredRange
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
	return coverageData;
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
