'use strict';

const
  CATEGORY = 'abtest',
  eventCountProcessor = require('./event-count-processor'),
  countsByLocAndUa = require('./location-and-ua');  // Get same event counts when there is no AB test running

let
  testNameValueMap,
  testDates;

function getTestValues(testName) {
  return Array.from(testNameValueMap[testName]) || [];
}

function getCountsForDateRange(params, dateRange) {
  return countsByLocAndUa.get({
      loc: '@any',
      ua: '@supported',
      event: params.event,
      type: params.type,
      startIndex: dateRange.startIndex,
      endIndex: dateRange.endIndex
    })
  .then((baseEventCounts) => {
    const testValues = getTestValues(params.testName),
      dateCountPromises = testValues.map((testValue) => {
        const abTestName = testValue === true ? params.testName : params.testName + '.' + testValue,
          key = abTestName + '||' + params.event,
          dateCountPromise = eventCountProcessor.getDateCountsArray(CATEGORY, params.type, key,
            dateRange.startIndex, dateRange.endIndex);
        return dateCountPromise;
      });

    dateCountPromises.push(Promise.resolve(baseEventCounts));

    return Promise.all(dateCountPromises);
  })
  .then((results) => {
    console.log('---');
    const
      finalResult = {},
      testValues = getTestValues(params.testName);
    let
      index = results.length;

    while (index --) {
      const testValue = testValues[index];
      finalResult[testValue || '*base*'] = results[index].countsArray;
    }

    return finalResult;
  });
}

function get(params) {
  return eventCountProcessor.fetchDatabase(CATEGORY, params.type)
    .then(() => {
      // Get date range
      return getDateRange(params.testName);
    })
    .then((dateRange) => {
      // Get base data
      return getCountsForDateRange(params, dateRange);
    });
}

function getDateRange(testName) {
  const sortedDateInfo = Array.from(testDates[testName]).sort();
  return {
    startIndex: sortedDateInfo[0],
    endIndex: sortedDateInfo[sortedDateInfo.length - 1]
  };
}

function listTestNamesAndDates() {
  return eventCountProcessor.fetchDatabase(CATEGORY)
    .then(() => {
      const testNames = Object.keys(testDates),
        testDateRangeInfo = {};
      for (let testName of testNames) {
        testDateRangeInfo[testName] = getDateRange(testName);
      }
      return testDateRangeInfo;
    });
}

function listTestValuesFor(testName) {
  return eventCountProcessor.fetchDatabase(CATEGORY)
    .then(() => Array.from(testNameValueMap[testName]) || []);
}

// Key format is: testName.testVal||eventName
// Potentially testName.subTestName.testVal||eventName -- we don't utilize that currently
function registerPermutation(key, dateData) {
  if (!key) {
    // Reset
    testNameValueMap = {};
    testDates = {};
    return;
  }
  const splitKey = key.split('||'),
    splitTestNameVal = splitKey[0].split('.'),
    isMultipartKey = splitTestNameVal.length > 1,
    testName = isMultipartKey ? splitTestNameVal.slice(0, -1).join('.') : splitTestNameVal[0],
    testValue = isMultipartKey ? splitTestNameVal[splitTestNameVal.length - 1] : true;
  if (!testNameValueMap[testName]) {
    testNameValueMap[testName] = new Set();
    testDates[testName] = new Set();
    console.log('AB Test name: ' +  testName);
    console.log(key);
  }
  // Add test name to set of all test names
  testNameValueMap[testName].add(testValue);

  // Add all dates for this test value to set of dates for the test name
  const origDates = testDates[testName],
    parsedDates = JSON.parse(dateData),
    newDates = Object.keys(parsedDates).map((x) => parseInt(x));
  newDates.forEach(origDates.add.bind(origDates));
}

eventCountProcessor.init(CATEGORY, {
  userCounts: registerPermutation
});

module.exports = {
  get,
  listTestNamesAndDates,
  listTestValuesFor,
};

