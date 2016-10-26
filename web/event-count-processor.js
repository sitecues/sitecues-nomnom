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
  keyCounterMap = {},
  keyHashMap = {},
  dbCache = {},
  CHECK_REPEATED_KEYS = true;

let isFetching = false;

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
    console.log('Data slice for ' + key + (forceEndIndex ? '   dates: ' + forceStartIndex + '-' + forceEndIndex : ''));

    db.get(key, (err, dateMap) => {
      logHeap();
      if (err) {
        return reject({ err });
      }

      if (!dateMap) {
        return reject({ err: 'Undefined value' });
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
        return reject({
          err: 'Weirdly, could not compute array'
        });
      }

      if (forceEndIndex) {
        allCountsArray.length = forceEndIndex;
      }

      // Remove useless entries at the start so that array only covers valuable date range where there were counts
      const startIndex = typeof forceStartIndex === 'number' ? forceStartIndex : haveDataStartIndex,
        countsArray = allCountsArray.slice(startIndex),
        numDates = countsArray.length;

      // Convert missing entries in valuable date range to 0
      for (let index = 0; index < numDates; index++) {
        if (!countsArray[index]) {
          countsArray[index] = 0;
        }
      }

      resolve({
        startIndex,
        countsArray
      });
    });
  });
}

function getDateCountsArray(category, type, key, forceStartIndex, forceEndIndex) {
  return fetchDatabase(category, type)
    .then((db) => getDataSlice(db, key, forceStartIndex, forceEndIndex))
    .catch((val) => {
      console.log(val);
      return val;
    } );
}

function logHeap() {
  console.log('Heap: ' + Math.round(process.memoryUsage().heapUsed/1000) + 'k');
}

function closeDb(category, type) {
  const db = dbCache[category + ':' + type];
  if (!db) {
    // No old db to destroy
    console.log('No existing db for ' + category + ':' + type);
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    db.close((err) => {
      if (err) {
        console.log(err);
        throw err;
      }
      dbCache[category + ':' + type] = null; // Clear cache
      resolve();
    });
  });
}

function destroyExistingDb(dbPath, category, type) {
  return new Promise((resolve) => {
    levelDown.destroy(dbPath, (err) => {
      if (err) {
        console.log(err);
        throw err;
      }
      resolve();
    });
  });
}

function createNewDb(dbPath, category, type) {
  return new Promise((resolve) => {
    levelUp(dbPath, (err, db) => {
      if (err) {
        throw err;
        console.log(err);
      }
      resolve(db);
    });
  });
}

function incrementCounter(category, type, key) {
  function getHashCode(s) {
    // From http://stackoverflow.com/questions/7616461/generate-a-hash-from-string-in-javascript-jquery
    // but modified to reduce the number of collisions (by not confining the values to 32 bit)
    // For 294 images on a site, the normal 32 bit hash algorithm has a 1/100,000 chance of collision, and we are better than that.
    // For more info on hash collisions, see http://preshing.com/20110504/hash-collision-probabilities/
    return [...s].reduce(function (a, b) {
      return ((a << 5) - a) + b.charCodeAt(0);
    }, 0);
  }

  ++ keyCounterMap[category][type];
  keyHashMap[category][type] += getHashCode(key);
  if (keyCounterMap[category][type] % 10000 === 0) {
    process.stdout.write('.');
  }
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
          incrementCounter(category, type, key);
          if (CHECK_REPEATED_KEYS) {
            db.get(key, (err) => {
              if (err && err.notFound) {
                // This is a good thing, as we don't want the same key in the database twice
                db.put(key, value, callback);
              }
              else {
                //throw
                console.log(new Error('Repeated key ' + key));
              }
            });
          }
          else {
            db.put(key, value, callback);
          }
          if (registerPermutationFn) {
            registerPermutationFn(key, value);
          }
        }
        else {
          callback();
        }
      }))
      .on('error', (err) => {
        console.log(err);
        throw new Error(err);
      })
      .on('end', () => {
        console.log('End');
        logHeap();
        resolve(db);
      })
  });
}

function restartDb(category, type) {
  const dbPath = getDbLocation(category, type),
    registerPermutationFn = permutationCallbackMap[category][type];
  if (registerPermutationFn) {
    registerPermutationFn(); // Reset
  }

  return closeDb(category, type)
    .then(() => destroyExistingDb(dbPath, category, type))
    .then(() => createNewDb(dbPath, category, type))
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
  if (!keyCounterMap[category]) {
    keyCounterMap[category] = {};
  }
  if (!keyHashMap[category]) {
    keyHashMap[category] = {};
  }
  keyCounterMap[category][type] = 0;
  keyHashMap[category][type] = 0;

  if (!existingDataFetchPromise[category]) {
    existingDataFetchPromise[category] = {};
  }
  if (doForce || !existingDataFetchPromise[category][type]) {
    existingDataFetchPromise[category][type] = restartDb(category, type);
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

function verifyData(category) {
  const allKeyCounters = keyCounterMap[category],
    allKeyHashes = keyHashMap[category],
    report = '\nKey counters: ' + JSON.stringify(allKeyCounters) +
      '\nKey hashes: ' + JSON.stringify(allKeyHashes);
  if (allKeyHashes.eventCounts !== allKeyHashes.sessionCounts || allKeyHashes.eventCounts !== allKeyHashes.userCounts) {
    //throw
    console.log(new Error(category + ' discrepancy in event/user/session keys: ' + report));
  }
  console.log(category + ' passes all checks for: ' + report);
}

function fetchAllTypes(category) {
  const fetchThemAll = ALLOWED_TYPES.map((type) => {
    return fetchDatabase(category, type, { doForce : true});
  });
  return Promise.all(fetchThemAll);
}

function init(category, permutationCallback) {
  mkdir(path.join(constants.DEFAULT_DATA_FOLDER, 'cache', category));

  permutationCallbackMap[category] = permutationCallback;

  function fetchAndVerify() {
    if (isFetching) {
      console.log('Already fetching');
      return Promise.resolve(false);
    }

    console.log('Fetch new data');
    isFetching = true;
    return fetchAllTypes(category)
      .then(() => {
        isFetching = false;
        verifyData(category)
        return true;
      });
  }

  fetchAndVerify()
    .then((isReady) => {
      if (isReady) {
        // When update.txt changes, we need to load new data
        fs.watch(path.join(constants.DEFAULT_DATA_FOLDER, 'hive', 'update.txt'), fetchAndVerify);
      }
    });
}

// Polyfill
if (!Object.values) {
  const reduce = Function.bind.call(Function.call, Array.prototype.reduce);
  const isEnumerable = Function.bind.call(Function.call, Object.prototype.propertyIsEnumerable);
  const concat = Function.bind.call(Function.call, Array.prototype.concat);
  const keys = Reflect.ownKeys;
  Object.values = function values(O) {
    return reduce(keys(O), (v, k) => concat(v, typeof k === 'string' && isEnumerable(O, k) ? [O[k]] : []), []);
  };
}

module.exports = {
  getDateCountsArray,
  fetchDatabase,
  init
};

