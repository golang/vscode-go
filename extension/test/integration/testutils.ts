/*---------------------------------------------------------
 * Copyright 2026 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

export function affectedByIssue832(): boolean {
	return process.platform === 'win32';
}

export function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Repeatedly executes the provided assertion function until it succeeds or the
 * timeout is reached. If the assertion fails (throws an error), it will be
 * retried every 100 milliseconds.
 *
 * @param assertion The synchronous or asynchronous assertion callback to run.
 * @param timeoutMs The maximum duration in milliseconds to attempt polling
 * before throwing a timeout error. Defaults to 1000ms.
 * @throws The last thrown error from the assertion function if the timeout is
 * reached.
 */
export async function poll(assertion: () => void | Promise<void>, timeoutMs = 1000): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	let lastError: any;
	while (Date.now() < deadline) {
		try {
			await assertion();
			return;
		} catch (err) {
			lastError = err;
		}
		await sleep(100);
	}
	throw lastError || new Error('Timed out polling condition');
}
