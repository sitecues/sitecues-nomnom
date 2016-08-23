'use strict';

const
  eventCount = {},
  dateInfo = {},
  eventTotals = require('./eventTotals'),
  BASELINE_VALUE = '*base*';  // Value that represents no test

let numDates;

function recordEventCount(parsedEvent, testName, testValue, dateIndex) {
  // Prepare the object the count will go into, if it doesn't exist already
  const eventName = parsedEvent.name;

  if (!eventCount[eventName]) {
    eventCount[eventName] = {};
  }
  if (!eventCount[eventName][testName]) {
    eventCount[eventName][testName] = {};
  }

  let dateArray = eventCount[eventName][testName][testValue];
  if (!dateArray) {
    dateArray = eventCount[eventName][testName][testValue] = createDateArray();
  }

  // Increment the count
  dateArray[dateIndex] = (dateArray[dateIndex] || 0) + 1;
}

function onData(dateIndex, parsedEvent) {
  const abTest = parsedEvent.abTest;
  if (!abTest) {
    return;
  }

  // Change testName.subTest.X into { testName: 'testName.subTest', testValue: 'X' }
  const splitByDot = abTest.split('.'),
    splitLength = Math.max(splitByDot.length - 1, 1),
    testName = splitByDot.slice(0, splitLength),
    testValue = splitByDot.slice(splitLength) || 'true';

  recordEventCount(parsedEvent, testName, testValue, dateIndex);

  // Record start and end date for the ab test
  recordDates(testName, dateIndex);
}

function recordDates(name, dateIndex) {
  if (dateInfo[name]) {
    if (dateIndex < dateInfo[name].startIndex) {
      dateInfo[name].startIndex = dateIndex;
    }
    if (dateIndex > dateInfo[name].endIndex) {
      dateInfo[name].endIndex = dateIndex;
    }
  }
  else {
    dateInfo[name] = {
      startIndex: dateIndex,
      endIndex: dateIndex
    }
  }
}

function createDateArray() {
  return new Array(numDates).fill(0);
}

function init(config) {
  numDates = config.numDates;
}

function finalizeTest(event, eventData, testName) {
  const testData = eventData[testName],
    values = Object.keys(testData),
    startDateIndex = dateInfo[testName].startIndex,
    endDateIndex = dateInfo[testName].endIndex;

  // Use valid subset of dates
  for (let testValue of values) {
    if (testData[testValue]) {
      testData[testValue] = testData[testValue].slice(startDateIndex, endDateIndex + 1);
    }
  }

  // Add *off* to each set of values, representing the baseline Sitecues numbers when the test was not being used
  testData[BASELINE_VALUE] = eventTotals.getEventTotalsByName(event, startDateIndex, endDateIndex);
}

function finalize() {
  // 1. Report data only the subset of dates that make sense for this date array
  //    That is, between the start and end dates for that test name
  // 2. Add *off* to each set of values, representing the baseline Sitecues numbers when the test was not being used
  const events = Object.keys(eventCount);
  for (let event of events) {
    const eventData = eventCount[event],
      tests = Object.keys(eventData);
    for (let testName of tests) {
      finalizeTest(event, eventData, testName);
    }
  }

  return {
    eventCount,
    dateInfo
  };
}

module.exports = {
  init,
  onData,
  finalize
};
