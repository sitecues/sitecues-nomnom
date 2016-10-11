'use strict';

const
  ALLOWED_TYPES = [ 'eventCounts', 'sessionCounts', 'userCounts' ],
  fs = require('fs'),
  es = require('event-stream'),
  path = require('path'),
  constants = require('../lib/constants'),
  existingDataFetchPromise = {},
  levelUp = require('levelup'),
  levelDown = require('leveldown'), // DB backing
  dbCache = {};

function getDbLocation(type) {
  return path.join(constants.DEFAULT_DATA_FOLDER, 'cache', type);
}

function getSourceDataLocation(type) {
  return path.join(constants.DEFAULT_DATA_FOLDER, 'hive', 'location-and-ua', type + '.ldjson');
}

function logHeap() {
  console.log('Heap: ' + Math.round(process.memoryUsage().heapUsed/1000) + 'k');
}

function getCountsByDate(params) {
  const getDataSlice = (db) => {
    if (!db) {
      return {
        err: 'No such type'
      };
    }

    return new Promise((resolve, reject) => {
      const key = params.loc + '||' + params.ua + '||' + params.event;

      console.log(key);

      db.get(key, (err, dateMap) => {
        logHeap();
        if (err) {
          reject({ err });
          return;
        }

        if (!dateMap) {
          reject({ err: 'Undefined value for type=' + params.type + ', key=' + key });
          return;
        }

        let startIndex = Infinity;

        // Fill counts array
        const allCountsArray = [],
          parsedDateMap = JSON.parse(dateMap);
        for (let date of Object.keys(parsedDateMap)) {
          const dateIndex = parseInt(date);
          if (dateIndex < startIndex) {
            startIndex = dateIndex;
          }
          allCountsArray[dateIndex] = parsedDateMap[date];
        }

        if (!allCountsArray.length) {
          reject({
            err: 'Weirdly, could not compute array'
          });
        }

        // Remove useless entries at the start so that array only covers valuable date range where there were counts
        const countsArray = allCountsArray.slice(startIndex),
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
  };

  return getData(params.type)
    .then(getDataSlice);
}

function closeDb(type) {
  const db = dbCache[type];
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

function fetchData(db, sourceDataLocation) {
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

function refreshDb(type) {
  const dbPath = getDbLocation(type);
  return closeDb(type)
    .then(() => destroyExistingDb(dbPath))
    .then(() => createNewDb(dbPath))
    .then((db) => {
      console.log('Fetching ' + type);
      return fetchData(db, getSourceDataLocation(type))
    })
    .then((db) => {
      dbCache[type] = db; // Cache
      return db;
    });
}

function getData(type, options) {
  const doForce = options && options.doForce;
  if (doForce || !existingDataFetchPromise[type]) {
    existingDataFetchPromise[type] = refreshDb(type);
  }
  else {
    // Use existing promise
    //console.log(existingDataFetchPromise[type]);
  }

  return existingDataFetchPromise[type];   // New or existing promise to parse new data
}

logHeap();

function mkdir(dir) {
  try {
    fs.mkdirSync(dir); // Ensure data directory created
  }
  catch(ex) {
    // Directories already available
  }
}

mkdir(path.join(constants.DEFAULT_DATA_FOLDER, 'cache'));

ALLOWED_TYPES.forEach((type) => {
  const watchTimeouts = {};
  getData(type)
    .then(() => {
      fs.watch(getSourceDataLocation(type), () => {
        clearTimeout(watchTimeouts[type]);
        watchTimeouts[type] = setTimeout(function () {
          getData(type, {doForce: true});
        }, 1000); // TODO fix this hacky way of waiting for the data write? Probably works pretty well since we're a streaming parser
      });
    });
});

module.exports = getCountsByDate;

