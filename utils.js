var fs = require('fs');
var path = require('path');
var rl = require('readline');
var glob = require('glob');

var utils = module.exports = {
  nearestFolderPassingTest : function(test,currentDir){
    if(currentDir == '/'){
      return false;
    }
    if(!currentDir) currentDir = process.cwd();
    var files = fs.readdirSync(currentDir);
    var atRoot = files.some(function(file){
      return test.test(file);
    });
    if(!atRoot){
      return utils.nearestFolderPassingTest(test,path.join(currentDir,'..'));
    } else {
      return currentDir;
    }
  },
  hasArg : function(regex){
    var args = process.argv.slice(2);
    var match = args.join(' ').match(regex);
    return match;
  },
  nearestiOSProjectFolder : function(){
    return utils.nearestFolderPassingTest(/(\.xcworkspace|\.xcodeproj|^\.oneskyconfig)$/i);
  },
  nearestLocalizationsFolder : function(){
    var currentDir = utils.nearestiOSProjectFolder();
    var localizationFiles = glob.sync(path.join(currentDir,'**/Support/*.lproj'));
    if(!localizationFiles.length){
      return new Error('Could not find localizations near your current directory. Are you currently in an iOS project directory?');
    } else {
      return path.dirname(localizationFiles[0]);
    }
  },
  ask : function(question, valid, callback) {
    var r = rl.createInterface({
      input: process.stdin,
      output: process.stdout});
    r.question(question + '\n', function(answer) {
      r.close();
      if(!valid.test(answer)){
        utils.ask(question,valid,callback);
      } else {
        callback(answer);
      }
    });
  }
}
