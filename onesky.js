var request = require('request');
var crypto = require('crypto');
var path = require('path');
var url = require('url');
var async = require('async');
var fs = require('fs');
var mkdirp = require('mkdirp');
var utils = require('./utils');

var OneSkySecretKey = process.env["ONE_SKY_API_SECRET"];
var OneSkyPublicKey = '';
var OneSkyProjectId = 0;

var loadOneSkyConfig = function(){
  var folder = utils.nearestFolderPassingTest(/\.oneskyconfig/i);
  if(!folder){ throw new Error('Failed to find .oneskyconfig file in the current tree.'); return }
  try {
    var oneSkyConfig = JSON.parse(fs.readFileSync(path.join(folder,'.oneskyconfig')));
  } catch(e){
    throw new Error('Failed to parse oneskyconfig file: \n' + e.message);
    return;
  }
  OneSkySecretKey = OneSkySecretKey || oneSkyConfig.secret_key;
  OneSkyPublicKey = oneSkyConfig.public_key;
  OneSkyProjectId = oneSkyConfig.project_id;
  if(!OneSkySecretKey){ throw new Error('You must specify a secret_key either via the ONE_SKY_API_SECRET environment variable or in your .onsekyconfig file.'); return }
  if(!OneSkyPublicKey){ throw new Error('You must specify a public_key in your .onsekyconfig file.'); return }
  if(!OneSkyProjectId){ throw new Error('You must specify a project_id in your .onsekyconfig file.'); return }
}

var oneSkyParams = function(obj){
  if(!OneSkyProjectId){
    loadOneSkyConfig();
  }
  var stamp = Math.floor(new Date().getTime()/1000);
  var params = {
    api_key : OneSkyPublicKey,
    timestamp : stamp,
    dev_hash : crypto.createHash('md5').update(stamp + OneSkySecretKey).digest('hex')
  };
  Object.keys(obj).forEach(function(key){
    params[key] = obj[key];
  });
  return params;
}

var stringify = function(val){
  var n;
  try {
    n = JSON.stringify(val);
  } catch(e){
    n = val;
  }
  return n;
}
var parse = function(val){
  var n;
  try {
    n = JSON.parse(val);
  } catch(e){
    n = val;
  }
  return n;
}

var performOneSkyOperation = function(operation,params,callback){
  var params = oneSkyParams(params);
  if(!/^\//.test(operation)){
    operation = path.join('projects/',OneSkyProjectId.toString(),operation);
  }
  operation = operation.replace(/^\//,'');
  var uri = url.resolve("https://platform.api.onesky.io/1/",operation);
  // console.log(uri,params);
  request(uri,{qs : params},function(err,res,rawBody){
    var body = parse(rawBody);
    rawBody = stringify(rawBody);
    if(err) return callback(err);
    if(typeof body == 'object'){
      if(!body.meta) return callback(new Error('Malformed response from OneSky : \n' + rawBody));
      if(body.meta.status < 200 || body.meta.status > 299) return callback(new Error('Non 200 response from OneSky : \n' + rawBody.toString()));
    }
    return callback(err,res,body);
  });
}

var listFiles = function(callback,page,files){
  page = page || 1;
  files = files || [];
  performOneSkyOperation('list',{
    page : page,
    per_page : 100
  },function(err,res,body){
    if(err) return callback(err);
    var files = files.concat(res.body.data);
    if(body.meta.record_count > files.length){
      return listFiles(callback,page++);
    } else {
      callback(null,files.filter(function(file){
        // ignore non-imported files (manually input strings)
        return !!file.last_import;
      }).map(function(file){
        return file.name;
      }));
    }
  });
};

var parseLocale = function(code){
  // OneSky sucks ass, and doesn't actually return our custom language codes, so we'll do that ourselves (again)
  switch(code){
    case 'zh-CN':
      code = 'zh-Hans';
      break;
    case 'zh-TW':
      code = 'zh-Hant';
      break;
  }
  return code;
}

var listLanguages = function(callback){
  performOneSkyOperation('languages',{},function(err,res,body){
    if(err) return callback(err);
    callback(null,body.data.map(function(lang){
      return lang.custom_locale || lang.code;
    }));
  });
};

var downloadFile = function(folder,filename,locale,callback){
  performOneSkyOperation('translations',{
    locale : locale,
    source_file_name : filename
  },function(err,res,body){
    if(err) return callback(err);
    if(res.statusCode != 200){
      console.log('waiting for ' + locale + ' file ('+res.statusCode+')...');
      setTimeout(function(){
        downloadFile(folder,filename,locale,callback);
      },1000);
    } else {
      var filePath = path.join(folder,filename);
      fs.writeFile(filePath,body,function(err){
        callback(err,filePath);
      });
    }
  });
};

var downloadLanguages = function(folder,filename,locales,callback){
  if(!fs.existsSync(folder)){
    throw new Error('Cannot download to invalid folder ' + folder);
    return;
  }
  async.forEach(locales,function(locale,done){
    var subfolder = path.join(folder,parseLocale(locale) + '.lproj');
    mkdirp(subfolder,function(err){
      if(err) done(err);
      downloadFile(subfolder,filename,locale,done);
    });
  },callback);
};

var downloadAllTranslations = function(folder,callback){
  console.log(folder);
  async.waterfall([
    listLanguages,
    downloadLanguages.bind(null,folder,'Localizable.strings')
  ],callback);
};

module.exports = {
  download : downloadAllTranslations
};
