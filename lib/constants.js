'use strict';

const os = require('os'),
  path = require('path');

module.exports = {
  DEFAULT_DATA_FOLDER: path.join(os.homedir(), 'sitecues-metrics-data/'),
  RAW_DATA_SUBFOLDER: 'raw/',
  CLEAN_DATA_SUBFOLDER: 'clean/',
  COMPILED_DATA_SUBFOLDER: 'compiled/',
  HIVE_RESULTS_DATA_SUBFOLDER: 'hive/',
  BEGINNING_OF_TIME: '20160201'
};
