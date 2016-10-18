'use strict';

const
  CATEGORY = 'abtest',
  eventCountProcessor = require('./event-count-processor'),
  countsByLocAndUa = require('./location-and-ua');  // Get same event counts when there is no AB test running

let
  testNameValueMap,
  testDates;

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
    const testValues = Array.from(testNameValueMap[params.testName]) || [],
      result = {};

    for (let testValue of testValues) {
      const key = params.testName + '||' + testValue + '||' + params.event;
      result[testValue] = eventCountProcessor.getDateCountsArray(CATEGORY, params.type, key,
        dateRange.startIndex, dateRange.endIndex).countsArray;
    }

    result['*base*'] = baseEventCounts.countsArray;
    return result;
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
  const sortedDateInfo = Object.keys(testDates[testName]).sort();
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
    splitTestNameVal = splitKey.split('.'),
    testName = splitTestNameVal.slice(0, -1).join('.'),
    testValue = splitTestNameVal[splitTestNameVal.length - 1];
  if (!testNameValueMap[testName]) {
    testNameValueMap[testName] = new Set();
    testDates[testName] = {};
    console.log(testName);
  }
  testNameValueMap[testName].add(testValue); // Add value to set
  Object.assign(testDates[testName], JSON.parse(dateData));
}

eventCountProcessor.init(CATEGORY, {
  userCounts: registerPermutation
});

module.exports = {
  get,
  listTestNamesAndDates,
  listTestValuesFor,
};

