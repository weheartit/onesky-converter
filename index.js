#!/usr/bin/env node

var terminalmenu = require('terminal-menu');
var fs = require('fs');
var path = require('path');
var unzip = require('unzip');
var glob = require('glob');
var colors = require('colors');
var onesky = require('./onesky');
var utils = require('./utils');
var mkdirp = require('mkdirp');
var log = require('./log');

var hasArg = utils.hasArg;

var printUsage = function(){
  console.log('usage: onesky-converter [OPTIONS]');
  console.log('Options:');
  console.log('    onesky-converter [-h|--help]              Print this help.');
  console.log('    onesky-converter [-u|--upload]            Upload the local en.lproj translations to onesky.');
  console.log('    onesky-converter [-d|--download]          Download latest translations from OneSky and replace the current translations with them.');
  console.log('    onesky-converter [-n|--no-delete]         Don\'t delete the localizations file when complete.');
  console.log('    onesky-converter [-i|--input]             Choose a specific folder to use as the onesky translation source. (optional - this will automatcally search your ~/Downloads folder if not specified.)');
}

if (hasArg(/(^|[^\w])(-h|--help)([^\w]|$)/)) {
  // print usage
  printUsage();
  return;
}

var specifiedInput = hasArg(/(^|[^\w])(-i|--input)[\s]+([^\s]+)/);
var noDelete = hasArg(/(^|[^\w])(-n|--no-delete)([^\w]|$)/);
var forceUpload = hasArg(/(^|[^\w])(-u|--upload)([^\w]|$)/);
var forceDownload = hasArg(/(^|[^\w])(-d|--download)([^\w]|$)/);

var menuInfo = { width: 40, x: 4, y: 4 };
var menu, paths;

var menuSelected = function(label,opts) {
  if(menu){
    menu.reset();
    menu.close();
  }
  var homedir = process.env['HOME'] ? path.join(process.env['HOME'],'Downloads') : false;
  var file = fs.existsSync(label) ? label : paths && paths[label] && fs.existsSync(paths[label]) ? paths[label] : false;
  if (label == 'HELP') {
    printUsage();
    return;
  } else if (label == 'EXIT') {
    return;
  } else if (label == 'UPLOAD ENGLISH TRANSLATION' || forceUpload){
    var folder = utils.nearestLocalizationsFolder();
    if(!folder){
      log.error('Unable to find localization folder in current tree. Please run from inside an iOS app folder.'.red);
      return;
    }
    var englishFile = path.join(folder,'en.lproj','Localizable.strings');
    if(!fs.existsSync(englishFile)){
      log.error('Found your app\'s support folder, but was unable to find the english localization. Something is probably very wrong.'.red);
      return;
    }
    onesky.upload(englishFile,function(err,info){
      if(err){
        throw err;
      } else if (forceDownload){
        menuSelected('DOWNLOAD FROM ONESKY');
      } else {
        console.log('finished.'.green);
        console.log('response from onesky : '.grey,JSON.stringify(info,null,2).grey);
      }
    });
  } else if (label == 'DOWNLOAD FROM ONESKY'){
    var folder = opts.folder;
    if(!folder){
      folder = file || homedir;
      if(!folder) return console.error('Unable to find home directory and no folder was specified with -i');
    }
    folder = path.join(folder,'iOS');
    mkdirp(folder);
    onesky.download(folder,function(err){
      if(err){
        throw err;
      } else {
        menuSelected(folder);
      }
    });
  } else if (!label){
    if(specifiedInput){
      return menuSelected(specifiedInput[3]);
    } else {
      if(!homedir){
        return log.error('Error: no home directory found. Cannot look for your Downloads folder.'.red);
      }
      var files = glob.sync(path.join(homedir,'**/iOS*'));
      startMenu();
      menu.add('UPLOAD ENGLISH TRANSLATION');
      menu.add('DOWNLOAD FROM ONESKY');
      if(files.length){
        menu.write('-- OR SELECT AN INPUT FOLDER --\n');
        paths = {};
        files.forEach(function(file){
          var trimmed = path.basename(file);
          paths[trimmed] = file;
          menu.add(trimmed);
        });
        menu.write('----------------------\n');
      }
      endMenu();
    }
  } else {
    if(!file){
      return menuSelected('DOWNLOAD FROM ONESKY', { folder : label });
    } else {
      var destinationFolder = utils.nearestLocalizationsFolder();
      if(destinationFolder instanceof Error) return console.error(('Error: ' + err.message).red);
      if(/\.zip/i.test(file)){
        var out = path.join(path.dirname(file),path.basename(file,'.zip'));
        unzipFile(file,out,function(err){
          if(err) return log.error(('Error: ' + err.message).red);
          performConversion(out,destinationFolder,[file,out]);
        });
      } else {
        performConversion(file,destinationFolder,[file]);
      }
    }
    return;
  }
}

var startMenu = function(){
  menu = terminalmenu(menuInfo);
  menu.write('~~~ ONESKY CONVERTER ~~~\n');
}
var endMenu = function(){
  menu.add('HELP');
  menu.add('EXIT');
  menu.on('select',menuSelected);
  menu.createStream().pipe(process.stdout);
}

var deleteFolderRecursive = function(path) {
  var files = [];
  if(fs.existsSync(path)) {
    if(fs.statSync(path).isDirectory()){
      files = fs.readdirSync(path);
      files.forEach(function(file,index){
        var curPath = path + "/" + file;
        if(fs.lstatSync(curPath).isDirectory()) {
          deleteFolderRecursive(curPath);
        } else {
          fs.unlinkSync(curPath);
        }
      });
      fs.rmdirSync(path);
    } else {
      fs.unlinkSync(path);
    }
  }
};

var performConversion = function(source,dest,deleteFiles){
  console.log(('Running onesky conversion from ' + source + ' to ' + dest + ' ...').green);
  sanitizeOneSkyLocalizationFolder(source);
  console.log('replacing project translation files...'.green);
  var folders = glob.sync(path.join(source,'**/*.lproj'));
  folders.forEach(function(folder){
    var file = path.join(folder,'Localizable.strings');
    mkdirp(path.join(dest,path.basename(folder)));
    var destFile = path.join(dest,path.basename(folder),'Localizable.strings');
    console.log((file + ' -> ' + destFile).grey);
    fs.writeFileSync(destFile, fs.readFileSync(file));
  });
  if(!noDelete){
    console.log('deleting downloaded files...'.yellow);
    deleteFiles.forEach(function(file){
      console.log((' -> deleting' + file).grey);
      deleteFolderRecursive(file);
    });
  }
  console.log('finished.'.green);
}

var replaceInFile = function(file,find,replace){
  var content = fs.readFileSync(file,'utf8');
  var m;
  while(m = find.exec(content)){
    console.log((' -> using english translation for ' + m[1]).grey);
    content = content.replace(find,replace);
  }
  fs.writeFileSync(file,content,'utf8');
}

var lprojTest = /\.lproj$/;
var skipTest = /^\.\.?/;
var sanitizeOneSkyLocalizationFolder = function(folder){
  // rename folders to .lproj
  console.log('renaming folders to .lproj...'.green);
  fs.readdirSync(folder).forEach(function(lproj){
    var lproj = path.join(folder,lproj);
    if(lprojTest.test(lproj) || skipTest.test(lproj)) return;
    var out = lproj + '.lproj';
    if(fs.existsSync(out)) deleteFolderRecursive(out);
    fs.renameSync(lproj, out);
  });
  console.log('copying brazilian portugese translation to portugese'.green);
  var brazilianTranslation = path.join(folder,'pt-BR.lproj/Localizable.strings');
  var portugeseTranslation = path.join(folder,'pt.lproj/Localizable.strings');
  if (fs.existsSync(brazilianTranslation) && fs.existsSync(portugeseTranslation)) {
    fs.writeFileSync(portugeseTranslation, fs.readFileSync(brazilianTranslation));
  } else {
    console.warn('Failed to copy brazilian portugese to portugese, one or more of the following files could not be found:'.red);
    console.warn(brazilianTranslation.yellow);
    console.warn(portugeseTranslation.yellow);
  }
  console.log('Replacing failed translation comments with english versions'.green);
  var localizationFiles = glob.sync(path.join(folder,'**/Localizable.strings'));
  localizationFiles.forEach(function(file){
    console.log(('Sanitizing ' + file).cyan);
    var regex = /\/\* No translations available yet: ([^;]+;) \*\//g;
    replaceInFile(file,regex,'$1');
  });
};

var unzipFile = function(file,out,done){
  fs.createReadStream(file)
    .pipe(unzip.Extract({ path: out }))
    .on('error', function(err) {
      done(err);
    })
    .on('close',function(){
      done();
    });
};

if(require.main === module){
  menuSelected();
} else {
  module.exports = menuSelected;
}
