/*---------------------------------------------------------
 * Copyright 2026 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

import assert from 'assert';
import { getToolSpawnCommand } from '../../src/utils/pathUtils';

suite('pathUtils tests', () => {
	test('getToolSpawnCommand', () => {
		assert.deepStrictEqual(getToolSpawnCommand('C:\\tools with spaces\\dlv.bat', 'win32'), {
			command: '"C:\\tools with spaces\\dlv.bat"',
			shell: true
		});
		assert.deepStrictEqual(getToolSpawnCommand('C:\\tools\\dlv.CMD', 'win32'), {
			command: '"C:\\tools\\dlv.CMD"',
			shell: true
		});
		assert.deepStrictEqual(getToolSpawnCommand('C:\\tools\\dlv.exe', 'win32'), {
			command: 'C:\\tools\\dlv.exe',
			shell: false
		});
		assert.deepStrictEqual(getToolSpawnCommand('/tools/dlv.bat', 'linux'), {
			command: '/tools/dlv.bat',
			shell: false
		});
	});
});
