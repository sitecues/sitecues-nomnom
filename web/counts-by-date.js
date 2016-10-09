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
  dbs = {};

function getDbLocation(type) {
  return path.join(constants.DEFAULT_DATA_FOLDER, 'cache', type);
}

function getSourceDataLocation(type) {
  return path.join(constants.DEFAULT_DATA_FOLDER, 'hive', type + '.ldjson');
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

  return fetchSourceData(params.type)
    .then(getDataSlice);
}

function fetchSourceData(type, options) {
  const doForce = options && options.doForce;
  if (doForce || !existingDataFetchPromise[type]) {
    existingDataFetchPromise[type] = new Promise((resolve) => {
      const dbPath = getDbLocation(type);
      levelDown.destroy(dbPath, (err) => {
        if (err) {
          throw err;
        }
        dbs[type] = levelUp(dbPath, (err) => {
          if (err) {
            throw err;
          }

          console.log('Fetching ' + type);
          // Stream in new data
          fs.createReadStream(getSourceDataLocation(type))
            .pipe(es.split())
            .pipe(es.map((unparsedPermutation, callback) => {
              if (unparsedPermutation) {
                const endKeyIndex = unparsedPermutation.indexOf('":'),
                  key = unparsedPermutation.substring(2, endKeyIndex),
                  value = unparsedPermutation.substring(endKeyIndex + 2, unparsedPermutation.length - 1);
                dbs[type].put(key, value, callback);
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
              resolve(dbs[type]);
            })
        });
      });
    });
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
  fetchSourceData(type)
    .then(() => {
      fs.watch(getSourceDataLocation(type), () => {
        setTimeout(function () {
          fetchSourceData(type, {doForce: true});
        }, 1000); // TODO fix this hacky way of waiting for the data write? Probably works pretty well since we're a streaming parser
      });
    });
});

module.exports = getCountsByDate;

