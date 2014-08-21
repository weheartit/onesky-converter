onesky-converter
================

OneSky conversion script for we heart it


This script is intended to be used with the WHI iOS repo. It does a few things:

1. Looks for a file or zip in your downloads called iOS (and unzips it if necessary)
2. Renames the folders in it to have the .lproj extension
3. copies pr-BR translations to pr (if they're there)
4. copies these translations over to the current iOS project you're sitting in
5. removes the iOS zip or folder. (you can avoid this by using `-n` or `--no-delete`)

Usage
=====

`onesky-converter(1)`

```
usage: onesky-converter [OPTIONS]
Options:
    onesky-converter [-h|--help]              Print this help.
    onesky-converter [-n|--no-delete]         Don't delete the localizations file when complete.
    onesky-converter [-i|--input]             Choose a specific folder to use as the onesky translation source. (optional - this will automatcally search your ~/Downloads folder if not specified.)
```

If you specify no options, you'll be prompted to select a folder or show the help (or exit).

Installation
=====

`npm install onesky-converter`
