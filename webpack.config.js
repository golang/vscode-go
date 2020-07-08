//@ts-check

'use strict';

const path = require('path');

/**@type {import('webpack').WebpackOptions}*/
const config = {
	target: 'node',
	entry: {
		goMain: './src/goMain.ts',
		debugAdapter: './src/debugAdapter/goDebug.ts',
		debugAdapter2: './src/debugAdapter2/goDlvDebugMain.ts',
	},
	output: {
		path: path.resolve(__dirname, 'dist'),
		filename: '[name].js',
		libraryTarget: 'commonjs2',
		devtoolModuleFilenameTemplate: '../[resource-path]'
	},
	devtool: 'none',
	externals: {
		// the vscode-module is created on-the-fly and must be excluded.
		vscode: 'commonjs vscode'
	},
	resolve: {
		extensions: ['.ts', '.js']
	},
	module: {
		rules: [
			{
				test: /\.ts$/,
				exclude: /node_modules/,
				use: [
					{
						loader: 'ts-loader'
					}
				]
			}
		]
	},
	optimization: {
		// when this is true, the debugger breaks...
		minimize: false
	},
};
module.exports = config;
