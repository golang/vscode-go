/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable eqeqeq */
/* eslint-disable node/no-unpublished-import */
/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { getGoConfig, getGoplsConfig } from '../../src/config';
import { FilePatch, getEdits, getEditsFromUnifiedDiffStr } from '../../src/diffUtils';
import { check } from '../../src/goCheck';
import {
	generateTestCurrentFile,
	generateTestCurrentFunction,
	generateTestCurrentPackage
} from '../../src/goGenerateTests';
import { updateGoVarsFromConfig } from '../../src/goInstallTools';
import { buildLanguageServerConfig } from '../../src/language/goLanguageServer';
import { goLint } from '../../src/goLint';
import { goPlay } from '../../src/goPlayground';
import { testCurrentFile } from '../../src/commands';
import {
	getBinPath,
	getCurrentGoPath,
	getGoVersion,
	getImportPath,
	GoVersion,
	handleDiagnosticErrors,
	ICheckResult
} from '../../src/util';
import cp = require('child_process');
import os = require('os');
import { MockExtensionContext } from '../mocks/MockContext';

const testAll = (isModuleMode: boolean) => {
	const dummyCancellationSource = new vscode.CancellationTokenSource();

	// suiteSetup will initialize the following vars.
	let gopath: string;
	let repoPath: string;
	let fixturePath: string;
	let fixtureSourcePath: string;
	let generateTestsSourcePath: string;
	let generateFunctionTestSourcePath: string;
	let generatePackageTestSourcePath: string;
	let previousEnv: any;
	let goVersion: GoVersion;

	suiteSetup(async () => {
		previousEnv = Object.assign({}, process.env);
		process.env.GO111MODULE = isModuleMode ? 'on' : 'off';

		await updateGoVarsFromConfig({});

		gopath = getCurrentGoPath();
		if (!gopath) {
			assert.ok(gopath, 'Cannot run tests if GOPATH is not set as environment variable');
			return;
		}
		goVersion = await getGoVersion();

		console.log(`Using GOPATH: ${gopath}`);

		repoPath = isModuleMode ? fs.mkdtempSync(path.join(os.tmpdir(), 'legacy')) : path.join(gopath, 'src', 'test');
		fixturePath = path.join(repoPath, 'testfixture');
		fixtureSourcePath = path.join(__dirname, '..', '..', '..', 'test', 'testdata');
		generateTestsSourcePath = path.join(repoPath, 'generatetests');
		generateFunctionTestSourcePath = path.join(repoPath, 'generatefunctiontest');
		generatePackageTestSourcePath = path.join(repoPath, 'generatePackagetest');

		fs.removeSync(repoPath);
		fs.copySync(fixtureSourcePath, fixturePath, {
			recursive: true
			// TODO(hyangah): should we enable GOPATH mode
		});
		fs.copySync(
			path.join(fixtureSourcePath, 'generatetests', 'generatetests.go'),
			path.join(generateTestsSourcePath, 'generatetests.go')
		);
		fs.copySync(
			path.join(fixtureSourcePath, 'generatetests', 'generatetests.go'),
			path.join(generateFunctionTestSourcePath, 'generatetests.go')
		);
		fs.copySync(
			path.join(fixtureSourcePath, 'generatetests', 'generatetests.go'),
			path.join(generatePackageTestSourcePath, 'generatetests.go')
		);
		fs.copySync(
			path.join(fixtureSourcePath, 'diffTestData', 'file1.go'),
			path.join(fixturePath, 'diffTest1Data', 'file1.go')
		);
		fs.copySync(
			path.join(fixtureSourcePath, 'diffTestData', 'file2.go'),
			path.join(fixturePath, 'diffTest1Data', 'file2.go')
		);
		fs.copySync(
			path.join(fixtureSourcePath, 'diffTestData', 'file1.go'),
			path.join(fixturePath, 'diffTest2Data', 'file1.go')
		);
		fs.copySync(
			path.join(fixtureSourcePath, 'diffTestData', 'file2.go'),
			path.join(fixturePath, 'diffTest2Data', 'file2.go')
		);
	});

	suiteTeardown(() => {
		fs.removeSync(repoPath);
		process.env = previousEnv;
	});

	teardown(() => {
		sinon.restore();
	});

	test('Linting - concurrent process cancelation', async () => {
		const util = require('../../src/util');
		const processutil = require('../../src/utils/processUtils');
		sinon.spy(util, 'runTool');
		sinon.spy(processutil, 'killProcessTree');

		const config = Object.create(getGoConfig(), {
			vetOnSave: { value: 'package' },
			vetFlags: { value: ['-all'] },
			buildOnSave: { value: 'package' },
			lintOnSave: { value: 'package' },
			// simulate a long running lint process by sleeping for a couple seconds
			lintTool: { value: process.platform !== 'win32' ? 'sleep' : 'timeout' },
			lintFlags: { value: process.platform !== 'win32' ? ['2'] : ['/t', '2'] }
		});
		const goplsConfig = Object.create(getGoplsConfig(), {});

		const results = await Promise.all([
			goLint(vscode.Uri.file(path.join(fixturePath, 'linterTest', 'linter_1.go')), config, goplsConfig),
			goLint(vscode.Uri.file(path.join(fixturePath, 'linterTest', 'linter_2.go')), config, goplsConfig)
		]);
		assert.equal(util.runTool.callCount, 2, 'should have launched 2 lint jobs');
		assert.equal(
			processutil.killProcessTree.callCount,
			1,
			'should have killed 1 lint job before launching the next'
		);
	});

	test('Linting - lint errors with multiple open files', async () => {
		try {
			// handleDiagnosticErrors may adjust the lint errors' ranges to make the error more visible.
			// This adjustment applies only to the text documents known to vscode. This test checks
			// the adjustment is made consistently across multiple open text documents.
			const file1 = await vscode.workspace.openTextDocument(
				vscode.Uri.file(path.join(fixturePath, 'linterTest', 'linter_1.go'))
			);
			const file2 = await vscode.workspace.openTextDocument(
				vscode.Uri.file(path.join(fixturePath, 'linterTest', 'linter_2.go'))
			);
			console.log('start linting');
			const warnings = await goLint(
				file2.uri,
				Object.create(getGoConfig(), {
					lintTool: { value: 'staticcheck' },
					lintFlags: { value: ['-checks', 'all,-ST1000,-ST1016'] }
					// staticcheck skips debatable checks such as ST1003 by default,
					// but this test depends on ST1003 (MixedCaps package name) presented in both files
					// in the same package. So, enable that.
				}),
				Object.create(getGoplsConfig(), {}),
				'package'
			);

			const diagnosticCollection = vscode.languages.createDiagnosticCollection('linttest');
			handleDiagnosticErrors({}, file2, warnings, diagnosticCollection);

			// The first diagnostic message for each file should be about the use of MixedCaps in package name.
			// Both files belong to the same package name, and we want them to be identical.
			const file1Diagnostics = diagnosticCollection.get(file1.uri);
			const file2Diagnostics = diagnosticCollection.get(file2.uri);
			assert(file1Diagnostics);
			assert(file2Diagnostics);
			assert(file1Diagnostics.length > 0);
			assert(file2Diagnostics.length > 0);
			assert.deepStrictEqual(file1Diagnostics[0], file2Diagnostics[0]);
		} catch (e) {
			assert.fail(`failed to lint: ${e}`);
		}
	});

	test('Error checking', async () => {
		const config = Object.create(getGoConfig(), {
			vetOnSave: { value: 'package' },
			vetFlags: { value: ['-all'] },
			lintOnSave: { value: 'package' },
			lintTool: { value: 'staticcheck' },
			lintFlags: { value: [] },
			buildOnSave: { value: 'package' }
		});
		const expectedLintErrors = [
			// Unlike golint, staticcheck will report only those compile errors,
			// but not lint errors when the program is broken.
			{
				line: 11,
				severity: 'warning',
				// From v0.4.0, staticcheck uses 'undefined:' as the prefix of this error.
				msg: /(?:undeclared name|undefined): prin \(compile\)/
			}
		];
		// If a user has enabled diagnostics via a language server,
		// then we disable running build or vet to avoid duplicate errors and warnings.
		const lspConfig = await buildLanguageServerConfig(getGoConfig());
		const expectedBuildVetErrors = lspConfig.enabled
			? []
			: [{ line: 11, severity: 'error', msg: 'undefined: prin' }];

		// `check` itself doesn't run deDupeDiagnostics, so we expect all vet/lint errors.
		const expected = [...expectedLintErrors, ...expectedBuildVetErrors];
		const diagnostics = await check(
			{
				buildDiagnosticCollection: vscode.languages.createDiagnosticCollection('buildtest'),
				lintDiagnosticCollection: vscode.languages.createDiagnosticCollection('linttest'),
				vetDiagnosticCollection: vscode.languages.createDiagnosticCollection('vettest')
			},
			vscode.Uri.file(path.join(fixturePath, 'errorsTest', 'errors.go')),
			config
		);
		const sortedDiagnostics = ([] as ICheckResult[]).concat
			.apply(
				[],
				diagnostics.map((x) => x.errors)
			)
			.sort((a: any, b: any) => a.line - b.line);
		assert.equal(sortedDiagnostics.length > 0, true, 'Failed to get linter results');

		const matchCount = expected.filter((expectedItem) => {
			return sortedDiagnostics.some((diag: any) => {
				return (
					expectedItem.line === diag.line &&
					expectedItem.severity === diag.severity &&
					diag.msg.match(expectedItem.msg)
				);
			});
		});
		assert.equal(
			matchCount.length >= expected.length,
			true,
			`Failed to match expected errors \n${JSON.stringify(sortedDiagnostics)} \n VS\n ${JSON.stringify(expected)}`
		);
	});

	test('Test Generate unit tests skeleton for file', async () => {
		const gotestsPath = getBinPath('gotests');
		const uri = vscode.Uri.file(path.join(generateTestsSourcePath, 'generatetests.go'));
		const document = await vscode.workspace.openTextDocument(uri);
		await vscode.window.showTextDocument(document);
		const ctx = new MockExtensionContext() as any;
		await generateTestCurrentFile(ctx, {})();

		const testFileGenerated = fs.existsSync(path.join(generateTestsSourcePath, 'generatetests_test.go'));
		assert.equal(testFileGenerated, true, 'Test file not generated.');
	});

	test('Test Generate unit tests skeleton for a function', async () => {
		const gotestsPath = getBinPath('gotests');
		const uri = vscode.Uri.file(path.join(generateFunctionTestSourcePath, 'generatetests.go'));
		const document = await vscode.workspace.openTextDocument(uri);
		const editor = await vscode.window.showTextDocument(document);
		editor.selection = new vscode.Selection(5, 0, 6, 0);
		const ctx = new MockExtensionContext() as any;
		await generateTestCurrentFunction(ctx, {})();

		const testFileGenerated = fs.existsSync(path.join(generateTestsSourcePath, 'generatetests_test.go'));
		assert.equal(testFileGenerated, true, 'Test file not generated.');
	});

	test('Test Generate unit tests skeleton for package', async () => {
		const gotestsPath = getBinPath('gotests');
		const uri = vscode.Uri.file(path.join(generatePackageTestSourcePath, 'generatetests.go'));
		const document = await vscode.workspace.openTextDocument(uri);
		await vscode.window.showTextDocument(document);
		const ctx = new MockExtensionContext() as any;
		await generateTestCurrentPackage(ctx, {})();

		const testFileGenerated = fs.existsSync(path.join(generateTestsSourcePath, 'generatetests_test.go'));
		assert.equal(testFileGenerated, true, 'Test file not generated.');
	});

	test('Test diffUtils.getEditsFromUnifiedDiffStr', async function () {
		// Run this test only in module mode.
		if (!isModuleMode) {
			this.skip();
		}

		if (process.platform === 'win32') {
			// This test requires diff tool that's not available on windows
			this.skip();
		}

		const file1path = path.join(fixturePath, 'diffTest1Data', 'file1.go');
		const file2path = path.join(fixturePath, 'diffTest1Data', 'file2.go');
		const file1uri = vscode.Uri.file(file1path);
		const file2contents = fs.readFileSync(file2path, 'utf8');

		const fileEditPatches: any | FilePatch[] = await new Promise((resolve) => {
			cp.exec(`diff -u ${file1path} ${file2path}`, (err, stdout, stderr) => {
				const filePatches: FilePatch[] = getEditsFromUnifiedDiffStr(stdout);

				if (!filePatches || filePatches.length !== 1) {
					assert.fail(null, null, 'Failed to get patches for the test file', '');
				}

				if (!filePatches[0].fileName) {
					assert.fail(null, null, 'Failed to parse the file path from the diff output', '');
				}

				if (!filePatches[0].edits) {
					assert.fail(null, null, 'Failed to parse edits from the diff output', '');
				}
				resolve(filePatches);
			});
		});

		const textDocument = await vscode.workspace.openTextDocument(file1uri);
		const editor = await vscode.window.showTextDocument(textDocument);
		await editor.edit((editBuilder) => {
			fileEditPatches[0].edits.forEach((edit: any) => {
				edit.applyUsingTextEditorEdit(editBuilder);
			});
		});
		assert.equal(editor.document.getText(), file2contents);
	});

	test('Test diffUtils.getEdits', async function () {
		if (!isModuleMode) {
			this.skip();
		} // Run this test only in module mode.

		const file1path = path.join(fixturePath, 'diffTest2Data', 'file1.go');
		const file2path = path.join(fixturePath, 'diffTest2Data', 'file2.go');
		const file1uri = vscode.Uri.file(file1path);
		const file1contents = fs.readFileSync(file1path, 'utf8');
		const file2contents = fs.readFileSync(file2path, 'utf8');

		const fileEdits = getEdits(file1path, file1contents, file2contents);

		if (!fileEdits) {
			assert.fail(null, null, 'Failed to get patches for the test file', '');
		}

		if (!fileEdits.fileName) {
			assert.fail(null, null, 'Failed to parse the file path from the diff output', '');
		}

		if (!fileEdits.edits) {
			assert.fail(null, null, 'Failed to parse edits from the diff output', '');
		}

		const textDocument = await vscode.workspace.openTextDocument(file1uri);
		const editor = await vscode.window.showTextDocument(textDocument);
		await editor.edit((editBuilder) => {
			fileEdits.edits.forEach((edit) => {
				edit.applyUsingTextEditorEdit(editBuilder);
			});
		});
		assert.equal(editor.document.getText(), file2contents);
	});

	test('Test Env Variables are passed to Tests', async () => {
		const config = Object.create(getGoConfig(), {
			testEnvVars: { value: { dummyEnvVar: 'dummyEnvValue', dummyNonString: 1 } }
		});
		const uri = vscode.Uri.file(path.join(fixturePath, 'baseTest', 'sample_test.go'));
		const document = await vscode.workspace.openTextDocument(uri);
		await vscode.window.showTextDocument(document);
		const ctx = new MockExtensionContext() as any;
		const result = await testCurrentFile(false, () => config)(ctx, {})([]);
		assert.equal(result, true);
	});

	test('getImportPath()', () => {
		const testCases: [string, string][] = [
			['import "github.com/sirupsen/logrus"', 'github.com/sirupsen/logrus'],
			['import "net/http"', 'net/http'],
			['"github.com/sirupsen/logrus"', 'github.com/sirupsen/logrus'],
			['', ''],
			['func foo(bar int) (int, error) {', ''],
			['// This is a comment, complete with punctuation.', '']
		];

		testCases.forEach((run) => {
			assert.equal(run[1], getImportPath(run[0]));
		});
	});

	test('goPlay - success run', async () => {
		const goplayPath = getBinPath('goplay');
		if (goplayPath === 'goplay') {
			// goplay is not installed, so skip the test
			return;
		}

		const validCode = `
			package main
			import (
				"fmt"
			)
			func main() {
				for i := 1; i < 4; i++ {
					fmt.Printf("%v ", i)
				}
				fmt.Print("Go!")
			}`;
		const goConfig = Object.create(getGoConfig(), {
			playground: { value: { run: true, openbrowser: false, share: false } }
		});

		await goPlay(validCode, goConfig['playground']).then(
			(result) => {
				assert(result.includes('1 2 3 Go!'));
			},
			(e) => {
				assert.ifError(e);
			}
		);
	});

	test('goPlay - success run & share', async () => {
		const goplayPath = getBinPath('goplay');
		if (goplayPath === 'goplay') {
			// goplay is not installed, so skip the test
			return;
		}

		const validCode = `
			package main
			import (
				"fmt"
			)
			func main() {
				for i := 1; i < 4; i++ {
					fmt.Printf("%v ", i)
				}
				fmt.Print("Go!")
			}`;
		const goConfig = Object.create(getGoConfig(), {
			playground: { value: { run: true, openbrowser: false, share: true } }
		});

		await goPlay(validCode, goConfig['playground']).then(
			(result) => {
				assert(result.includes('1 2 3 Go!'));
				assert(result.includes('https://play.golang.org/'));
			},
			(e) => {
				assert.ifError(e);
			}
		);
	});

	test('goPlay - fail', async () => {
		const goplayPath = getBinPath('goplay');
		if (goplayPath === 'goplay') {
			// goplay is not installed, so skip the test
			return;
		}

		const invalidCode = `
			package main
			import (
				"fmt"
			)
			func fantasy() {
				fmt.Print("not a main package, sorry")
			}`;
		const goConfig = Object.create(getGoConfig(), {
			playground: { value: { run: true, openbrowser: false, share: false } }
		});

		await goPlay(invalidCode, goConfig['playground']).then(
			(result) => {
				assert.ifError(result);
			},
			(e) => {
				assert.ok(e);
			}
		);
	});

	test('Build Tags checking', async () => {
		const goplsConfig = await buildLanguageServerConfig(getGoConfig());
		if (goplsConfig.enabled) {
			// Skip this test if gopls is enabled. Build/Vet checks this test depend on are
			// disabled when the language server is enabled, and gopls is not handling tags yet.
			return;
		}
		// Note: The following checks can't be parallelized because the underlying go build command
		// runner (goBuild) will cancel any outstanding go build commands.

		const checkWithTags = async (tags: string) => {
			const fileUri = vscode.Uri.file(path.join(fixturePath, 'buildTags', 'hello.go'));
			const defaultGoCfg = getGoConfig(fileUri);
			const cfg = Object.create(defaultGoCfg, {
				vetOnSave: { value: 'off' },
				lintOnSave: { value: 'off' },
				buildOnSave: { value: 'package' },
				buildTags: { value: tags }
			}) as vscode.WorkspaceConfiguration;

			const diagnostics = await check({}, fileUri, cfg);
			return ([] as string[]).concat(
				...diagnostics.map<string[]>((d) => {
					return d.errors.map((e) => e.msg) as string[];
				})
			);
		};

		const errors1 = await checkWithTags('randomtag');
		assert.deepEqual(
			errors1,
			['undefined: fmt.Prinln'],
			'check with buildtag "randomtag" failed. Unexpected errors found.'
		);

		// TODO(hyangah): after go1.13, -tags expects a comma-separated tag list.
		// For backwards compatibility, space-separated tag lists are still recognized,
		// but change to a space-separated list once we stop testing with go1.12.
		const errors2 = await checkWithTags('randomtag other');
		assert.deepEqual(
			errors2,
			['undefined: fmt.Prinln'],
			'check with multiple buildtags "randomtag,other" failed. Unexpected errors found.'
		);

		const errors3 = await checkWithTags('');
		assert.equal(
			errors3.length,
			1,
			'check without buildtag failed. Unexpected number of errors found' + JSON.stringify(errors3)
		);
		const errMsg = errors3[0];
		assert.ok(
			errMsg.includes("can't load package: package test/testfixture/buildTags") ||
				errMsg.includes('build constraints exclude all Go files'),
			`check without buildtags failed. Go files not excluded. ${errMsg}`
		);
	});

	test('Test Tags checking', async () => {
		const config1 = Object.create(getGoConfig(), {
			vetOnSave: { value: 'off' },
			lintOnSave: { value: 'off' },
			buildOnSave: { value: 'package' },
			testTags: { value: null },
			buildTags: { value: 'randomtag' }
		});

		const config2 = Object.create(getGoConfig(), {
			vetOnSave: { value: 'off' },
			lintOnSave: { value: 'off' },
			buildOnSave: { value: 'package' },
			testTags: { value: 'randomtag' }
		});

		const config3 = Object.create(getGoConfig(), {
			vetOnSave: { value: 'off' },
			lintOnSave: { value: 'off' },
			buildOnSave: { value: 'package' },
			testTags: { value: 'randomtag othertag' }
		});

		const config4 = Object.create(getGoConfig(), {
			vetOnSave: { value: 'off' },
			lintOnSave: { value: 'off' },
			buildOnSave: { value: 'package' },
			testTags: { value: '' }
		});

		const uri = vscode.Uri.file(path.join(fixturePath, 'testTags', 'hello_test.go'));
		const document = await vscode.workspace.openTextDocument(uri);
		await vscode.window.showTextDocument(document);
		const ctx = new MockExtensionContext() as any;

		const result1 = await testCurrentFile(false, () => config1)(ctx, {})([]);
		assert.equal(result1, true);

		const result2 = await testCurrentFile(false, () => config2)(ctx, {})([]);
		assert.equal(result2, true);

		const result3 = await testCurrentFile(false, () => config3)(ctx, {})([]);
		assert.equal(result3, true);

		const result4 = await testCurrentFile(false, () => config4)(ctx, {})([]);
		assert.equal(result4, false);
	});
};

suite('Go Extension Tests (GOPATH mode)', function () {
	this.timeout(20000);
	testAll(false);
});

suite('Go Extension Tests (Module mode)', function () {
	this.timeout(20000);
	testAll(true);
});
