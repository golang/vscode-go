/* eslint-disable @typescript-eslint/no-unused-vars */
/*---------------------------------------------------------
 * Copyright 2020 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

'use strict';

import assert from 'assert';
import { applyCodeCoverageToAllEditors, coverageFilesForTest, initForTest } from '../../src/goCover';
import { updateGoVarsFromConfig } from '../../src/goInstallTools';
import path = require('path');
import vscode = require('vscode');

// The ideal test would check that each open editor containing a file with coverage
// information is displayed correctly. We cannot see the applied decorations, so the
// test checks that the cover.out file has been read correctly, and the import paths
// have been correctly converted to file system paths, which are what vscode uses.
suite('Coverage for tests', function () {
	this.timeout(10000);

	let fixtureSourcePath: string;
	let coverFilePath: string;

	// updateGoVarsFromConfig mutates process.env. Restore to prevEnv in suiteTeardown.
	// TODO: avoid updateGoVarsFromConfig.
	const prevEnv = Object.assign({}, process.env);
	suiteSetup(async () => {
		await updateGoVarsFromConfig({});

		// Set up the test fixtures.
		fixtureSourcePath = path.join(__dirname, '..', '..', '..', 'test', 'testdata', 'coverage');
		coverFilePath = path.join(fixtureSourcePath, 'cover.out');
		return;
	});
	suiteTeardown(() => {
		process.env = prevEnv;
	});
	test('resolve import paths', async () => {
		initForTest();
		const x = vscode.workspace.openTextDocument(coverFilePath);
		await applyCodeCoverageToAllEditors(coverFilePath, fixtureSourcePath);
		const files = Object.keys(coverageFilesForTest());
		const aDotGo = files.includes(path.join(fixtureSourcePath, 'a', 'a.go'));
		const bDotGo = files.includes(path.join(fixtureSourcePath, 'b', 'b.go'));
		// Coverage data (cover.out) contains a couple of bogus data with file name blah.go. They shouldn't appear.
		const blahDotGo = files.includes(path.join(fixtureSourcePath, 'b', 'blah.go'));
		assert(
			aDotGo && bDotGo && !blahDotGo,
			`!seen a.go:${aDotGo} or !seen b.go:${bDotGo} or seen blah.go:${blahDotGo}: ${files}\n`
		);
	});
});
