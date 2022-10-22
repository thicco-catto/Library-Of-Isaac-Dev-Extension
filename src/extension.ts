// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import { TextEncoder } from 'util';
import * as vscode from 'vscode';
import * as fs from 'fs';


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


// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	let disposable = vscode.commands.registerCommand('library-of-isaac-dev-extension.createScriptsFile', () => {
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

	context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
export function deactivate() {}
