onesky-converter
================

WHI OneSky Converter Utility

This script is intended to be used with the We Heart It iOS repo.

It can do one of a few things:

1. Upload the en.lproj strings file from your local iOS repo to OneSky automatically
2. Download all the current strings files from OneSky and replace your current strings with them, after sanitization.
3. Find a Downloaded strings file package from OneSky (folder or zip) and replace your current strings with the downloaded strings (also after sanitization).

Sanitization refers to this process:

1. Renames folders in it to have .lproj extensions
2. copies pr-BR translations to pr (if they're there)
3. Changes 'zh-CN' to 'zh-Hans' and 'zh-TW' to 'zh-Hant' (when requested via the API, OneSky neither respects nor reports custom Locales).

Once either download or unpack processes are complete, it removes the iOS zip or folder. (you can avoid this by using `-n` or `--no-delete`)

Usage
=====

`onesky-converter(1)`

If you specify no options, you'll be given a sweet DOS-style prompt to choose what you would like to do:

!(DOS TERMINAL)[http://cl.ly/image/1v3T1W1z451z/Image%202014-09-09%20at%207.08.04%20PM.png]

```
usage: onesky-converter [OPTIONS]
Options:
    onesky-converter [-h|--help]              Print this help.
    onesky-converter [-u|--upload]            Upload the local en.lproj translations to onesky.
    onesky-converter [-d|--download]          Download latest translations from OneSky and replace the current translations with them.
    onesky-converter [-n|--no-delete]         Don't delete the localizations file when complete.
    onesky-converter [-i|--input]             Choose a specific folder to use as the onesky translation source. (optional - this will automatcally search your ~/Downloads folder if not specified.)
```

Installation
=====

`npm install -g onesky-converter`
