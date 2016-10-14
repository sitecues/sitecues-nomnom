'use strict';

const
  CATEGORY = 'location-and-ua',
  eventCountProcessor = require('./event-count-processor');
let
  subkeyCache;

function get(params) {
  const key = params.loc + '||' + params.ua + '||' + params.event;
  return eventCountProcessor.getDateCountsArray(CATEGORY, params.type, key);
}

function list(index) {
  // The source data is divided like this: key0||key1||key2
  // We can get a list of all the keys used for one by passing in an index (0-2)
  return eventCountProcessor.fetchDatabase(CATEGORY)
    .then(() => Array.from(subkeyCache[index]));
}

function registerKey(key) {
  if (!key) {
    // Reset
    subkeyCache = [ new Set(), new Set(), new Set() ];
    return;
  }
  key.split('||').forEach((subkey, index) => {
    subkeyCache[index].add(subkey)
  });
}

eventCountProcessor.init(CATEGORY, { userCounts: registerKey });

module.exports = {
  get,
  list
};

