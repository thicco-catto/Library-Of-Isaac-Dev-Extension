import * as parser from "luaparse";

interface TreeNode {
    key: string;
    children: TreeNode[];
}

let modulesPerFunction: {[name: string]: Set<string>} = {};
let commonModules: Set<string> = new Set();
let hasFoundTSILFunction: boolean = false;
let modulesUsed: TreeNode = {key: "TSIL", children: []};
let currentLevel = 0;
let scopeVariables: {[level: number] : {[id: string] : string;}; };
let localFunctions: {[name: string]: Set<string>} = {};


function isIdentifierTSILModule(name: string) : boolean{
    for (let level = currentLevel; level >= 0; level--) {
        const variables = scopeVariables[level];    

        if(variables[name] !== undefined){
            return true;
        }
    }

    return false;
}


function getTSILModuleFromIdentifier(name: string): string{
    for (let level = currentLevel; level >= 0; level--) {
        const variables = scopeVariables[level];    

        if(variables[name] !== undefined){
            return variables[name];
        }
    }

    return "";
}


function getIdentifierFromMemberExpression(init: parser.MemberExpression) : string{
    if(init.base.type === "Identifier"){
        if(isIdentifierTSILModule(init.base.name)){
            return getTSILModuleFromIdentifier(init.base.name) + "." + init.identifier.name;
        }else{
            return init.base.name + "." + init.identifier.name;
        }
    }else if(init.base.type === "MemberExpression"){
        return getIdentifierFromMemberExpression(init.base) + "." + init.identifier.name;
    }

    return "";
}


function addTSILModuleToTree(module: string){
    const modules = module.split(".");
    let currentNode = modulesUsed;

    for (let i = 1; i < modules.length; i++) {
        const name = modules[i];
        let foundChildren = false;

        currentNode.children.forEach(children => {
            if(children.key === name){
                currentNode = children;
                foundChildren = true;
            }
        });

        if(!foundChildren){
            const newNode = {key: name, children: []};
            currentNode.children.push(newNode);
            currentNode = newNode;
        }
    }
}


function parseEnumsModuleName(module: string): string{
    if(module.startsWith("TSIL.Enums") && !module.startsWith("TSIL.Enums.CustomCallback")){
        //Only get the first 3 strings:
        //  -1st is TSIL
        //  -2nd is Enums
        //  -3rd is the name of the enum
        return module.split(".").slice(0, 3).join(".");
    }

    return module;
}


function getModulesSetForFunction(identifier: string){
    const modules: Set<string> = new Set();

    commonModules.forEach(module => {
        const parsedModuleName = parseEnumsModuleName(module);
        if(identifier !== module && identifier !== parsedModuleName){
            modules.add(parsedModuleName);
        }
    });
    treeToSet(modulesUsed).forEach(module => {
        const parsedModuleName = parseEnumsModuleName(module);
        if(identifier !== module && identifier !== parsedModuleName){
            modules.add(parsedModuleName);
        }
    });

    return modules;
}


function onMemberExpression(memberExpression: parser.MemberExpression){
    const identifer = getIdentifierFromMemberExpression(memberExpression);

    if(identifer.startsWith("TSIL") && !identifer.startsWith("TSIL.Enums.CustomCallback")){
        addTSILModuleToTree(identifer);
    }
}


function onFunctionDeclaration(functionDeclaration: parser.FunctionDeclaration){
    if(functionDeclaration.identifier === undefined || functionDeclaration.identifier === null){ return; }

    if(functionDeclaration.identifier.type !== "MemberExpression"){ return; }

    const identifer = getIdentifierFromMemberExpression(functionDeclaration.identifier);

    if(!identifer.startsWith("TSIL")){ return; }

    if(!hasFoundTSILFunction){
        commonModules = treeToSet(modulesUsed);
        resetUsedModules();
    }

    modulesPerFunction[identifer] = getModulesSetForFunction(identifer);

    resetUsedModules();
}


function onLocalStatement(localStatement: parser.LocalStatement){
    for (let i = 0; i < localStatement.variables.length; i++) {
        const variable = localStatement.variables[i];
        const init = localStatement.init[i];

        if(init === undefined){ continue; }

        let value: string = "";

        if(init.type === "Identifier"){
            //Is single identifier
            if(isIdentifierTSILModule(init.name)){
                value = getTSILModuleFromIdentifier(init.name);
            }
        }else if(init.type === "MemberExpression"){
            //Is indexing table
            value = getIdentifierFromMemberExpression(init);
        }

        if(value.startsWith("TSIL")){
            scopeVariables[currentLevel][variable.name] = value;
            addTSILModuleToTree(value);
        }
    }
}


function onCallExpression(callExpression: parser.CallExpression){
    if(callExpression.base.type !== "MemberExpression"){ return; }

    const identifer = getIdentifierFromMemberExpression(callExpression.base);

    if(identifer !== "TSIL.__AddInternalCallback"){ return; }

    callExpression.arguments.forEach(argument => {
        if(argument.type !== "MemberExpression"){ return; }

        const argumentIdentifier = getIdentifierFromMemberExpression(argument);

        if(!argumentIdentifier.startsWith("TSIL.Enums.CustomCallback")){ return; }

        addTSILModuleToTree(argumentIdentifier);
    });
}


function onCreateNode(node: parser.Node){
    switch(node.type){
        case "CallExpression":{
            onCallExpression(node);

            break;
        }

        case "MemberExpression":{
            onMemberExpression(node);            

            break;
        }
        
        case "FunctionDeclaration":{
            onFunctionDeclaration(node);

            break;
        }

        case 'LocalStatement':{
            onLocalStatement(node);

            break;
        }
    }
}


function onCreateScope(){
    currentLevel++;
    scopeVariables[currentLevel] = {};
}


function onDestroyScope(){
    scopeVariables[currentLevel] = {};
    currentLevel--;
}


export function parseLuaFile(luaString : string){
    currentLevel = 0;
    // eslint-disable-next-line @typescript-eslint/naming-convention
    scopeVariables = {0: {}};
    localFunctions = {};
    resetUsedModules();
    commonModules = new Set();
    hasFoundTSILFunction = false;
    parser.parse(luaString, {
        luaVersion: "5.3",
        scope: true,
        onCreateNode: onCreateNode,
        onCreateScope: onCreateScope,
        onDestroyScope: onDestroyScope
    });

    const lines = luaString.split("\n");
    lines.forEach(line =>{
        if(line.startsWith("--##") && !line.startsWith("--##use")){
            const callbackName = line.replace("--##", "").trim();
            const moduleIdentifier = "TSIL.Enums.CustomCallback." + callbackName;
            modulesPerFunction[moduleIdentifier] = getModulesSetForFunction(moduleIdentifier);
        }
    });
}


function treeToSet(tree: TreeNode, prefix = "", used = new Set<string>): Set<string>{
    if(tree.children.length === 0){
        return used.add(prefix + tree.key);
    }else{
        tree.children.forEach(child => {
            treeToSet(child, prefix + tree.key + ".", used);
        });
    }

    return used;
}


export function resetUsedModules(){
    modulesUsed = {key: "TSIL", children: []};
}


export function getUsedModules(): Set<string>{
    return treeToSet(modulesUsed);
}


export function resetModulesPerFunction(){
    modulesPerFunction = {};
}


export function getModulesPerFunction(): {[name: string]: Set<string>}{
    return modulesPerFunction;
}