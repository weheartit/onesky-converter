var fs = require('fs');
var path = require('path');

var utils = module.exports = {
  nearestFolderPassingTest : function(test,currentDir){
    if(!currentDir) currentDir = process.cwd();
    var files = fs.readdirSync(currentDir);
    var atRoot = files.some(function(file){
      return test.test(file);
    });
    if(!atRoot){
      return utils.nearestFolderPassingTest(path.join(currentDir,'..'));
    } else {
      return currentDir;
    }
  }
}
