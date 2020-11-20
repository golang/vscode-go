//@ts-check

'use strict';

const path = require('path');

/**@type {import('webpack').Configuration}*/
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
		devtoolModuleFilenameTemplate: '../[resource-path]',
		sourceMapFilename: '[name].js.map'
	},
	devtool: 'source-map',
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
	stats: {
		// Ignore warnings due to yarg's dynamic module loading
		warningsFilter: [/node_modules\/yargs/]
	},
};
module.exports = config;
