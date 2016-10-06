'use strict';

const SOURCE_DATA_FILE_NAME = './counts-by-date.json',
  fs = require('fs'),
  path = require('path'),
  constants = require('../lib/constants'),
  dataLocation = path.join(constants.DEFAULT_DATA_FOLDER, constants.HIVE_RESULTS_DATA_SUBFOLDER, SOURCE_DATA_FILE_NAME);

function getCountsByDate(params) {
  const getDataSlice = (data) => {
    const map = data[params.type];
    if (!map) {
      return {
        err: 'No such type'
      };
    }
    const key = params.loc + '||' + params.ua + '||' + params.event,
      dateMap = map[key];
    console.log(key);
    if (!dateMap) {
      return {
        err: 'No data for this permutation'
      };
    }

    let startIndex = Infinity;

    // Fill counts array
    const allCountsArray = [];
    for (let date of Object.keys(dateMap)) {
      const dateIndex = parseInt(date);
      if (dateIndex < startIndex) {
        startIndex = dateIndex;
      }
      allCountsArray[dateIndex] = dateMap[date];
    }

    if (!allCountsArray.length) {
      return {
        err: 'Weirdly, could not compute array'
      };
    }

    // Remove useless entries at the start so that array only covers valuable date range where there were counts
    const countsArray = allCountsArray.slice(startIndex),
      numDates = countsArray.length;

    // Convert missing entries in valuable date range to 0
    for (let index = 0; index < numDates; index ++) {
      if (!countsArray[index]) {
        countsArray[index] = 0;
      }
    }

    console.log(countsArray);

    return {
      startIndex,
      countsArray
    };
  };

  return fetchSourceData({ doAllowCache : true })
    .then(getDataSlice);
}

function fetchSourceData(options) {
  return new Promise((resolve) => {
    if (options && options.doAllowCache && fetchSourceData.cache) {
      resolve(fetchSourceData.cache);
    }
    fs.readFile(dataLocation, 'utf-8', (err, textData) => {
      if (err) {
        throw err;
      }
      const data = JSON.parse(textData);
      fetchSourceData.cache = data;
      resolve(data);
    });
  });
}

fetchSourceData()
  .then(() => {
    fs.watch(dataLocation, () => {
      setTimeout(fetchSourceData, 5000); // TODO fix this hacky way of waiting for the data to be finished writing
    });
  });

module.exports = getCountsByDate;

