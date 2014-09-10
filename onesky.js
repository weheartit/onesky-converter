var request = require('request');
var crypto = require('crypto');
var path = require('path');
var url = require('url');
var async = require('async');
var fs = require('fs');
var mkdirp = require('mkdirp');
var utils = require('./utils');
var log = require('./log');
var prompt = require('prompt');

var OneSkySecretKey = process.env["ONE_SKY_API_SECRET"];
var OneSkyPublicKey = '';
var OneSkyProjectId = 0;

var loadOneSkyConfig = function(done){
  if(OneSkyProjectId) return done();
  var folder = utils.nearestFolderPassingTest(/^\.oneskyconfig$/i);
  var iOSFolder = utils.nearestiOSProjectFolder();
  if(!iOSFolder){
    throw new Error('Failed to find an iOS app in the current tree. Please run from inside an iOS app directory.');
  } else if(!folder){
    utils.ask('No .oneskyconfig file found. Would you like to create one at the project root?',/^(y|n)$/i,function(response){
      if(/y/i.test(response)){
        var oneSkyInfo = {};
        async.series([
          function(done){
            utils.ask('What is your public_key?',/.+/,function(answer){
              oneSkyInfo.public_key = answer;
              done();
            })
          },
          function(done){
            utils.ask('What is your project_id?',/\d+/,function(answer){
              oneSkyInfo.project_id = answer;
              done();
            })
          },
          function(done){
            utils.ask('What is your private_key? (optional)',/.*/,function(answer){
              if(answer) oneSkyInfo.private_key = answer;
              done();
            })
          }
        ],function(){
          fs.writeFileSync(path.join(iOSFolder,'.oneskyconfig'),JSON.stringify(oneSkyInfo,null,2),'utf8');
          if(!oneSkyInfo.private_key){
            log.info('Please set an environment variable with your secret key called ONE_SKY_API_SECRET to continue.');
            process.exit(0);
          } else {
            loadOneSkyConfig();
          }
        });
      } else {
        process.exit(0);
        return;
      }
    });
  } else {
    try {
      var oneSkyConfig = JSON.parse(fs.readFileSync(path.join(folder,'.oneskyconfig')));
    } catch(e){
      throw new Error('Failed to parse oneskyconfig file: \n' + e.message);
      return;
    }
    OneSkySecretKey = OneSkySecretKey || oneSkyConfig.secret_key;
    OneSkyPublicKey = oneSkyConfig.public_key;
    OneSkyProjectId = oneSkyConfig.project_id;
    if(!OneSkySecretKey) return log.error('You must specify a secret_key either via the ONE_SKY_API_SECRET environment variable or in your .oneskyconfig file.');
    if(!OneSkyPublicKey) return log.error('You must specify a public_key in your .onsekyconfig file.');
    if(!OneSkyProjectId) return log.error('You must specify a project_id in your .onsekyconfig file.');
    done();
  }
}

var oneSkyParams = function(obj){
  var stamp = Math.floor(new Date().getTime()/1000);
  var params = {
    api_key : OneSkyPublicKey,
    timestamp : stamp,
    dev_hash : crypto.createHash('md5').update(stamp + OneSkySecretKey).digest('hex')
  };
  if(obj){
    Object.keys(obj).forEach(function(key){
      params[key] = obj[key];
    });
  }
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

var performOneSkyOperation = function(method,operation,params,callback){
  if(typeof callback == 'undefined'){
    // shift args right
    callback = params;
    params = operation;
    operation = method;
    method = 'get';
  }
  var requestParams = oneSkyParams(params);
  if(!/^\//.test(operation)){
    operation = path.join('projects/',OneSkyProjectId.toString(),operation);
  }
  operation = operation.replace(/^\//,'');
  var uri = url.resolve("https://platform.api.onesky.io/1/",operation);
  var opts = {
    method : method
  };
  if (method == 'post' && params) {
    opts.json = requestParams;
  } else if(params) {
    opts.qs = requestParams;
  }
  log.verbose('sending request to OneSky : ',uri,opts);
  var ret = {};
  ret.request = request(uri,opts,function(err,res,rawBody){
    var body = parse(rawBody);
    rawBody = stringify(rawBody);
    if(err) return callback(err);
    if(typeof body == 'object'){
      if(!body.meta) return callback(new Error('Malformed response from OneSky : \n' + rawBody));
      if(body.meta.status < 200 || body.meta.status > 299) return callback(new Error('Non 200 response from OneSky : \n' + rawBody.toString()));
    }
    return callback(err,res,body);
  });
  ret.params = requestParams;
  return ret;
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

var callbackAfterTaskComplete = function(taskId,_callback){
  var callback = function(){
    log.stopSpinning();
    _callback.apply(null,arguments);
  }
  log.spinVerbose('Waiting for processing to complete...');
  performOneSkyOperation('import-tasks/' + taskId,{},function(err,res,body){
    if(err) return callback(err);
    if(body.data.status == 'in-progress'){
      setTimeout(function(){
        callbackAfterTaskComplete(taskId,callback);
      },1000);
    } else if(body.data.status == 'completed') {
      callback(null,body.data);
    } else {
      callback(new Error('Upload to onesky failed. Info : ' + JSON.stringify(body)));
    }
  });
}

var uploadFile = function(filePath,callback){
  log.spinVerbose('Uploading file to OneSky',filePath);
  var r = performOneSkyOperation('post','files',false,function(err,res,body){
    log.stopSpinning();
    if(err) return callback(err);
    if(res.statusCode != 201) return callback(new Error('Unexpected response from onesky when uploading a file : '+JSON.stringify(body)));
    callbackAfterTaskComplete(body.data.import.id,callback);
  });
  var form = r.request.form();
  Object.keys(r.params).forEach(function(param){
    form.append(param,r.params[param]);
  });
  form.append('file_format','IOS_STRINGS');
  form.append('is_keeping_all_strings','false');
  form.append('file',fs.createReadStream(filePath));
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
  log.spinVerbose('listing languages');
  performOneSkyOperation('languages',{},function(err,res,body){
    log.stopSpinning();
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
  log.spinVerbose('Downloading translations files');
  async.forEach(locales,function(locale,done){
    var subfolder = path.join(folder,parseLocale(locale) + '.lproj');
    mkdirp(subfolder,function(err){
      if(err) done(err);
      downloadFile(subfolder,filename,locale,done);
    });
  },function(){
    log.stopSpinning();
    callback.apply(null,arguments);
  });
};

var downloadAllTranslations = function(folder,callback){
  async.waterfall([
    listLanguages,
    downloadLanguages.bind(null,folder,'Localizable.strings')
  ],callback);
};

var loadThen = function(method){
  return function(){
    var args = arguments;
    loadOneSkyConfig(function(){
      method.apply(null,args);
    });
  };
}

module.exports = {
  download : loadThen(downloadAllTranslations),
  upload : loadThen(uploadFile)
};
