global.__loggerInitialized = false;

var clui = require('clui');
var utils = require('./utils');

var Logger = function(){
  if(global.__loggerInitialized) return global.__logger;
  global.__loggerInitialized = true;
  var logger = global.__logger = require('npmlog');
  if(utils.hasArg(/(^|[^\w])(-v|--verbose)([^\w]|$)/)){
    logger.level = 'verbose';
  }
  var self = this;
  logger.spinVerbose = function(){
    if(logger.level == 'verbose'){
      return logger.verbose.apply(logger,arguments);
    } else if(self.currentSpinner){
      self.currentSpinner.message(arguments[0]);
    } else {
      self.currentSpinner = new clui.Spinner(arguments[0]);
      self.currentSpinner.start();
    }
  };
  logger.stopSpinning = function(){
    if(self.currentSpinner){
      self.currentSpinner.stop();
      self.currentSpinner = false;
    }
  };
  return logger;
};

module.exports = Logger();
