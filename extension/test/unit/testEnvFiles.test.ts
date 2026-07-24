/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

import assert from 'assert';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { parseEnvFiles } from '../../src/utils/envUtils';

suite('parseEnvFiles Tests', () => {
	let tmpDir: string;

	setup(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'go-test-env-'));
	});

	teardown(() => {
		if (tmpDir && fs.existsSync(tmpDir)) {
			fs.rmdirSync(tmpDir, { recursive: true });
		}
	});

	test('should handle empty array', () => {
		const result = parseEnvFiles([]);
		assert.deepStrictEqual(result, {});
	});

	test('should handle undefined input', () => {
		const result = parseEnvFiles(undefined);
		assert.deepStrictEqual(result, {});
	});

	test('should handle array of files', () => {
		const envFile1 = path.join(tmpDir, 'first.env');
		const envFile2 = path.join(tmpDir, 'second.env');

		fs.writeFileSync(envFile1, 'VAR1=value1\nSHARED=from_first');
		fs.writeFileSync(envFile2, 'VAR2=value2\nSHARED=from_second');

		const result = parseEnvFiles([envFile1, envFile2]);

		assert.strictEqual(result.VAR1, 'value1');
		assert.strictEqual(result.VAR2, 'value2');
		// Later files should override earlier ones
		assert.strictEqual(result.SHARED, 'from_second');
	});

	test('should handle mixed valid and invalid files', () => {
		const validFile = path.join(tmpDir, 'valid.env');
		const invalidFile = path.join(tmpDir, 'nonexistent.env');

		fs.writeFileSync(validFile, 'VALID_VAR=valid_value');

		// This should throw when trying to parse invalid file
		assert.throws(() => {
			parseEnvFiles([validFile, invalidFile]);
		});
	});
});
