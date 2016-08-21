'use strict';

const
  getLocations = require('../locations'),
  byLocation = {},
  byNameOnly = {},
  byUserAgentOnly = {};

let numDates;

function getUserAgentNames(parsedEvent) {
  const ua = parsedEvent.meta.ua,
    browser = ua.browser,
    uaNames = ua.groups.concat(browser).concat('@any');

  if (browser === 'IE') {
    if (ua.browserVersion >= 6 && ua.browserVersion <= 11) {
      return uaNames.concat('IE' + ua.browserVersion);
    }
  }
  else if (browser === 'Safari') {
    if (ua.browserVersion >= 5 && ua.browserVersion <= 99) { // Future proof enough? :)
      return uaNames.concat('Safari' + ua.browserVersion);
    }
  }

  return uaNames;
}

function onData(dateIndex, parsedEvent) {
  const uaNames = getUserAgentNames(parsedEvent),
    allLocations = getLocations(parsedEvent),
    eventName = parsedEvent.name;


  let locationMap, eventNameMap, uaMap;

  for (let location of allLocations) {
    locationMap = byLocation[location];
    if (!locationMap) {
      locationMap = byLocation[location] = {};
    }
    eventNameMap = locationMap[eventName];
    if (!eventNameMap) {
      eventNameMap = locationMap[eventName] = {};
    }
    for (let uaName of uaNames) {
      uaMap = eventNameMap[uaName];
      if (!uaMap) {
        uaMap = eventNameMap[uaName] = createDateArray();
      }
      ++ uaMap[dateIndex];
    }
  }
  byNameOnly[eventName] = (byNameOnly[eventName] || 0) + 1;

  for (let uaName of uaNames) {
    byUserAgentOnly[uaName] = (byUserAgentOnly[uaName] || 0) + 1;
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
    byNameOnly,
    byUserAgentOnly,
    byLocation
  };
}

module.exports = {
  init,
  onData,
  finalize
};
