/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * Modification copyright 2020 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

import * as assert from 'assert';
import { describe, it } from 'mocha';

import { disposeGoStatusBar, formatGoVersion, getGoEnvironmentStatusbarItem, initGoStatusBar } from '../../src/goEnvironmentStatus';
import { getGoVersion } from '../../src/util';

describe('#initGoStatusBar()', function () {
	this.beforeAll(() => {
		initGoStatusBar();
	});

	this.afterAll(() => {
		disposeGoStatusBar();
	});

	it('should create a status bar item', () => {
		assert.notEqual(getGoEnvironmentStatusbarItem(), undefined);
	});

	it('should create a status bar item with a label matching go.goroot version', async () =>  {
		const version = await getGoVersion();
		const versionLabel = formatGoVersion(version.format());
		assert.equal(
			getGoEnvironmentStatusbarItem().text,
			versionLabel,
			'goroot version does not match status bar item text'
		);
	});
});
