/*---------------------------------------------------------
 * Copyright 2023 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

import assert from 'assert';
import path from 'path';
import {
	CancellationTokenSource,
	CustomExecution,
	ProcessExecution,
	ShellExecution,
	TaskScope,
	Uri,
	window,
	workspace,
	WorkspaceConfiguration,
	WorkspaceFolder
} from 'vscode';
import sinon = require('sinon');
import { GoTaskProvider } from '../../src/goTaskProvider';
import { getBinPath } from '../../src/util';
import { MockExtensionContext } from '../mocks/MockContext';
import * as goEnv from '../../src/goEnv';
import * as config from '../../src/config';

suite('GoTaskProvider', () => {
	const fixtureDir = path.join(__dirname, '../../../test/testdata/baseTest');
	const ctx = MockExtensionContext.new();
	let sandbox: sinon.SinonSandbox;
	let goConfig: WorkspaceConfiguration;

	setup(async () => {
		goConfig = Object.create(config.getGoConfig());
		sandbox = sinon.createSandbox();
		sandbox.stub(config, 'getGoConfig').returns(goConfig);

		const uri = Uri.file(path.join(fixtureDir, 'test.go'));
		await workspace.openTextDocument(uri); // open a file
		await window.showTextDocument(uri);
	});

	teardown(() => {
		sandbox.restore();
		ctx.teardown();
	});

	function stubProvideDefaultSetting(goConfig: WorkspaceConfiguration, val: boolean) {
		// typechecking around sinon.stub.WithArgs reports mismatched arg count when
		// working with the overloaded 'get' of WorkspaceConfiguration whose second arg
		// is optional. So, implement callsFake that checks only the first arg.
		const originalGet = goConfig.get;
		sinon.stub(goConfig, 'get').callsFake((section, defaultValue) => {
			return section === 'tasks.provideDefault' ? val : originalGet(section, defaultValue);
		});
	}

	test('provide tasks', async () => {
		stubProvideDefaultSetting(goConfig, true);
		const provider = GoTaskProvider.setup(ctx, {
			workspaceFolders: [{ uri: Uri.file(fixtureDir), name: 'baseTest', index: 0 }],
			getWorkspaceFolder: () => {
				return { uri: Uri.file(fixtureDir), name: 'baseTest', index: 0 };
			}
		});
		assert(provider);

		const tasks = await provider.provideTasks(new CancellationTokenSource().token);
		assert(tasks && tasks.length > 0, `want some tasks, got zero tasks: ${JSON.stringify(tasks)}`);
		tasks.forEach((task) => {
			assert(isProcessExecution(task.execution) && isWorkspaceFolder(task.scope));
			assert.strictEqual(task.execution.process, getBinPath('go'));
			assert(
				['build', 'test'].includes(task.execution.args?.[0]),
				`want go build/test, got ${task.execution.args}`
			);
		});
	});

	test('merge toolsEnv', async () => {
		stubProvideDefaultSetting(goConfig, true);
		sandbox.stub(goEnv, 'toolExecutionEnvironment').returns({
			foo: 'foo_value',
			bar: undefined
		});
		const provider = GoTaskProvider.setup(ctx, {
			workspaceFolders: [{ uri: Uri.file(fixtureDir), name: 'baseTest', index: 0 }],
			getWorkspaceFolder: () => {
				return { uri: Uri.file(fixtureDir), name: 'baseTest', index: 0 };
			}
		});

		assert(provider);
		const tasks = await provider.provideTasks(new CancellationTokenSource().token);
		assert(tasks && tasks.length > 0, `want some tasks, got zero tasks: ${JSON.stringify(tasks)}`);
		tasks.forEach((task) => {
			assert(isProcessExecution(task.execution) && isWorkspaceFolder(task.scope));
			assert.strictEqual(
				JSON.stringify(task.execution.options?.env),
				JSON.stringify({ foo: 'foo_value', bar: '' })
			);
		});
	});

	test('do not provide tasks when disabled', async () => {
		stubProvideDefaultSetting(goConfig, false);
		const provider = GoTaskProvider.setup(ctx, {
			workspaceFolders: [{ uri: Uri.file(fixtureDir), name: 'baseTest', index: 0 }],
			getWorkspaceFolder: () => {
				return { uri: Uri.file(fixtureDir), name: 'baseTest', index: 0 };
			}
		});

		assert(provider);
		const tasks = await provider!.provideTasks(new CancellationTokenSource().token);
		assert(!tasks || tasks.length === 0, `want no tasks, got some tasks: ${JSON.stringify(tasks)}`);
	});

	test('zero-folder setup does not provide tasks', async () => {
		stubProvideDefaultSetting(goConfig, true);
		const provider = GoTaskProvider.setup(ctx, {
			workspaceFolders: [],
			getWorkspaceFolder: () => undefined
		});
		assert(!provider);
	});
});

function isProcessExecution(t: ProcessExecution | ShellExecution | CustomExecution | undefined): t is ProcessExecution {
	return !!t && 'process' in t && 'args' in t && 'options' in t;
}

function isWorkspaceFolder(t: WorkspaceFolder | TaskScope | undefined): t is WorkspaceFolder {
	return !!t && 'object' === typeof t && 'uri' in t;
}
