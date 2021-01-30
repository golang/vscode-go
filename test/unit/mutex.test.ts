/*---------------------------------------------------------
 * Copyright 2021 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

import * as assert from 'assert';
import { Mutex } from '../../src/utils/mutex';

suite('Mutex Tests', () => {
	test('works for basic concurrent access', async () => {
		const m = new Mutex();

		let cnt = 0;
		const worker = async (delay: number, count: number) => {
			for (let i = 0; i < count; i++) {
				const unlock = await m.lock();
				try {
					const cntCopy = cnt;
					await sleep(delay);
					cnt = cntCopy + 1;
				} finally {
					unlock();
				}
			}
		};

		await Promise.all([worker(3, 5), worker(1, 10)]);
		assert.strictEqual(cnt, 15);
	});

	test('works when lock holders throw errors', async () => {
		const m = new Mutex();

		let cnt = 0;
		const worker = async (delay: number) => {
			const unlock = await m.lock();
			try {
				const cntCopy = cnt;
				await sleep(delay);
				cnt = cntCopy + 1;
				throw new Error('ooops');
			} finally {
				unlock();
			}
		};

		const safeWorker = async (delay: number) => {
			try {
				await worker(delay);
			} catch (e) {
				// swallow the exception
			}
		};

		await Promise.all([safeWorker(3), safeWorker(2), safeWorker(1), safeWorker(0)]);
		assert.strictEqual(cnt, 4);
	});
});

function sleep(ms: number) { return new Promise((resolve) => setTimeout(resolve, ms)); }
