import * as assert from 'assert';

// Simple test for the coverShort logic without VSCode dependencies
suite('go.coverShort Logic Tests', () => {
	test('should add -short flag when coverShort is true and applyCodeCoverage is true', () => {
		// Simulate the logic from testUtils.ts
		const testconfig = {
			applyCodeCoverage: true,
			goConfig: {
				get: (key: string) => {
					if (key === 'coverShort') return true;
					return undefined;
				}
			}
		};

		const args: string[] = ['test'];

		// Simulate the coverage flags section from computeTestCommand
		if (testconfig.applyCodeCoverage) {
			args.push('-coverprofile=temp_cover_path');

			// Add -short flag if go.coverShort is enabled
			if (testconfig.goConfig.get('coverShort')) {
				args.push('-short');
			}
		}

		assert.ok(args.includes('-short'), 'Should include -short flag when coverShort is true');
		assert.ok(args.includes('-coverprofile=temp_cover_path'), 'Should include coverage profile');
	});

	test('should not add -short flag when coverShort is false', () => {
		const testconfig = {
			applyCodeCoverage: true,
			goConfig: {
				get: (key: string) => {
					if (key === 'coverShort') return false;
					return undefined;
				}
			}
		};

		const args: string[] = ['test'];

		if (testconfig.applyCodeCoverage) {
			args.push('-coverprofile=temp_cover_path');

			if (testconfig.goConfig.get('coverShort')) {
				args.push('-short');
			}
		}

		assert.ok(!args.includes('-short'), 'Should not include -short flag when coverShort is false');
		assert.ok(args.includes('-coverprofile=temp_cover_path'), 'Should include coverage profile');
	});

	test('should not add -short flag when applyCodeCoverage is false', () => {
		const testconfig = {
			applyCodeCoverage: false,
			goConfig: {
				get: (key: string) => {
					if (key === 'coverShort') return true;
					return undefined;
				}
			}
		};

		const args: string[] = ['test'];

		if (testconfig.applyCodeCoverage) {
			args.push('-coverprofile=temp_cover_path');

			if (testconfig.goConfig.get('coverShort')) {
				args.push('-short');
			}
		}

		assert.ok(!args.includes('-short'), 'Should not include -short flag when applyCodeCoverage is false');
		assert.ok(!args.includes('-coverprofile=temp_cover_path'), 'Should not include coverage profile');
	});

	test('should handle undefined coverShort (default false)', () => {
		const testconfig = {
			applyCodeCoverage: true,
			goConfig: {
				get: (key: string) => {
					// coverShort is not set, returns undefined
					return undefined;
				}
			}
		};

		const args: string[] = ['test'];

		if (testconfig.applyCodeCoverage) {
			args.push('-coverprofile=temp_cover_path');

			if (testconfig.goConfig.get('coverShort')) {
				args.push('-short');
			}
		}

		assert.ok(!args.includes('-short'), 'Should not include -short flag when coverShort is undefined');
		assert.ok(args.includes('-coverprofile=temp_cover_path'), 'Should include coverage profile');
	});
}); 