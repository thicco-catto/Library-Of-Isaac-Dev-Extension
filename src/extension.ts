// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import { TextEncoder } from 'util';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as TSILParser from './TSILParser';
import { createGitBookDocs } from './CreateGitBook';
import path = require('path');


interface FileDependencyInfo {
	functions: string[],
	modules: Set<string>
}

interface FunctionDependencyInfo {
	modules: Set<string>,
	file: string,
	requiredFiles: string[]
}

interface Dependencies {
	files: { [key: string]: FileDependencyInfo },
	functions: { [key: string]: FunctionDependencyInfo }
}


function findTSILFile(fullPath: string): string | undefined {
	const files = fs.readdirSync(fullPath);

	for (let index = 0; index < files.length; index++) {
		const file = files[index];

		if (file === "TSIL.lua") {
			return fullPath;
		} else if (fs.statSync(path.join(fullPath, file)).isDirectory()) {
			const found = findTSILFile(path.join(fullPath, file));

			if (found !== undefined) {
				return found;
			}
		}
	}

	return undefined;
}


function readFolderContents(prefix: string, fullPath: string): string {
	let totalString = "";
	fs.readdirSync(fullPath).forEach(file => {
		if (file.endsWith(".lua")) {
			totalString += "\"" + prefix + file.replace(".lua", "") + "\",\n";
		} else if (fs.statSync(path.join(fullPath, file)).isDirectory()) {
			totalString += readFolderContents(prefix + file + ".", path.join(fullPath, file));
		}
	});

	return totalString;
}


function readFolderContentsShallow(prefix: string, path: string): string {
	let totalString = "";
	fs.readdirSync(path).forEach(file => {
		if (file.endsWith(".lua")) {
			totalString += "\"" + prefix + file.replace(".lua", "") + "\",\n";
		}
	});

	return totalString;
}


function readFolderContentsOnlyFolders(prefix: string, fullPath: string): string {
	let totalString = "";
	fs.readdirSync(fullPath).forEach(file => {
		if (fs.statSync(path.join(fullPath, file)).isDirectory()) {
			totalString += readFolderContents(`${prefix}${file}.`, path.join(fullPath, file));
		}
	});

	return totalString;
}


function readDocsFromFile(file: string): string {
	const fileContents = fs.readFileSync(file, 'utf-8');
	const fileLines = fileContents.split("\n");

	let fileDocs = "";
	let docsPerFunction = "";

	let isReadingDocs = false;
	let isReadingEnum = false;
	let isReadingClass = false;

	fileLines.forEach(element => {
		if (isReadingDocs) {
			if (isReadingEnum) {
				docsPerFunction += element + "\n";
				if (element.trim().startsWith("}")) {
					fileDocs += docsPerFunction + "\n";
					isReadingDocs = false;
				}
			} else if (isReadingClass) {
				docsPerFunction += element + "\n";
				if (!element.startsWith("---")) {
					fileDocs += docsPerFunction + "\n";
					isReadingDocs = false;
				};
			} else {
				if (element.startsWith("---")) {
					docsPerFunction += element + "\n";

					isReadingEnum = element.startsWith("---@enum") || element.startsWith("--- @enum");
					isReadingClass = element.startsWith("---@class") || element.startsWith("--- @class");
				} else {
					if (element.startsWith("function TSIL")) {
						docsPerFunction += element + "\nend\n\n";

						fileDocs += docsPerFunction;
					}

					isReadingDocs = false;
				}
			}
		} else {
			if (element.startsWith("---")) {
				docsPerFunction = "";
				docsPerFunction += element + "\n";
				isReadingDocs = true;

				isReadingEnum = element.startsWith("---@enum") || element.startsWith("--- @enum");
				isReadingClass = element.startsWith("---@class") || element.startsWith("--- @class");
			}
		}
	});

	return fileDocs;
}


function readDocsFromDirectory(path: string): string {
	let docs = "";

	fs.readdirSync(path).forEach(file => {
		if (file.endsWith(".lua")) {
			docs += readDocsFromFile(path + "/" + file);
		} else if (fs.lstatSync(path + "/" + file).isDirectory()) {
			docs += readDocsFromDirectory(path + "/" + file);
		}
	});

	return docs;
}


function readDependenciesFromFile(file: string) {
	const fileContents = fs.readFileSync(file, 'utf-8');
	const lines = fileContents.split("\n");
	const requiredFiles: string[] = [];

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];

		if (!line.startsWith("--##")) {
			break;
		}

		if (line.startsWith("--##use")) {
			requiredFiles.push(line.replace("--##use", "").trim());
		}
	}

	TSILParser.resetModulesPerFunction();
	TSILParser.resetUsedModules();

	const result = TSILParser.parseLuaFile(fileContents);

	const fileInfo: FileDependencyInfo = {
		functions: [],
		modules: new Set()
	};

	const usedModules = TSILParser.getUsedModules();
	usedModules.forEach(x => result.commonModules.add(x));

	result.commonModules.forEach(x => fileInfo.modules.add(x));

	const functions: { [key: string]: FunctionDependencyInfo } = {};

	for (const funct in result.modulesPerFunction) {
		const modules = result.modulesPerFunction[funct];

		modules.forEach(x => fileInfo.modules.add(x));
		result.commonModules.forEach(x => modules.add(x));

		fileInfo.functions.push(funct);
		functions[funct] = {
			file: file,
			requiredFiles: requiredFiles,
			modules: modules
		};
	}

	return {
		file: fileInfo,
		functions: functions
	};
}


function readDependenciesFromDirectory(path: string) {
	const dependencies: Dependencies = {
		files: {},
		functions: {}
	};

	fs.readdirSync(path).forEach(file => {
		if (file.endsWith(".lua")) {
			const fileDependencies = readDependenciesFromFile(path + "/" + file);
			dependencies.files[path + "/" + file] = fileDependencies.file;
			for (const funct in fileDependencies.functions) {
				const modules = fileDependencies.functions[funct];
				dependencies.functions[funct] = modules;
			}
		} else if (fs.lstatSync(path + "/" + file).isDirectory()) {
			const dirDependencies = readDependenciesFromDirectory(path + "/" + file);
			for (const filePath in dirDependencies.files) {
				dependencies.files[filePath] = dirDependencies.files[filePath];
			}

			for (const funct in dirDependencies.functions) {
				dependencies.functions[funct] = dirDependencies.functions[funct];
			}
		}
	});

	return dependencies;
}


// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	let createScripts = vscode.commands.registerCommand('library-of-isaac-dev-extension.createScriptsFile', () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		const workspaceEdit = new vscode.WorkspaceEdit();
		const workspaceFolders = vscode.workspace.workspaceFolders;

		if (workspaceFolders === undefined) { return; }

		let workspacePath = workspaceFolders[0].uri.fsPath; // gets the path of the first workspace folder

		const encoder = new TextEncoder();

		let luacontents = 'local TSIL_SCRIPTS = {\n';

		const files = fs.readdirSync(workspacePath);

		for (let index = 0; index < files.length; index++) {
			const file = files[index];

			if (file === "TSIL.lua") {
				break;
			} else if (fs.statSync(path.join(workspacePath, file)).isDirectory()) {
				const found = findTSILFile(path.join(workspacePath, file));

				if (found !== undefined) {
					workspacePath = found;
					break;
				}
			}
		}

		const filePath = vscode.Uri.file(workspacePath + '/scripts.lua');

		//First read the enums folder
		luacontents += readFolderContents("Enums.", path.join(workspacePath, "Enums"));

		//Then read the custom callbacks
		luacontents += readFolderContentsShallow("CustomCallbacks.", path.join(workspacePath, "CustomCallbacks"));
		luacontents += readFolderContentsOnlyFolders("CustomCallbacks.", path.join(workspacePath, "/CustomCallbacks"));


		console.log("Starting");
		//Then read the rest
		fs.readdirSync(workspacePath).forEach(file => {
			if (file !== "Enums" && fs.lstatSync(path.join(workspacePath, file)).isDirectory()) {
				luacontents += readFolderContents(file + ".", path.join(workspacePath, file));
			}
		});

		luacontents += "}\nreturn TSIL_SCRIPTS";

		workspaceEdit.createFile(filePath, {
			overwrite: true,
			ignoreIfExists: true,
			contents: encoder.encode(luacontents)
		});
		vscode.workspace.applyEdit(workspaceEdit);

		vscode.window.showInformationMessage('Created scripts file');
	});

	context.subscriptions.push(createScripts);


	let createDocs = vscode.commands.registerCommand('library-of-isaac-dev-extension.createDocsFile', () => {
		const workspaceEdit = new vscode.WorkspaceEdit();
		const workspaceFolders = vscode.workspace.workspaceFolders;

		if (workspaceFolders === undefined) { return; }

		let workspacePath = workspaceFolders[0].uri.fsPath; // gets the path of the first workspace folder

		const tsilPath = findTSILFile(workspacePath);

		if (tsilPath === undefined) { return; }

		TSILParser.resetModulesPerFunction();
		const modules: Set<String> = new Set<String>();

		fs.readdirSync(tsilPath).forEach(file => {
			if (fs.lstatSync(tsilPath + "/" + file).isDirectory()) {
				const dependencies = readDependenciesFromDirectory(tsilPath + "/" + file);

				for (const funct in dependencies.functions) {
					const tokens = funct.split(".");
					const module: String[] = [];

					for (let i = 0; i < tokens.length - 1; i++) {
						const element = tokens[i];

						module.push(element);

						if (module.length > 1) {
							modules.add(module.join("."));
						}
					}
				}
			}
		});

		let docsContent = `---@diagnostic disable: duplicate-doc-alias, duplicate-set-field, missing-return
_G.TSIL = {}

`;

		modules.forEach(module => {
			console.log(module);
			docsContent += `${module} = {}\n`;
		});

		docsContent += "\n";

		fs.readdirSync(tsilPath).forEach(file => {
			if (fs.lstatSync(tsilPath + "/" + file).isDirectory()) {
				docsContent = docsContent + readDocsFromDirectory(tsilPath + "/" + file);
			}
		});

		const filePath = vscode.Uri.file(tsilPath + '/docs.lua');
		const encoder = new TextEncoder();

		workspaceEdit.createFile(filePath, {
			overwrite: true,
			ignoreIfExists: true,
			contents: encoder.encode(docsContent)
		});
		vscode.workspace.applyEdit(workspaceEdit);

		vscode.window.showInformationMessage('Created docs file');
	});

	context.subscriptions.push(createDocs);


	let createDependencies = vscode.commands.registerCommand('library-of-isaac-dev-extension.createDependenciesFile', () => {
		const workspaceEdit = new vscode.WorkspaceEdit();
		const workspaceFolders = vscode.workspace.workspaceFolders;

		if (workspaceFolders === undefined) { return; }

		let workspacePath = workspaceFolders[0].uri.fsPath; // gets the path of the first workspace folder

		const tsilPath = findTSILFile(workspacePath);

		if (tsilPath === undefined) {
			vscode.window.showErrorMessage('Can\'t find the TSIL.lua file');
			return;
		}

		TSILParser.resetModulesPerFunction();

		const dependencies: Dependencies = {
			files: {},
			functions: {}
		};

		fs.readdirSync(tsilPath).forEach(file => {
			if (fs.lstatSync(tsilPath + "/" + file).isDirectory()) {
				const dirDependencies = readDependenciesFromDirectory(tsilPath + "/" + file);

				for (const filePath in dirDependencies.files) {
					dependencies.files[filePath] = dirDependencies.files[filePath];
				}

				for (const funct in dirDependencies.functions) {
					dependencies.functions[funct] = dirDependencies.functions[funct];
				}
			}
		});

		const serializableFiles: any = {};
		for (const filePath in dependencies.files) {
			const fileDependencies = dependencies.files[filePath];
			const modules: string[] = [];
			fileDependencies.modules.forEach(x => modules.push(x));
			serializableFiles[filePath.replace(tsilPath + "/", "")] = {
				functions: fileDependencies.functions,
				modules: modules
			};
		}

		const serializableFunctions: any = {};
		for (const funct in dependencies.functions) {
			const functionDependencies = dependencies.functions[funct];
			const modules: string[] = [];
			functionDependencies.modules.forEach(x => modules.push(x));
			serializableFunctions[funct] = {
				file: functionDependencies.file.replace(tsilPath + "/", ""),
				requiredFiles: functionDependencies.requiredFiles,
				modules: modules
			};
		}

		const serializableDependencies: any = {
			files: serializableFiles,
			functions: serializableFunctions
		};

		const dependenciesJson = JSON.stringify(serializableDependencies);

		const filePath = vscode.Uri.file(tsilPath + '/dependencies.json');
		const encoder = new TextEncoder();

		workspaceEdit.createFile(filePath, {
			overwrite: true,
			ignoreIfExists: true,
			contents: encoder.encode(dependenciesJson)
		});
		vscode.workspace.applyEdit(workspaceEdit);

		vscode.window.showInformationMessage('Created dependencies file');
	});

	context.subscriptions.push(createDependencies);


	let createModules = vscode.commands.registerCommand('library-of-isaac-dev-extension.createModulesFile', () => {
		const workspaceEdit = new vscode.WorkspaceEdit();
		const workspaceFolders = vscode.workspace.workspaceFolders;

		if (workspaceFolders === undefined) { return; }

		let workspacePath = workspaceFolders[0].uri.fsPath; // gets the path of the first workspace folder

		const tsilPath = findTSILFile(workspacePath);

		if (tsilPath === undefined) {
			vscode.window.showErrorMessage('Can\'t find the TSIL.lua file');
			return;
		}

		TSILParser.resetModulesPerFunction();

		fs.readdirSync(tsilPath).forEach(file => {
			if (fs.lstatSync(tsilPath + "/" + file).isDirectory()) {
				readDependenciesFromDirectory(tsilPath + "/" + file);
			}
		});

		const dependencies = TSILParser.getModulesPerFunction();
		const modules: Set<String> = new Set<String>();

		for (const funct in dependencies) {
			const tokens = funct.split(".");
			const module: String[] = [];

			for (let i = 0; i < tokens.length - 1; i++) {
				const element = tokens[i];

				module.push(element);

				if (module.length > 1) {
					modules.add(module.join("."));
				}
			}
		}

		const modulesArr: String[] = [];
		modules.forEach(module => {
			modulesArr.push(`${module} = {}`);
		});

		const filePath = vscode.Uri.file(tsilPath + '/modules.lua');
		const encoder = new TextEncoder();

		workspaceEdit.createFile(filePath, {
			overwrite: true,
			ignoreIfExists: true,
			contents: encoder.encode(modulesArr.join("\n"))
		});
		vscode.workspace.applyEdit(workspaceEdit);

		vscode.window.showInformationMessage('Created modules file');
	});

	context.subscriptions.push(createModules);

	let createGitBook = vscode.commands.registerCommand('library-of-isaac-dev-extension.createGitBook', createGitBookDocs);

	context.subscriptions.push(createGitBook);
}

// This method is called when your extension is deactivated
export function deactivate() { }
