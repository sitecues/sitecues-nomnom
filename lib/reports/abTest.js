'use strict';

const
  eventCount = {},
  dateInfo = {};

let numDates;

function recordEventCount(parsedEvent, testName, testValue, dateIndex) {
  // Prepare the object the count will go into, if it doesn't exist already
  if (!eventCount[testName]) {
    eventCount[testName] = {};
  }
  if (!eventCount[testName][testValue]) {
    eventCount[testName][testValue] = {};
  }

  const eventName = parsedEvent.name;
  let dateArray = eventCount[testName][testValue][eventName];
  if (!dateArray) {
    dateArray = eventCount[testName][testValue][eventName] = createDateArray();
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
    if (dateIndex < dateInfo.startIndex) {
      dateInfo.startIndex = dateIndex;
    }
    if (dateIndex > dateInfo.endIndex) {
      dateInfo.endIndex = dateIndex;
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

function finalize() {
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
