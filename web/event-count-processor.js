'use strict';

const
  fs = require('fs'),
  es = require('event-stream'),
  path = require('path'),
  constants = require('../lib/constants'),
  existingDataFetchPromise = {},
  levelUp = require('levelup'),
  levelDown = require('leveldown'), // DB backing
  ALLOWED_TYPES = [ 'userCounts', 'sessionCounts', 'eventCounts' ],
  permutationCallbackMap = {},
  dbCache = {};

function getDbLocation(category, type) {
  return path.join(constants.DEFAULT_DATA_FOLDER, 'cache', category, type);
}

function getDataSlice(db, key, forceStartIndex, forceEndIndex) {
  if (!db) {
    return {
      err: 'No such type'
    };
  }

  return new Promise((resolve, reject) => {
    console.log(key);

    db.get(key, (err, dateMap) => {
      logHeap();
      if (err) {
        reject({ err });
        return;
      }

      if (!dateMap) {
        reject({ err: 'Undefined value' });
        return;
      }

      let haveDataStartIndex = Infinity;

      // Fill counts array
      const allCountsArray = [],
        parsedDateMap = JSON.parse(dateMap);
      for (let date of Object.keys(parsedDateMap)) {
        const dateIndex = parseInt(date);
        if (dateIndex < haveDataStartIndex) {
          haveDataStartIndex = dateIndex;
        }
        allCountsArray[dateIndex] = parsedDateMap[date];
      }

      if (!allCountsArray.length) {
        reject({
          err: 'Weirdly, could not compute array'
        });
      }

      if (forceEndIndex) {
        allCountsArray.length = forceEndIndex;
      }

      // Remove useless entries at the start so that array only covers valuable date range where there were counts
      const dateSliceStartIndex = typeof forceStartIndex === 'number' ? forceStartIndex : haveDataStartIndex,
        countsArray = allCountsArray.slice(dateSliceStartIndex),
        numDates = countsArray.length;

      // Convert missing entries in valuable date range to 0
      for (let index = 0; index < numDates; index++) {
        if (!countsArray[index]) {
          countsArray[index] = 0;
        }
      }

      resolve({
        dateSliceStartIndex,
        countsArray
      });
    });
  });
}

function getDateCountsArray(category, type, key, forceStartIndex, forceEndIndex) {
  return fetchDatabase(category, type)
    .then((db) => getDataSlice(db, key, forceStartIndex, forceEndIndex));
}

function logHeap() {
  console.log('Heap: ' + Math.round(process.memoryUsage().heapUsed/1000) + 'k');
}

function closeDb(category, type) {
  const db = dbCache[category + ':' + type];
  if (!db) {
    // No old db to destroy
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    db.close((err) => {
      if (err) {
        throw err;
      }
      resolve();
    });
  });
}

function destroyExistingDb(dbPath) {
  return new Promise((resolve) => {
    levelDown.destroy(dbPath, (err) => {
      if (err) {
        throw err;
      }
      resolve();
    });
  });
}

function createNewDb(dbPath) {
  return new Promise((resolve) => {
    levelUp(dbPath, (err, db) => {
      if (err) {
        throw err;
      }
      resolve(db);
    });
  });
}

function fetchData(db, category, type, sourceDataLocation) {
  const registerPermutationFn = permutationCallbackMap[category][type];

  // Stream in new data
  return new Promise((resolve) => {
    fs.createReadStream(sourceDataLocation)
      .pipe(es.split())
      .pipe(es.map((unparsedPermutation, callback) => {
        if (unparsedPermutation) {
          const endKeyIndex = unparsedPermutation.indexOf('":'),
            key = unparsedPermutation.substring(2, endKeyIndex),
            value = unparsedPermutation.substring(endKeyIndex + 2, unparsedPermutation.length - 1);
          db.put(key, value, callback);
          if (registerPermutationFn) {
            registerPermutationFn(key, value);
          }
        }
        else {
          callback();
        }
      }))
      .on('error', (err) => {
        throw new Error(err);
      })
      .on('end', () => {
        console.log('End');
        logHeap();
        resolve(db);
      })
  });
}

function refreshDb(category, type) {
  const dbPath = getDbLocation(category, type),
    registerPermutationFn = permutationCallbackMap[category][type];
  if (registerPermutationFn) {
    registerPermutationFn(); // Reset
  }
  return closeDb(category, type)
    .then(() => destroyExistingDb(dbPath))
    .then(() => createNewDb(dbPath))
    .then((db) => {
      console.log('Fetching ' + category + ' ' + type);
      return fetchData(db, category, type, getSourceDataLocation(category, type))
    })
    .then((db) => {
      dbCache[category + ':' + type] = db; // Cache
      return db;
    });
}

function fetchDatabase(category, type, options) {
  const doForce = options && options.doForce;
  if (!type) {
    type = ALLOWED_TYPES[0];
  }
  if (!existingDataFetchPromise[category]) {
    existingDataFetchPromise[category] = {};
  }
  if (doForce || !existingDataFetchPromise[category][type]) {
    existingDataFetchPromise[category][type] = refreshDb(category, type);
  }
  else {
    // Use existing promise
    //console.log(existingDataFetchPromise[type]);
  }

  return existingDataFetchPromise[category][type];   // New or existing promise to parse new data
}

function mkdir(dir) {
  try {
    fs.mkdirSync(dir); // Ensure data directory created
  }
  catch(ex) {
    // Directories already available
  }
}

function getSourceDataLocation(category, type) {
  return path.join(constants.DEFAULT_DATA_FOLDER, 'hive', category, type + '.ldjson');
}

function init(category, permutationCallback) {
  mkdir(path.join(constants.DEFAULT_DATA_FOLDER, 'cache', category));

  permutationCallbackMap[category] = permutationCallback;

  ALLOWED_TYPES.forEach((type) => {
    const watchTimeouts = {};
    fetchDatabase(category, type)
      .then(() => {
        fs.watch(getSourceDataLocation(category, type), () => {
          clearTimeout(watchTimeouts[type]);
          watchTimeouts[type] = setTimeout(function () {
            fetchDatabase(type, {doForce: true});
          }, 1000); // TODO fix this hacky way of waiting for the data write? Probably works pretty well since we're a streaming parser
        });
      });
  });
}

module.exports = {
  getDateCountsArray,
  fetchDatabase,
  init
};

