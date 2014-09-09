#!/usr/bin/env node

var terminalmenu = require('terminal-menu');
var fs = require('fs');
var path = require('path');
var glob = require('glob');
var unzip = require('unzip');
var colors = require('colors');
var onesky = require('./onesky');
var utils = require('./utils');
var mkdirp = require('mkdirp');

var args = process.argv.slice(2);
var hasArg = function(regex){
  var match = args.join(' ').match(regex);
  return match;
}

var printUsage = function(){
  console.log('usage: onesky-converter [OPTIONS]');
  console.log('Options:');
  console.log('    onesky-converter [-h|--help]              Print this help.');
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

var menuInfo = { width: 40, x: 4, y: 4 };
var menu, paths;

var menuSelected = function(label,opts) {
  var homedir = process.env['HOME'] ? path.join(process.env['HOME'],'Downloads') : false;
  var file = fs.existsSync(label) ? label : paths && paths[label] && fs.existsSync(paths[label]) ? paths[label] : false;
  if(menu){
    menu.reset();
    menu.close();
  }
  menu = terminalmenu(menuInfo);
  if (label == 'HELP') {
    menu.reset();
    menu.close();
    printUsage();
    return;
  } else if (label == 'EXIT') {
    menu.reset();
    menu.close();
    return;
  } else if (label == 'DOWNLOAD FROM ONESKY'){
    var folder = opts.folder;
    if(!folder){
      folder = file || homedir;
      if(!folder) return console.error('Unable to find home directory and no folder was specified with -i');
    }
    folder = path.join(folder,'iOS');
    menu.reset();
    menu.close();
    mkdirp(folder);
    onesky.download(folder,function(err){
      if(err){
        throw err;
        return;
      }
      menuSelected(folder);
    });
  } else if (!label){
    menu.write('~~~ ONESKY CONVERTER ~~~\n');
    if(specifiedInput){
      menu.reset();
      menu.close();
      return menuSelected(specifiedInput[3]);
    } else {
      menu.write('-- SELECT AN INPUT FOLDER --\n');
      if(!homedir){
        menu.reset();
        menu.close();
        return console.error('Error: no home directory found. Cannot look for your Downloads folder.'.red);
      }
      var files = glob.sync(path.join(homedir,'**/iOS*'));
      if(!files.length){
        menu.reset();
        menu.close();
        return menuSelected('DOWNLOAD FROM ONESKY', { folder : homedir });
      } else {
        menu.add('DOWNLOAD FROM ONESKY');
        paths = {};
        files.forEach(function(file){
          var trimmed = path.basename(file);
          paths[trimmed] = file;
          menu.add(trimmed);
        });
      }
    }
    menu.add('HELP');
  } else {
    menu.reset();
    menu.close();
    if(!file){
      return menuSelected('DOWNLOAD FROM ONESKY', { folder : label });
    } else {
      var destinationFolder = nearestLocalizationsFolder();
      if(destinationFolder instanceof Error) return console.error(('Error: ' + err.message).red);
      if(/\.zip/i.test(file)){
        var out = path.join(path.dirname(file),path.basename(file,'.zip'));
        unzipFile(file,out,function(err){
          if(err) return console.error(('Error: ' + err.message).red);
          performConversion(out,destinationFolder,[file,out]);
        });
      } else {
        performConversion(file,destinationFolder,[file]);
      }
    }
    return;
  }
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

var rootTest = /(\.xcworkspace|\.xcodeproj|^\.oneskyconfig)$/i;
var nearestLocalizationsFolder = function(){
  var currentDir = utils.nearestFolderPassingTest(rootTest);
  var localizationFiles = glob.sync(path.join(currentDir,'**/Support/*.lproj'));
  if(!localizationFiles.length){
    return new Error('Could not find localizations near your current directory. Are you currently in an iOS project directory?');
  } else {
    return path.dirname(localizationFiles[0]);
  }
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
