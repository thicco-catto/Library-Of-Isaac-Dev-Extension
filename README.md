# Library Of Isaac Dev Extension

This extension is used to develop the Library of Isaac. If you are looking to create mods using the library itself instead, check out [this extension](https://marketplace.visualstudio.com/items?itemName=ThiccoCatto.library-of-isaac-extension).

## Features

### Create Scripts
This command reads all the files in the library and creates the `scripts.lua` file, which contains all the relative paths of all the files, so they can be included by the library.

### Create Dependencies File
This command analyzes all lua files to identify which feature each function or callback is using and creates the appropiate `dependencies.json` file. This file is used by the other extension when reducing the library size.

### Create Docs File
This command analyzes all lua files and extracts only the luadoc comments and relevant information for the lua autocomplete to work and puts all of it into a `docs.lua` file.

### Create GitBook Docs
This command can and should only be used in the docs branch of the library.
It reads the `docs.lua` file created by `Create Docs File` and automatically creates all of the gitbook markdown files.

## Release Notes

### 2.0.0

- Added common prefix (`LoI Dev`) to all commands.
- Updated dependecies format.
- Fixed docs not including classes and module declarations.
- Removed `Create Modules File` command since the docs already include module declarations now and made it redundant.

### 1.4.0

- Added `Create GitBook Docs` command.

### 1.3.0

- Added `Create Modules File` command.

### 1.1.0

- Added `Create Dependencies File` and `Create Docs File`.

### 1.0.0

- Initial release of Library Of Isaac Dev Extension.
