'use strict';

const
  CATEGORY = 'abtest',
  eventCountProcessor = require('./event-count-processor');
let
  testNameValueMap,
  testDates;

function get(params) {
  const key = params.testName + '||' + params.testValue + '||' + params.event;
  return eventCountProcessor.getDateCountsArray(CATEGORY, params.type, key);
}

function listTestNamesAndDates() {
  return eventCountProcessor.fetchDatabase(CATEGORY)
    .then(() => {
      const testNames = Object.keys(testDates),
        testDateRangeInfo = {};
      for (let testName of testNames) {
        const sortedDateInfo = Object.keys(testDates[testName]).sort();
        testDateRangeInfo[name].startIndex = sortedDateInfo[0];
        testDateRangeInfo[name].endIndex = sortedDateInfo[sortedDateInfo.length - 1];
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

