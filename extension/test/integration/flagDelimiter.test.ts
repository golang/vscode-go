/*---------------------------------------------------------
 * Copyright 2026 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

import assert from 'assert';
import cp = require('child_process');
import sinon = require('sinon');
import vscode = require('vscode');
import { showPackageFiles } from '../../src/goBrowsePackage';
import { goGetPackage } from '../../src/goGetPackage';
import { addImportToWorkspace } from '../../src/goImport';
import { installCurrentPackage } from '../../src/goInstall';
import { goModInit } from '../../src/goModules';
import * as util from '../../src/util';
import { MockExtensionContext } from '../mocks/MockContext';

suite('Flag Delimiter Tests', () => {
	let sandbox: sinon.SinonSandbox;
	let execFileStub: sinon.SinonStub;

	setup(() => {
		sandbox = sinon.createSandbox();
		sandbox.stub(util, 'getBinPath').withArgs('go').returns('/fake/bin/go');
		execFileStub = sandbox.stub(cp, 'execFile').callsFake(((cmd: any, args: any, options: any, cb?: any) => {
			if (typeof options === 'function') {
				cb = options;
			}
			if (cb) {
				cb(null, '', '');
			}
			return {} as any;
		}) as any);
	});

	teardown(() => {
		sandbox.restore();
	});

	test('showPackageFiles passes package path after "--" delimiter', () => {
		const pkg = '-leading-flag-package';
		showPackageFiles(pkg, false, '/fake/workdir');

		assert.strictEqual(execFileStub.calledOnce, true, 'cp.execFile should be called');
		const args = execFileStub.firstCall.args[1] as string[];
		const delimiterIndex = args.indexOf('--');
		assert.notStrictEqual(delimiterIndex, -1, 'args must contain "--" delimiter');
		assert.strictEqual(args[delimiterIndex + 1], pkg, 'package must follow "--" delimiter');
		assert.deepStrictEqual(args, [
			'list',
			'-f',
			'{{.Dir}}:{{.GoFiles}}:{{.TestGoFiles}}:{{.XTestGoFiles}}',
			'--',
			pkg
		]);
	});

	test('goModInit passes module name after "--" delimiter', async () => {
		const modName = '-module-starting-with-dash';
		sandbox.stub(vscode.window, 'showInputBox').resolves(modName);
		sandbox.stub(vscode.commands, 'executeCommand').resolves();

		const ctx = new MockExtensionContext() as any;
		await goModInit(ctx, {} as any)();

		assert.strictEqual(execFileStub.calledOnce, true, 'cp.execFile should be called');
		const args = execFileStub.firstCall.args[1] as string[];
		const delimiterIndex = args.indexOf('--');
		assert.notStrictEqual(delimiterIndex, -1, 'args must contain "--" delimiter');
		assert.strictEqual(args[delimiterIndex + 1], modName, 'module name must follow "--" delimiter');
		assert.deepStrictEqual(args, ['mod', 'init', '--', modName]);
	});

	test('goGetPackage passes import path after "--" delimiter', () => {
		const importPath = '-flag-like-import';
		const fakeDocument = {
			lineAt: () => ({ text: `import "${importPath}"` })
		};
		const fakeEditor = {
			selection: { active: { line: 0 } },
			document: fakeDocument
		};
		sandbox.stub(vscode.window, 'activeTextEditor').get(() => fakeEditor as any);

		const ctx = new MockExtensionContext() as any;
		goGetPackage(ctx, {} as any)();

		assert.strictEqual(execFileStub.calledOnce, true, 'cp.execFile should be called');
		const args = execFileStub.firstCall.args[1] as string[];
		const delimiterIndex = args.indexOf('--');
		assert.notStrictEqual(delimiterIndex, -1, 'args must contain "--" delimiter');
		assert.strictEqual(args[delimiterIndex + 1], importPath, 'import path must follow "--" delimiter');
		assert.deepStrictEqual(args, ['get', '-v', '--', importPath]);
	});

	test('addImportToWorkspace passes import path after "--" delimiter', () => {
		const importPath = '-flag-like-import';
		const fakeDocument = {
			lineAt: () => ({ text: `import "${importPath}"` })
		};
		const fakeEditor = {
			selection: { active: { line: 0 }, isEmpty: true },
			document: fakeDocument
		};
		sandbox.stub(vscode.window, 'activeTextEditor').get(() => fakeEditor as any);

		const ctx = new MockExtensionContext() as any;
		addImportToWorkspace(ctx, {} as any)();

		assert.strictEqual(execFileStub.calledOnce, true, 'cp.execFile should be called');
		const args = execFileStub.firstCall.args[1] as string[];
		const delimiterIndex = args.indexOf('--');
		assert.notStrictEqual(delimiterIndex, -1, 'args must contain "--" delimiter');
		assert.strictEqual(args[delimiterIndex + 1], importPath, 'import path must follow "--" delimiter');
		assert.deepStrictEqual(args, ['list', '-f', '{{.Dir}}', '--', importPath]);
	});

	test('installCurrentPackage passes package path after "--" delimiter', async () => {
		const fakeDocument = {
			languageId: 'go',
			uri: vscode.Uri.file('/fake/workspace/main.go')
		};
		const fakeEditor = {
			document: fakeDocument
		};
		sandbox.stub(vscode.window, 'activeTextEditor').get(() => fakeEditor as any);

		const ctx = new MockExtensionContext() as any;
		await installCurrentPackage(ctx, {} as any)();

		assert.strictEqual(execFileStub.calledOnce, true, 'cp.execFile should be called');
		const args = execFileStub.firstCall.args[1] as string[];
		const delimiterIndex = args.indexOf('--');
		assert.notStrictEqual(delimiterIndex, -1, 'args must contain "--" delimiter');
		assert.strictEqual(delimiterIndex, args.length - 2, '"--" must immediately precede package argument');
	});
});
