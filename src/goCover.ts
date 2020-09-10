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
import { fixDriveCasingInWindows } from './utils/pathUtils';

let gutterSvgs: { [key: string]: string; };

interface Highlight {
	top: vscode.TextEditorDecorationType;
	mid: vscode.TextEditorDecorationType;
	bot: vscode.TextEditorDecorationType;
	all: vscode.TextEditorDecorationType;
}

let decorators: {
	type: 'highlight' | 'gutter';
	coveredGutter: vscode.TextEditorDecorationType;
	uncoveredGutter: vscode.TextEditorDecorationType;
	coveredHighlight: Highlight;
	uncoveredHighlight: Highlight;
};

let decoratorConfig: {
	[key: string]: any;
	type: 'highlight' | 'gutter';
	coveredHighlightColor: string;
	uncoveredHighlightColor: string;
	coveredBorderColor: string;
	uncoveredBorderColor: string;
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

	const goConfig = getGoConfig();
	updateCodeCoverageDecorators(goConfig.get('coverageDecorator'));
}

/**
 * Updates the decorators used for Code coverage.
 * @param coverageDecoratorConfig The coverage decorated as configured by the user
 */
export function updateCodeCoverageDecorators(coverageDecoratorConfig: any) {
	// These defaults are chosen to be distinguishable in nearly any color scheme (even Red)
	// as well as by people who have difficulties with color perception.
	// It appears that the contributions in package.json are only used to check what users
	// put in settings.json, while the defaults come from the defaults section of
	// go.coverageDecorator in package.json.
	decoratorConfig = {
		type: 'highlight',
		coveredHighlightColor: 'rgba(64,128,128,0.5)',
		coveredBorderColor: 'rgba(64,128,128,1.0)',
		uncoveredHighlightColor: 'rgba(128,64,64,0.25)',
		uncoveredBorderColor: 'rgba(128,64,64,1.0)',
		coveredGutterStyle: 'blockblue',
		uncoveredGutterStyle: 'slashyellow'
	};

	// Update from configuration.
	if (typeof coverageDecoratorConfig !== 'object') {
		vscode.window.showWarningMessage(`invalid go.coverageDecorator type, expected an 'object'`);
	} else {
		for (const k in coverageDecoratorConfig) {
			if (coverageDecoratorConfig.hasOwnProperty(k)) {
				decoratorConfig[k] = coverageDecoratorConfig[k];
			} else {
				vscode.window.showWarningMessage(`invalid coverage parameter ${k}`);
			}
		}
	}
	setDecorators();
	vscode.window.visibleTextEditors.forEach(applyCodeCoverage);
}

function setDecorators() {
	disposeDecorators();
	if (!decorators) { initForTest(); } // only happens in tests
	const f = (x: { overviewRulerColor: string, backgroundColor: string; }, arg: string) => {
		const y = {
			overviewRulerLane: 2,
			borderStyle: arg,
			borderWidth: '2px',
		};
		return Object.assign(y, x);
	};
	const cov = {
		overviewRulerColor: 'green',
		backgroundColor: decoratorConfig.coveredHighlightColor,
		borderColor: decoratorConfig.coveredBorderColor
	};
	const uncov = {
		overviewRulerColor: 'red',
		backgroundColor: decoratorConfig.uncoveredHighlightColor,
		borderColor: decoratorConfig.uncoveredBorderColor
	};
	const ctop = f(cov, 'solid solid none solid');
	const cmid = f(cov, 'none solid none solid');
	const cbot = f(cov, 'none solid solid solid');
	const cone = f(cov, 'solid solid solid solid');
	const utop = f(uncov, 'solid solid none solid');
	const umid = f(uncov, 'none solid none solid');
	const ubot = f(uncov, 'none solid solid solid');
	const uone = f(uncov, 'solid solid solid solid');
	decorators = {
		type: decoratorConfig.type,
		coveredGutter: vscode.window.createTextEditorDecorationType({
			gutterIconPath: gutterSvgs[decoratorConfig.coveredGutterStyle]
		}),
		uncoveredGutter: vscode.window.createTextEditorDecorationType({
			gutterIconPath: gutterSvgs[decoratorConfig.uncoveredGutterStyle]
		}),
		coveredHighlight: {
			all: vscode.window.createTextEditorDecorationType(cone),
			top: vscode.window.createTextEditorDecorationType(ctop),
			mid: vscode.window.createTextEditorDecorationType(cmid),
			bot: vscode.window.createTextEditorDecorationType(cbot),
		},
		uncoveredHighlight: {
			all: vscode.window.createTextEditorDecorationType(uone),
			top: vscode.window.createTextEditorDecorationType(utop),
			mid: vscode.window.createTextEditorDecorationType(umid),
			bot: vscode.window.createTextEditorDecorationType(ubot)
		},
	};
}

/**
 * Disposes decorators so that the current coverage is removed from the editor.
 */
function disposeDecorators() {
	if (decorators) {
		decorators.coveredGutter.dispose();
		decorators.uncoveredGutter.dispose();
		decorators.coveredHighlight.all.dispose();
		decorators.coveredHighlight.top.dispose();
		decorators.coveredHighlight.mid.dispose();
		decorators.coveredHighlight.bot.dispose();
		decorators.uncoveredHighlight.all.dispose();
		decorators.uncoveredHighlight.top.dispose();
		decorators.uncoveredHighlight.mid.dispose();
		decorators.uncoveredHighlight.bot.dispose();
	}
}

interface CoverageData {
	uncoveredOptions: vscode.DecorationOptions[];
	coveredOptions: vscode.DecorationOptions[];
}

let coverageData: { [key: string]: CoverageData; } = {};  // actual file path to the coverage data.
let isCoverageApplied: boolean = false;

function emptyCoverageData(): CoverageData {
	return {
		uncoveredOptions: [],
		coveredOptions: []
	};
}

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
 * @param dir Directory to execute go list in
 */
export function applyCodeCoverageToAllEditors(coverProfilePath: string, dir: string): Promise<void> {
	const v = new Promise<void>((resolve, reject) => {
		try {
			const showCounts = getGoConfig().get('coverShowCounts') as boolean;
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
				// TODO: port https://golang.org/cl/179377 for faster parsing.

				const parse = line.match(/^(\S+)\:(\d+)\.(\d+)\,(\d+)\.(\d+)\s(\d+)\s(\d+)/);
				if (!parse) { return; }

				let filename = parse[1];
				if (filename.startsWith('.' + path.sep)) {
					// If it's a relative file path, convert it to an absolute path.
					// From now on, we can assume that it's a real file name if it is
					// an absolute path.
					filename = path.resolve(filename);
				}
				// If this is not a real file name, that's package_path + file name,
				// Record it in seenPaths for `go list` call to resolve package path ->
				// directory mapping.
				if (!path.isAbsolute(filename)) {
					const lastSlash = filename.lastIndexOf('/');
					if (lastSlash !== -1) {
						seenPaths.add(filename.slice(0, lastSlash));
					}
				}

				// and fill in coveragePath
				const coverage = coveragePath.get(parse[1]) || emptyCoverageData();
				const range = new vscode.Range(
					// Convert lines and columns to 0-based
					parseInt(parse[2], 10) - 1,
					parseInt(parse[3], 10) - 1,
					parseInt(parse[4], 10) - 1,
					parseInt(parse[5], 10) - 1
				);
				const counts = parseInt(parse[7], 10);
				// If is Covered (CoverCount > 0)
				if (counts > 0) {
					coverage.coveredOptions.push(...elaborate(range, counts, showCounts));
				} else {
					coverage.uncoveredOptions.push(...elaborate(range, counts, showCounts));
				}

				coveragePath.set(filename, coverage);
			});

			getImportPathToFolder([...seenPaths], dir)
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

// add decorations to the range
function elaborate(r: vscode.Range, count: number, showCounts: boolean): vscode.DecorationOptions[] {
	// irrelevant for "gutter"
	if (!decorators || decorators.type === 'gutter') { return [{ range: r }]; }
	const ans: vscode.DecorationOptions[] = [];
	const dc = decoratorConfig;
	const backgroundColor = [dc.uncoveredHighlightColor, dc.coveredHighlightColor];
	const txt: vscode.ThemableDecorationAttachmentRenderOptions = {
		contentText: count > 0 && showCounts ? `--${count}--` : '',
		backgroundColor: backgroundColor[count === 0 ? 0 : 1]
	};
	const v: vscode.DecorationOptions = {
		range: r,
		hoverMessage: `${count} executions`,
		renderOptions: {
			before: txt,
		}
	};
	ans.push(v);
	return ans;
}

function createCoverageData(
	pathsToDirs: Map<string, string>,
	coveragePath: Map<string, CoverageData>) {

	coveragePath.forEach((cd, ip) => {
		if (path.isAbsolute(ip)) {
			setCoverageDataByFilePath(ip, cd);
			return;
		}

		const lastSlash = ip.lastIndexOf('/');
		if (lastSlash === -1) {
			setCoverageDataByFilePath(ip, cd);
			return;
		}

		const maybePkgPath = ip.slice(0, lastSlash);
		const fileDir = pathsToDirs.get(maybePkgPath) || path.resolve(maybePkgPath);
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
	let doc = editor.document.fileName;
	if (path.isAbsolute(doc)) {
		doc = fixDriveCasingInWindows(doc);
	}

	const cfg = getGoConfig(editor.document.uri);
	const coverageOptions = cfg['coverageOptions'];
	for (const filename in coverageData) {
		if (doc !== fixDriveCasingInWindows(filename)) {
			continue;
		}
		isCoverageApplied = true;
		const cd = coverageData[filename];
		if (coverageOptions === 'showCoveredCodeOnly' || coverageOptions === 'showBothCoveredAndUncoveredCode') {
			if (decorators.type === 'gutter') {
				editor.setDecorations(decorators.coveredGutter, cd.coveredOptions);
			} else {
				detailed(editor, decorators.coveredHighlight, cd.coveredOptions);
			}
		}

		if (coverageOptions === 'showUncoveredCodeOnly' || coverageOptions === 'showBothCoveredAndUncoveredCode') {
			if (decorators.type === 'gutter') {
				editor.setDecorations(decorators.uncoveredGutter, cd.uncoveredOptions);
			} else {
				detailed(editor, decorators.uncoveredHighlight, cd.uncoveredOptions);
			}
		}
	}
}

function detailed(editor: vscode.TextEditor, h: Highlight, opts: vscode.DecorationOptions[]) {
	const tops: vscode.DecorationOptions[] = [];
	const mids: vscode.DecorationOptions[] = [];
	const bots: vscode.DecorationOptions[] = [];
	const alls: vscode.DecorationOptions[] = [];
	opts.forEach((opt) => {
		const r = opt.range;
		if (r.start.line === r.end.line) {
			alls.push(opt);
			return;
		}
		for (let line = r.start.line; line <= r.end.line; line++) {
			if (line === r.start.line) {
				const use: vscode.DecorationOptions = {
					range: editor.document.validateRange(
						new vscode.Range(line, r.start.character, line, Number.MAX_SAFE_INTEGER)),
					hoverMessage: opt.hoverMessage,
					renderOptions: opt.renderOptions
				};
				tops.push(use);
			} else if (line < r.end.line) {
				const use = {
					range: editor.document.validateRange(
						new vscode.Range(line, 0, line, Number.MAX_SAFE_INTEGER)),
					hoverMessage: opt.hoverMessage
				};
				mids.push(use);
			} else {
				const use = {
					range: new vscode.Range(line, 0, line, r.end.character),
					hoverMessage: opt.hoverMessage
				};
				bots.push(use);
			}
		}
	});
	if (tops.length > 0) { editor.setDecorations(h.top, tops); }
	if (mids.length > 0) { editor.setDecorations(h.mid, mids); }
	if (bots.length > 0) { editor.setDecorations(h.bot, bots); }
	if (alls.length > 0) { editor.setDecorations(h.all, alls); }
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

export function coverageFilesForTest(): { [key: string]: CoverageData; } {
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
			coveredBorderColor: x,
			uncoveredBorderColor: x,
			coveredGutterStyle: x,
			uncoveredGutterStyle: x
		};
	}
}
