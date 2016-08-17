'use strict';

const os = require('os'),
  path = require('path');

module.exports = {
  DEFAULT_DATA_FOLDER: path.join(os.homedir(), 'sitecues-metrics-data/'),
  RAW_DATA_SUBFOLDER: 'raw/',
  CLEAN_DATA_SUBFOLDER: 'clean/',
  BEGINNING_OF_TIME: '20160126'
};
