/*---------------------------------------------------------
 * Copyright 2021 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

import { Uri } from 'vscode';
import { CommandInvocation, ExtensionAPI } from './export';
import { getBinPathWithExplanation } from './util';
import { extensionInfo } from './config';

const api: ExtensionAPI = {
	isPreview: extensionInfo.isPreview,

	settings: {
		getExecutionCommand(toolName: string, resource?: Uri): CommandInvocation | undefined {
			const { binPath } = getBinPathWithExplanation(toolName, true, resource);
			return { binPath };
		}
	}
};

export default api;
