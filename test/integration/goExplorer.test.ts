/*---------------------------------------------------------
 * Copyright 2022 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

import assert from 'assert';
import path from 'path';
import { TreeItem, Uri, window, workspace } from 'vscode';
import { getGoConfig, getGoplsConfig } from '../../src/config';

import { GoExplorerProvider } from '../../src/goExplorer';
import { getConfiguredTools } from '../../src/goTools';
import { getGoVersion } from '../../src/util';
import { resolveHomeDir } from '../../src/utils/pathUtils';
import { MockExtensionContext } from '../mocks/MockContext';

suite('GoExplorerProvider', () => {
	const fixtureDir = path.join(__dirname, '../../../test/testdata/baseTest');
	const ctx = MockExtensionContext.new();
	let explorer: GoExplorerProvider;

	suiteSetup(async () => {
		explorer = GoExplorerProvider.setup(ctx);
		const uri = Uri.file(path.join(fixtureDir, 'test.go'));
		await workspace.openTextDocument(uri);
		await window.showTextDocument(uri);
	});

	suiteTeardown(() => {
		ctx.teardown();
	});

	test('env tree', async () => {
		const [env] = await explorer.getChildren();
		assert.strictEqual(env.label, 'env');
		assert.strictEqual(env.contextValue, 'go:explorer:env');
	});

	test('env tree items', async () => {
		const [env] = await explorer.getChildren();
		const [goenv, gomod] = (await explorer.getChildren(env)) as { key: string; value: string }[];
		assert.strictEqual(goenv.key, 'GOENV');
		assert.strictEqual(gomod.key, 'GOMOD');
		assert.strictEqual(resolveHomeDir(gomod.value), `${fixtureDir}/go.mod`);
	});

	test('tools tree', async () => {
		const [, tools] = await explorer.getChildren();
		assert(tools.label === 'tools');
		assert.strictEqual(tools.contextValue, 'go:explorer:tools');
	});

	test('tools tree items', async () => {
		const goVersion = await getGoVersion();
		const allTools = getConfiguredTools(goVersion, getGoConfig(), getGoplsConfig());
		const expectTools = allTools.map((t) => t.name);
		const [, tools] = await explorer.getChildren();
		const items = (await explorer.getChildren(tools)) as TreeItem[];
		for (const idx in items) {
			assert(
				items[idx].label.toString().startsWith(expectTools[idx]),
				`Unexpected tool tree item with label "${items[idx].label}"`
			);
		}
	});
});
