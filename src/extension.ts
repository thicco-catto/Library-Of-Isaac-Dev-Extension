// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import { TextEncoder } from 'util';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as TSILParser from './TSILParser';


function findTSILFile(path: string) : string|undefined{
	const files = fs.readdirSync(path);

	for (let index = 0; index < files.length; index++) {
		const file = files[index];

		if(file === "TSIL.lua"){
			return path;
		}else if(!/[^a-z]/i.test(file)){
			const found = findTSILFile(path + "/" + file);

			if(found !== undefined){
				return found;
			}
		}
	}

	return undefined;
}


function readFolderContents(prefix: string, path: string) : string{
	let totalString = "";
	fs.readdirSync(path).forEach(file => {
		if(file.endsWith(".lua")){
			totalString += "\"" + prefix + file.replace(".lua", "") + "\",\n";
		}else{
			totalString += readFolderContents(prefix + file + ".", path + "/" + file);
		}
	});

	return totalString;
}


function readFolderContentsShallow(prefix: string, path: string) : string{
	let totalString = "";
	fs.readdirSync(path).forEach(file => {
		if(file.endsWith(".lua")){
			totalString += "\"" + prefix + file.replace(".lua", "") + "\",\n";
		}
	});

	return totalString;
}


function readFolderContentsOnlyFolders(prefix: string, path: string) : string{
	let totalString = "";
	fs.readdirSync(path).forEach(file => {
		if(!file.endsWith(".lua")){
			totalString += readFolderContents(prefix + file + ".", path + "/" + file);
		}
	});

	return totalString;
}


function readDocsFromFile(file: string): string{
	const fileContents = fs.readFileSync(file, 'utf-8');
	const fileLines = fileContents.split("\n");

	let fileDocs = "";
	let docsPerFunction = "";

	let isReadingDocs = false;
	let isReadingEnum = false;

	fileLines.forEach(element => {
		if(isReadingDocs){
			if(isReadingEnum){
				docsPerFunction += element + "\n";
				if(element.startsWith("}")){
					fileDocs += docsPerFunction + "\n";
					isReadingDocs = false;
				}
			}else{
				if(element.startsWith("---")){
					docsPerFunction += element + "\n";
				}else{
					if(element.startsWith("function TSIL")){
						docsPerFunction += element + "\nend\n\n";

						fileDocs += docsPerFunction;
					}

					isReadingDocs = false;
				}
			}
		}else{
			if(element.startsWith("---")){
				docsPerFunction = "";
				docsPerFunction += element + "\n";
				isReadingDocs = true;
				isReadingEnum = element.startsWith("---@enum") || element.startsWith("--- @enum");
			}
		}
	});

	return fileDocs;
}


function readDocsFromDirectory(path: string): string{
	let docs = "";

	fs.readdirSync(path).forEach(file => {
		if(file.endsWith(".lua")){
			docs += readDocsFromFile(path + "/" + file);
		}else if(fs.lstatSync(path + "/" + file).isDirectory()){
			docs += readDocsFromDirectory(path + "/" + file);
		}
	});

	return docs;
}


function readDependenciesFromFile(file: string){
	const fileContents = fs.readFileSync(file, 'utf-8');

	TSILParser.parseLuaFile(fileContents);
}


function readDependenciesFromDirectory(path: string){

	fs.readdirSync(path).forEach(file => {
		if(file.endsWith(".lua")){
			readDependenciesFromFile(path + "/" + file);
		}else if(fs.lstatSync(path + "/" + file).isDirectory()){
			readDependenciesFromDirectory(path + "/" + file);
		}
	});
}


// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	let createScripts = vscode.commands.registerCommand('library-of-isaac-dev-extension.createScriptsFile', () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		const workspaceEdit = new vscode.WorkspaceEdit();
		const workspaceFolders = vscode.workspace.workspaceFolders;

		if(workspaceFolders === undefined){ return; }

		let workspacePath = workspaceFolders[0].uri.fsPath; // gets the path of the first workspace folder

		const encoder = new TextEncoder();

		let luacontents = 'local TSIL_SCRIPTS = {\n';

		const files = fs.readdirSync(workspacePath);

		for (let index = 0; index < files.length; index++) {
			const file = files[index];

			if(file === "TSIL.lua"){
				break;
			}else if(!/[^a-z]/i.test(file)){
				const found = findTSILFile(workspacePath + "/" + file);

				if(found !== undefined){
					workspacePath = found;
				}
			}
		}

		const filePath = vscode.Uri.file(workspacePath + '/scripts.lua');

		//First read the enums folder
		luacontents += readFolderContents("Enums.", workspacePath + "/Enums");

		//Then read the custom callbacks
		luacontents += readFolderContentsShallow("CustomCallbacks.", workspacePath + "/CustomCallbacks");
		luacontents += readFolderContentsOnlyFolders("CustomCallbacks.", workspacePath + "/CustomCallbacks");

		//Then read the rest
		fs.readdirSync(workspacePath).forEach(file => {
			if(file !== "Enums" && !/[^a-z]/i.test(file)){
				luacontents += readFolderContents(file + ".", workspacePath + "/" + file);
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

		if(workspaceFolders === undefined){ return; }

		let workspacePath = workspaceFolders[0].uri.fsPath; // gets the path of the first workspace folder

		const tsilPath = findTSILFile(workspacePath);

		if(tsilPath === undefined) { return; }

		let docsContent = `---@diagnostic disable: duplicate-doc-alias
_G.TSIL = {}

`;

		fs.readdirSync(tsilPath).forEach(file => {
			if(fs.lstatSync(tsilPath + "/" + file).isDirectory()){
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

		if(workspaceFolders === undefined){ return; }

		let workspacePath = workspaceFolders[0].uri.fsPath; // gets the path of the first workspace folder

		const tsilPath = findTSILFile(workspacePath);

		if(tsilPath === undefined) {
			vscode.window.showErrorMessage('Can\'t find the TSIL.lua file');
			return;
		}

		TSILParser.resetModulesPerFunction();

		fs.readdirSync(tsilPath).forEach(file => {
			if(fs.lstatSync(tsilPath + "/" + file).isDirectory()){
				readDependenciesFromDirectory(tsilPath + "/" + file);
			}
		});

		const dependencies = TSILParser.getModulesPerFunction();
		const dependenciesSerializable: {[key: string]: string[]} = {};

		for (const key in dependencies) {
			if (Object.prototype.hasOwnProperty.call(dependencies, key)) {
				const element = dependencies[key];
				dependenciesSerializable[key] = [];

				element.forEach(s => {
					if(s !== "TSIL"){
						dependenciesSerializable[key].push(s);
					}
				});
			}
		}

		const dependenciesJson = JSON.stringify(dependenciesSerializable);

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

		if(workspaceFolders === undefined){ return; }

		let workspacePath = workspaceFolders[0].uri.fsPath; // gets the path of the first workspace folder

		const tsilPath = findTSILFile(workspacePath);

		if(tsilPath === undefined) {
			vscode.window.showErrorMessage('Can\'t find the TSIL.lua file');
			return;
		}

		TSILParser.resetModulesPerFunction();

		fs.readdirSync(tsilPath).forEach(file => {
			if(fs.lstatSync(tsilPath + "/" + file).isDirectory()){
				readDependenciesFromDirectory(tsilPath + "/" + file);
			}
		});

		const dependencies = TSILParser.getModulesPerFunction();
		const modules: Set<String> = new Set<String>();

		for (const funct in dependencies) {
			const tokens = funct.split(".");
			const module: String[] = [];

			for (let i = 0; i < tokens.length-1; i++) {
				const element = tokens[i];
				
				module.push(element);

				if(module.length > 1){
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
}

// This method is called when your extension is deactivated
export function deactivate() {}
