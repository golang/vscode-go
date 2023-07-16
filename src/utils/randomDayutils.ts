/*---------------------------------------------------------
 * Copyright 2022 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

// find a random day in the next 4 weeks, starting tomorrow
// (If this code is changed, run the test in calendartest.ts
// by hand.)
export function promptNext4Weeks(now: Date): Date {
	const day = 24 * 3600 * 1000; // milliseconds in a day
	// choose a random day in the next 4 weeks, starting tomorrow
	const delta = randomIntInRange(1, 28);
	const x = now.getTime() + day * delta;
	return new Date(x);
}

// randomIntInRange returns a random integer between min and max, inclusive.
function randomIntInRange(min: number, max: number): number {
	const low = Math.ceil(min);
	const high = Math.floor(max);
	return Math.floor(Math.random() * (high - low + 1)) + low;
}
