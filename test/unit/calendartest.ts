/*---------------------------------------------------------
 * Copyright 2022 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

import assert from 'assert';
import { promptNext4Weeks } from '../../src/utils/randomDayutils';

// Set this to run the test. There's no point in running it over
// and over, but it should be run if promptNext4Weeks is changed.
const runNextDaysTest = false;

// Test that a year of generated dates looks uniform. This test relies on
// statistical tests, so in principle, it could fail. The parameters for the
// statistics are chosen so there should be no more than a 1 in 1,000,000 chance.
// (Further, if it passes once and the code it correct,
// it then becomes a test of the random number generator, which is pointless.)
// (this test takes about 40 msec on a 2018 Macbook Pro)
suite('random day tests', () => {
	test('next days', () => {
		if (!runNextDaysTest) {
			return;
		}
		const newYear = new Date('2024-01-01');
		const day = 24 * 3600 * 1000;
		const seen4 = new Array<number>(366);
		for (let i = 0; i < 366; i++) {
			seen4[i] = 0;
		}
		for (let i = 0; i < 366; i++) {
			for (let j = 0; j < 100; j++) {
				const today = new Date(newYear.getTime() + day * i);
				const next = promptNext4Weeks(today);
				assert((next.getTime() - today.getTime()) % day === 0);
				const days = (next.getTime() - today.getTime()) / day;
				assert(days >= 1 && days <= 28, 'days: ' + days);
				const doy = Math.floor((next.getTime() - new Date(next.getFullYear(), 0, 0).getTime()) / day);
				seen4[doy - 1]++;
			}
		}
		assert.ok(isUniform(seen4));
		// console.log(`elapsed ${new Date().getTime() - now.getTime()} ms}`);
	});
});

// decide if the contnts of x look like a uniform distribution, This assumes x.length > 50 or so,
// and approximates the chi-squared distribution with a normal distribution. (see the Wikipedia article)
// The approximation is that sqrt(2*chi2) ~ N(sqrt(2*df-1) is good enough for our purposes.
// The change of getting a 4.8 sigma deviation is about 1 in 1,000,000.
function isUniform(x: number[], bound = 4.8): boolean {
	const k = x.length;
	const df = k - 1;
	const sum = x.reduce((sum, current) => sum + current, 0);
	const exp = sum / k;
	const chi2 = x.reduce((sum, current) => sum + ((current - exp) * (current - exp)) / exp, 0);
	const sd = Math.sqrt(2 * chi2) - Math.sqrt(2 * df - 1);
	// sd would be the standard deviation in units of 1. 1
	let ret = sd < bound && sd > -bound;
	// and make sure the individual values aren't crazy (5 std devs of normal has prob 3e-7)
	const expsd = 5 * Math.sqrt(exp);
	x.map((v) => {
		if (v < exp - expsd || v > exp + expsd) ret = false;
	});
	// console.log(`sd: ${sd} bound: ${bound} expsd: ${expsd} exp: ${exp} chi2: ${chi2} df: ${df}`);
	return ret;
}
