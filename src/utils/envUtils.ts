/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * Modification copyright 2020 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

'use strict';

import fs = require('fs');

function stripBOM(s: string): string {
	if (s && s[0] === '\uFEFF') {
		s = s.substr(1);
	}
	return s;
}

/**
 * returns the environment variable collection created by parsing the given .env file.
 */
export function parseEnvFile(envFilePath: string): { [key: string]: string } {
	const env: { [key: string]: string } = {};
	if (!envFilePath) {
		return env;
	}

	try {
		const buffer = stripBOM(fs.readFileSync(envFilePath, 'utf8'));
		buffer.split('\n').forEach((line) => {
			const r = line.match(/^\s*([\w\.\-]+)\s*=\s*(.*)?\s*$/);
			if (r !== null) {
				let value = r[2] || '';
				if (value.length > 0 && value.charAt(0) === '"' && value.charAt(value.length - 1) === '"') {
					value = value.replace(/\\n/gm, '\n');
				}
				env[r[1]] = value.replace(/(^['"]|['"]$)/g, '');
			}
		});
		return env;
	} catch (e) {
		throw new Error(`Cannot load environment variables from file ${envFilePath}`);
	}
}

export function parseEnvFiles(envFiles: string[]|string): { [key: string]: string } {
	const fileEnvs = [];
	if (typeof envFiles === 'string') {
		fileEnvs.push(parseEnvFile(envFiles));
	}
	if (Array.isArray(envFiles)) {
		envFiles.forEach((envFile) => {
			fileEnvs.push(parseEnvFile(envFile));
		});
	}
	return Object.assign({}, ...fileEnvs);
}
