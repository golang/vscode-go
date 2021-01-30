/*---------------------------------------------------------
 * Copyright 2021 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

'use strict';

/* Mutex provides mutex feature by building a promise chain.

  const m = new Mutex();

  const unlock = await m.lock();
  try {
	  // critical section
  } finally {
	  unlock();
  }
*/
export class Mutex {
	private mutex = Promise.resolve();

	public lock(): PromiseLike<() => void> {
		// Based on https://spin.atomicobject.com/2018/09/10/javascript-concurrency/

		let x: (unlock: () => void) => void;

		// add to the promise chain of this mutex.
		// When all the prior promises in the chain are resolved,
		// x, which will be the resolve callback of promise B,
		// will run and cause to unblock the waiter of promise B.
		this.mutex = this.mutex.then(() => {
			return new Promise(x);  // promise A
		});

		return new Promise((resolve) => {  // promise B
			x = resolve;
		});
		// the returned Promise will resolve when all the previous
		// promises chained in this.mutex resolve.
	}
}
