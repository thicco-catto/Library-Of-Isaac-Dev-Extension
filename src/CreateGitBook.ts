import * as vscode from 'vscode';
import * as fs from 'fs';
import path = require('path');
import { TextEncoder } from 'util';
import { DOC_LINKS_PER_VANILLA_TYPE } from './DocLinksPerVanillaType';

interface ModuleInfo {
    hasFunctions: boolean,
    submodules: {[key: string]: ModuleInfo}
}

interface FunctionDescription {
    name: string,
    description: string,
    params: FunctionParam[],
    return: FunctionReturn
}

interface FunctionParam {
    name: string,
    type: string,
    default: string,
    description: string
}

interface FunctionReturn {
    type: string,
    description: string,
}

interface EnumDescription {
    name: string,
    description: string,
    fields: EnumField[]
}

interface EnumField {
    name: string,
    value: string,
    description: string,
}

interface CallbackDescription {
    name: string,
    description: string,
    params: CallbackField[],
    optionalArgs: CallbackField[]
}

interface CallbackField {
    name: string,
    type: string
}

let workspaceEdit: vscode.WorkspaceEdit;
let functionsPerModule: {[key: string]: FunctionDescription[]};
let enums: EnumDescription[];
let customCallbacks: CallbackDescription[];

function readDocsFile(file: string){
    const fileContents = fs.readFileSync(file, 'utf-8');
	const fileLines = fileContents.split("\n");
    fileLines.splice(0, 3);

    let currentDescription = "";

    let currentFunctionParams: FunctionParam[] = [];
    let currentFunctionReturn: FunctionReturn = {
        description: "",
        type: ""
    };

    let currentEnumDescription = "";
    let currentEnumName = "";
    let currentEnumFields: EnumField[] = [];
    let isReadingEnumFields = false;
    let isReadingMultiLineComment = false;

    let callbackParams: CallbackField[] = [];
    let callbackOptionalArgs: CallbackField[] = [];

    let isReadingParams = false;
    let isReadingOptionalArgs = false;

    fileLines.forEach(line => {
        line = line.trim();
        if(line.startsWith("TSIL.Enums.")){
            currentEnumDescription = currentDescription;
            currentDescription = "";
            isReadingEnumFields = true;
        }else if(line.startsWith("---@enum")){
            //Enum declaration
            const parsedEnum = line.replace("---@enum", "").trim();

            const enumTokens = parsedEnum.split(" ");
            currentEnumName = enumTokens[0];
        }else if(line.startsWith("---@param")){
            //Param line
            const parsedParam = line.replace("---@param", "").trim();
            const paramTokens = parsedParam.split("@");

            const nameType = paramTokens[0];
            const nameTypeTokens = nameType.split(" ");
            let name = nameTypeTokens[0].trim();
            nameTypeTokens.splice(0, 1);
            let type = nameTypeTokens.join(" ").trim();

            if(name.endsWith("?")){
                name.replace("?", "");
                type += "?";
            }

            paramTokens.splice(0, 1);
            const fullDescription = paramTokens.join("@");

            const defaultDesc = fullDescription.split("|");

            if(!defaultDesc[0].toLowerCase().startsWith("default:")){
                //It has no default
                currentFunctionParams.push({
                    name: name,
                    type: type,
                    default: "",
                    description: fullDescription.trim()
                });
            }else{
                //There is a default
                const defaultType = defaultDesc[0].toLowerCase().replace("default:", "");
                defaultDesc.splice(0, 1);
                const description = defaultDesc.join("|");

                currentFunctionParams.push({
                    name: name,
                    type: type,
                    default: defaultType,
                    description: description
                });
            }
        }else if(line.startsWith("---@vararg")){
            //Variable argument param
            const parsedParam = line.replace("---@vararg", "").trim();

            const paramTokens = parsedParam.split("@");

            const nameType = paramTokens[0];
            const nameTypeTokens = nameType.split(" ");
            let name = "...";
            let type = nameTypeTokens.join(" ").trim();

            paramTokens.splice(0, 1);
            const fullDescription = paramTokens.join("@");

            currentFunctionParams.push({
                name: name,
                type: type,
                default: "",
                description: fullDescription.trim()
            });
        }else if(line.startsWith("---@return")){
            //Return line
            const parsedReturn = line.replace("---@return", "").trim();
            const returnTokens = parsedReturn.split("@");

            const returnType = returnTokens[0];
            returnTokens.splice(0, 1);
            const returnDescription = returnTokens.join("@");

            currentFunctionReturn = {
                type: returnType.trim(),
                description: returnDescription.trim()
            };
        }else if(line.startsWith("---@generic")){
            return;
        }else if(line.startsWith("---")){
            //Description
            if(currentEnumName === "CustomCallback"){
                let parsedLine = line.substring(3, line.length);

                if(parsedLine.trim().toLowerCase() === "params:"){
                    isReadingParams = true;
                    isReadingOptionalArgs = false;
                    return;
                }else if(parsedLine.trim().toLowerCase() === "optional args:"){
                    isReadingParams = false;
                    isReadingOptionalArgs = true;
                    return;
                }

                if(isReadingParams || isReadingOptionalArgs){
                    parsedLine = parsedLine.trim();
                    if(!parsedLine.startsWith("*")){ return; }

                    parsedLine = parsedLine.substring(1, parsedLine.length);
                    const nameTypeTokens = parsedLine.split("-");
                    const name = nameTypeTokens[0].trim();
                    const type = nameTypeTokens[1].trim();

                    if(isReadingParams){
                        callbackParams.push({
                            name: name,
                            type: type
                        });
                    }else if(isReadingOptionalArgs){
                        callbackOptionalArgs.push({
                            name: name,
                            type: type
                        });
                    }

                    return;
                }

                if(parsedLine.length === 0){
                    currentDescription += "\n";
                }else{
                    currentDescription += parsedLine + " ";
                }

                return;
            }

            if(line.trim() === "---"){
                currentDescription += "\n";
            }else{
                currentDescription += line.replace("---", "").trim() + " ";
            }
        }else if(line.startsWith("--[[")){
            isReadingMultiLineComment = true;
        }else if(line.startsWith("--]]")){
            isReadingMultiLineComment = false;
        }else if(line.startsWith("--")){
            //Description
            if(currentEnumName === "CustomCallback"){
                let parsedLine = line.substring(2, line.length);

                if(parsedLine.trim().toLowerCase() === "params:"){
                    isReadingParams = true;
                    isReadingOptionalArgs = false;
                    return;
                }else if(parsedLine.trim().toLowerCase() === "optional args:"){
                    isReadingParams = false;
                    isReadingOptionalArgs = true;
                    return;
                }

                if(isReadingParams || isReadingOptionalArgs){
                    parsedLine = parsedLine.trim();
                    if(!parsedLine.startsWith("*")){ return; }

                    parsedLine = parsedLine.substring(1, parsedLine.length);
                    const nameTypeTokens = parsedLine.split("-");
                    const name = nameTypeTokens[0].trim();
                    const type = nameTypeTokens[1].trim();

                    if(isReadingParams){
                        callbackParams.push({
                            name: name,
                            type: type
                        });
                    }else if(isReadingOptionalArgs){
                        callbackOptionalArgs.push({
                            name: name,
                            type: type
                        });
                    }

                    return;
                }

                if(parsedLine.length === 0){
                    currentDescription += "\n";
                }else{
                    currentDescription += parsedLine + " ";
                }

                return;
            }

            if(line.trim() === "--"){
                currentDescription += "\n";
            }else{
                currentDescription += line.replace("--", "").trim() + " ";
            }
        }else if(line.startsWith("function TSIL.")){
            const parsedFunction = line.replace("function TSIL.", "").split("(")[0];

            const functionTokens = parsedFunction.split(".");

            const functionName = functionTokens[functionTokens.length - 1];
            functionTokens.splice(functionTokens.length - 1);
            const moduleName = functionTokens.join(".");

            if(functionsPerModule[moduleName] === undefined){
                functionsPerModule[moduleName] = [];
            }

            functionsPerModule[moduleName].push({
                name: functionName,
                description: currentDescription,
                params: currentFunctionParams,
                return: currentFunctionReturn
            });
        }else if(line === "}" || line === "end"){
            if(line === "}"){
                enums.push({
                    name: currentEnumName,
                    description: currentEnumDescription,
                    fields: currentEnumFields,
                });
            }

            currentDescription = "";

            currentFunctionParams = [];
            currentFunctionReturn = {
                description: "",
                type: ""
            };

            currentEnumDescription = "";
            currentEnumName = "";
            currentEnumFields = [];
            isReadingEnumFields = false;
            isReadingMultiLineComment = false;
        }else if(isReadingMultiLineComment){
            if(line.trim() === ""){
                currentDescription += "\n";
            }else{
                currentDescription += line + " ";
            }
        }else if(isReadingEnumFields){
            if(line.length === 0){
                return;
            }

            const enumFieldTokens = line.split("=");
            
            const enumFieldName = enumFieldTokens[0].trim();
            enumFieldTokens.splice(0, 1);
            const enumValue = enumFieldTokens.join("=").trim();
            const parsedValue = enumValue.endsWith(",")? enumValue.substring(0, enumValue.length-1).trim() : enumValue;

            if(currentEnumName === "CustomCallback"){
                customCallbacks.push({
                    name: enumFieldName,
                    description: currentDescription,
                    params: callbackParams,
                    optionalArgs: callbackOptionalArgs
                });

                callbackParams = [];
                callbackOptionalArgs = [];

                isReadingParams = false;
                isReadingOptionalArgs = false;
            }else{
                currentEnumFields.push({
                    description: currentDescription,
                    name: enumFieldName,
                    value: parsedValue
                });
            }

            currentDescription = "";
        }
    });
}


function getLinkToDocsForType(type: string, putQuotations: boolean): string{
    const isOptional = type.endsWith("?");
    type = type.replace("?", "");
    const isArray = type.endsWith("[]");
    type = type.replace("[]", "");

    if(type.startsWith("fun(")){
        let parenthesesLevel = 0;
        let functionParams: string = "";
        let returnType: string = "";

        for (let i = 0; i < type.length; i++) {
            const char = type.charAt(i);

            if(char === '('){
                parenthesesLevel++;
            }else if(char === ')'){
                parenthesesLevel--;

                if(parenthesesLevel === 0){
                    functionParams = type.substring(4, i);
                    if(i === type.length - 1){
                        returnType = type.substring(i+2, type.length);
                    }
                    break;
                }
            }
        }

        const linkedParams = functionParams.split(",").map(param => {
            const paramTypeTokens = param.trim().split(":");
            const paramName = paramTypeTokens[0];
            paramTypeTokens.splice(0, 1);
            const paramType = paramTypeTokens.join(":");
            const linkedType = getLinkToDocsForType(paramType, putQuotations);
            return `${paramName}: ${linkedType}`;
        }).join(", ");
        const linkedReturn = getLinkToDocsForType(returnType, putQuotations);

        if(linkedReturn.length > 0){
            type = `fun(${linkedParams}): ${linkedReturn}`;
        }else{
            type = `fun(${linkedParams})`;
        }
    }else if(type.startsWith("table<")){
        const typeTokens = type.substring(6, type.length-1).split(",").map(x => x.trim());

        const linkedTypes = typeTokens.map(x => getLinkToDocsForType(x, putQuotations));
        type = `table<${linkedTypes.join(", ")}>`;
    }else{
        const typeTokens = type.split("|").map(x => x.trim());

        if(typeTokens.length > 1){
            const linkedTypes = typeTokens.map(x => getLinkToDocsForType(x, putQuotations));
            type = linkedTypes.join(" | ");
        }else{
            let link = DOC_LINKS_PER_VANILLA_TYPE[type];

            if(link === undefined){
                const foundEnum = enums.find((enumDescription) => enumDescription.name === type);

                if(foundEnum !== undefined){
                    link = `../custom-enums/${foundEnum.name.toLowerCase()}.md`;
                }
            }

            if(link !== undefined){
                if(putQuotations){
                    type = `\`[\`${type}\`](${link})\``;
                }else{
                    type = `[${type}](${link})`;
                }
            }
        }
    }

    if(isArray){
        if(putQuotations){
            type += "[]";
        }else{
            type += "\\[]";
        }
    }

    if(isOptional){
        type += "?";
    }

    return type;
}


function writeFunctionOverviewRow(moduleName: string, functionDesc: FunctionDescription, fileContents: string){
    fileContents += "| ";

    if(functionDesc.return.type.length === 0){
        fileContents += "void";
    }else{
        fileContents += getLinkToDocsForType(functionDesc.return.type, false);
    }
    fileContents += " | ";
    fileContents += `[${functionDesc.name}](${moduleName.toLowerCase()}.md#${functionDesc.name.toLowerCase()})(`;

    fileContents += functionDesc.params.map(param => {
        let paramStr = `\`${getLinkToDocsForType(param.type, true)}\` ${param.name}`;

        if(param.default.length !== 0){
            paramStr += ` = ${param.default}`;
        }

        return paramStr;
    }).join(", ");

    fileContents += ") |\n";

    return fileContents;
}


function writeFunctionDetailed(functionDesc: FunctionDescription, fileContents: string){
    fileContents += `### ${functionDesc.name}()\n\n`;

    fileContents += `\``;

    if(functionDesc.return.type.length === 0){
        fileContents += "void";
    }else{
        fileContents += getLinkToDocsForType(functionDesc.return.type, true);
    }

    fileContents += ` ${functionDesc.name}(`;

    fileContents += functionDesc.params.map(param => {
        let paramStr = `${getLinkToDocsForType(param.type, true)} ${param.name}`;

        if(param.default.length !== 0){
            paramStr += ` = ${param.default}`;
        }

        return paramStr;
    }).join(", ");

    fileContents += ")\`\n\n";

    fileContents += functionDesc.description + "\n\n";

    return fileContents;
}


function writeModuleOverviewTable(moduleName: string, functions: FunctionDescription[], fileContents: string){
    fileContents += "| Return Value | Function |\n| - | - |\n";

    functions.forEach(functionDescription => {
        fileContents = writeFunctionOverviewRow(moduleName, functionDescription, fileContents);
    });

    fileContents += "\n";

    return fileContents;
}


function writeModuleDetailedView(functions: FunctionDescription[], fileContents: string){
    functions.forEach(functionDescription => {
        fileContents = writeFunctionDetailed(functionDescription, fileContents);
    });

    return fileContents;
}


function writeModuleToFile(path: string, moduleName: string, functions: FunctionDescription[]){
    const moduleNameTokens = moduleName.split(".");
    const onlyModuleName = moduleNameTokens[moduleNameTokens.length-1];

    let fileContents = `# ${onlyModuleName}\n\n## Overview\n\n`;

    fileContents = writeModuleOverviewTable(onlyModuleName, functions, fileContents);

    fileContents += "## Functions\n\n";

    fileContents = writeModuleDetailedView(functions, fileContents);

    fileContents = fileContents.replace(/``/g, "");

    const filePath = vscode.Uri.file(path + `/modules/${moduleName.toLowerCase().replace(".", "/")}.md`);
	const encoder = new TextEncoder();

    workspaceEdit.createFile(filePath, { 
        overwrite: true,
        ignoreIfExists: true,
        contents: encoder.encode(fileContents)
    });
}


function writeModulesToFiles(path: string){
    for (const moduleName in functionsPerModule) {
        if(moduleName === ""){ continue; }

        const functions = functionsPerModule[moduleName];
        
        functions.sort((a, b) => a.name.localeCompare(b.name));

        writeModuleToFile(path, moduleName, functions);
    }
}


function addFieldRowToEnumTable(field: EnumField, fileContents: string){
    fileContents += `| ${field.name} | ${field.value} | ${field.description} |\n`;
    return fileContents;
}


function writeEnumToFile(enumDescription: EnumDescription, path: string){
    let fileContents = `# ${enumDescription.name}\n\n`;

    if(enumDescription.description.length > 0){
        fileContents += enumDescription.description + "\n\n";
    }

    fileContents += `| Enumerator | Value | Description |\n`;
    fileContents += `| - | - | - |\n`;

    enumDescription.fields.forEach(field => {
        fileContents = addFieldRowToEnumTable(field, fileContents);
    });

    const filePath = vscode.Uri.file(path + `/custom-enums/${enumDescription.name.toLowerCase()}.md`);
	const encoder = new TextEncoder();

    workspaceEdit.createFile(filePath, { 
        overwrite: true,
        ignoreIfExists: true,
        contents: encoder.encode(fileContents)
    });
}


function writeEnumsToFiles(path: string){
    enums.sort((a, b) => a.name.localeCompare(b.name));

    enums.forEach(enumDescription => {
        if(enumDescription.name === "CustomCallback"){ return; }
        writeEnumToFile(enumDescription, path);
    });
}


function addCallbackParamsToTable(fields: CallbackField[], fileContents: string){
    fields.forEach(field => {
        fileContents += `| ${field.name} | ${field.type} |\n`;
    });

    return fileContents;
}


function writeCallbackDescription(callbackDescription: CallbackDescription, fileContents: string){
    fileContents += `### ${callbackDescription.name}\n\n`;

    fileContents += `${callbackDescription.description}\n`;

    if(callbackDescription.params.length !== 0){
        fileContents += `#### Callback parameters\n\n`;
        fileContents += `| Name | Type |\n`;
        fileContents += `| - | - |\n`;
        fileContents = addCallbackParamsToTable(callbackDescription.params, fileContents);
        fileContents += "\n";
    }

    if(callbackDescription.optionalArgs.length !== 0){
        fileContents += `#### Optional arguments\n\n`;
        fileContents += `| Name | Type |\n`;
        fileContents += `| - | - |\n`;
        fileContents = addCallbackParamsToTable(callbackDescription.optionalArgs, fileContents);
        fileContents += "\n";
    }

    return fileContents;
}


function writeCustomCallbacksToFile(path: string){
    customCallbacks.sort((a, b) => a.name.localeCompare(b.name));

    let fileContents = "# CustomCallback\n\n## Calbacks\n\n";

    customCallbacks.forEach(callbackDescription => {
        fileContents = writeCallbackDescription(callbackDescription, fileContents);
        fileContents += "\n";
    });

    const filePath = vscode.Uri.file(path + `/customcallback.md`);
	const encoder = new TextEncoder();

    workspaceEdit.createFile(filePath, { 
        overwrite: true,
        ignoreIfExists: true,
        contents: encoder.encode(fileContents)
    });
}


function writeSubModulesToSummary(path: string, subModules: {[key: string]: ModuleInfo}, parentModules: string, level: number){
    let fileContents = "";

    for (const moduleName in subModules) {
        const moduleInfo = subModules[moduleName];
        
        let moduleLine = `* [${moduleName}](modules/${parentModules}${moduleName.toLowerCase()}.md)\n`;
        if(!moduleInfo.hasFunctions){
            const filePath = vscode.Uri.file(path + `/modules/${parentModules}${moduleName.toLowerCase()}/README.md`);
            const encoder = new TextEncoder();

            workspaceEdit.createFile(filePath, { 
                overwrite: true,
                ignoreIfExists: true,
                contents: encoder.encode(`# ${moduleName}`)
            });

            moduleLine = `* [${moduleName}](modules/${parentModules}${moduleName.toLowerCase()}/README.md)\n`;
        }

        fileContents += moduleLine.padStart(moduleLine.length + level * 2, " ");

        fileContents += writeSubModulesToSummary(path, moduleInfo.submodules, `${parentModules}${moduleName}/`, level + 1);
    }

    return fileContents;
}


function writeSummary(path: string){
    const initialLines = [
        "# Table of contents",
        "",
        "* [Library of Isaac](README.md)",
        "* [Get Started](get-started.md)",
        "* [F.A.Q.](f.a.q..md)",
        "* [Custom Enums](custom-enums/README.md)",
    ];

    const customEnumsFilePath = vscode.Uri.file(path + `/custom-enums/README.md`);
    const encoder = new TextEncoder();

    workspaceEdit.createFile(customEnumsFilePath, { 
        overwrite: true,
        ignoreIfExists: true,
        contents: encoder.encode(`# Custom Enums`)
    });

    let fileContents = initialLines.join("\n");
    fileContents += "\n";

    enums.forEach(enumDescription => {
        fileContents += `  * [${enumDescription.name}](custom-enums/${enumDescription.name.toLowerCase()}.md)\n`;
    });

    fileContents += "* [CustomCallback](customcallback.md)\n\n";

    fileContents += "## Modules\n\n";

    const modulesToAdd: {[key: string]: ModuleInfo} = {};

    for (const moduleName in functionsPerModule) {
        if(moduleName === ""){ continue; }
        
        const modulesToken = moduleName.split(".");
        let currentSubModules = modulesToAdd;
        let subModuleInfo: ModuleInfo | undefined;

        modulesToken.forEach(subModuleName => {
            subModuleInfo = currentSubModules[subModuleName];

            if(subModuleInfo === undefined){
                subModuleInfo = {
                    hasFunctions: false,
                    submodules: {}
                };
            }

            currentSubModules[subModuleName] = subModuleInfo;

            currentSubModules = subModuleInfo.submodules;
        });

        if(subModuleInfo !== undefined){
            subModuleInfo.hasFunctions = true;
        }
    }

    fileContents += writeSubModulesToSummary(path, modulesToAdd, "", 0);

    const filePath = vscode.Uri.file(path + `/SUMMARY.md`);

    workspaceEdit.createFile(filePath, { 
        overwrite: true,
        ignoreIfExists: true,
        contents: encoder.encode(fileContents)
    });
}


export function createGitBookDocs(){
    workspaceEdit = new vscode.WorkspaceEdit();
	const workspaceFolders = vscode.workspace.workspaceFolders;

    if(workspaceFolders === undefined){ return; }

    let workspacePath = workspaceFolders[0].uri.fsPath;
    functionsPerModule = {};
    enums = [];
    customCallbacks = [];
    readDocsFile(path.join(workspacePath, "docs.lua"));

    writeModulesToFiles(workspacePath);

    writeEnumsToFiles(workspacePath);

    writeCustomCallbacksToFile(workspacePath);

    writeSummary(workspacePath);

    vscode.workspace.applyEdit(workspaceEdit);
}