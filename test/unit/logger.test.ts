/*---------------------------------------------------------
 * Copyright 2021 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

import * as assert from 'assert';
import sinon = require('sinon');
import { Logger } from '../../src/goLogging';

suite('Logger Tests', () => {
	let sandbox: sinon.SinonSandbox;

	setup(() => {
		sandbox = sinon.createSandbox();
	});
	teardown(() => {
		sandbox.restore();
	});

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	function runTest(level: any, want: number) {
		const appendLine = sandbox.fake();
		const logger = new Logger(level, { appendLine });
		logger.error('error');
		logger.warn('warn');
		logger.info('info');
		logger.debug('debug');
		logger.trace('trace');
		assert.strictEqual(appendLine.callCount, want, `called ${appendLine.callCount} times, want ${want}`);
	}
	test('logger level = off', () => runTest('off', 0));
	test('logger level = error', () => runTest('error', 1));
	test('logger level = warning', () => runTest('warn', 2));
	test('logger level = info', () => runTest('info', 3));
	test('logger level = trace', () => runTest('trace', 4));
	test('logger level = verbose', () => runTest('verbose', 5));
	test('logger level = undefined', () => runTest(undefined, 1));
	test('logger level = ""', () => runTest('', 1));
	test('logger level = object', () => runTest({}, 1));
	test('logger level = number', () => runTest(10, 1));
});
