'use strict';

const
  byLocation = {},
  byNameOnly = {},
  byUserAgentOnly = {};

let config;

function getPseudoEvents(parsedEvent) {
  let pseudoEvents = parsedEvent.meta.pseudoEvents || [];
  const sessionEventCount = parsedEvent.sessionEventCount;

  // Create name like page-visited::supported
  pseudoEvents = pseudoEvents.map((pseudoEventName) => parsedEvent.name + '::' + pseudoEventName);

  // Handle sessions -- this is not done in date repair/cleaning/precompile
  if (sessionEventCount > 1) {
    // Second and later page visits are non-bounce visits
    if (parsedEvent.name === 'page-visited' && pseudoEvents.includes('operational')) {
      pseudoEvents = pseudoEvents.concat('page-visited::nonbounce');
    }

    // on event #2, generate an extra page-visited::nonbounce corresponding to the original page-visited event
    if (sessionEventCount === 2) {
      pseudoEvents = pseudoEvents.concat('page-visited::nonbounce')
    }
  }

  return pseudoEvents;
}

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

function getLocations(parsedEvent) {
  return parsedEvent.meta.locations
    .concat(parsedEvent.siteId, parsedEvent.meta.domain, '@any' );
}

function onData(dateIndex, parsedEvent) {
  const uaNames = getUserAgentNames(parsedEvent),
    events = getPseudoEvents(parsedEvent).concat(parsedEvent.name),
    allLocations = getLocations(parsedEvent);

  let locationMap, eventNameMap, uaMap;

  for (let location of allLocations) {
    locationMap = byLocation[location];
    if (!locationMap) {
      locationMap = byLocation[location] = {};
    }
    for (let eventName of events) {
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
  }
  for (let eventName of events) {
    byNameOnly[eventName] = (byNameOnly[eventName] || 0) + 1;
  }

  for (let uaName of uaNames) {
    byUserAgentOnly[uaName] = (byUserAgentOnly[uaName] || 0) + 1;
  }
}

function createDateArray() {
  return new Array(config.numDates).fill(0);
}

function init(_config) {
  config = _config;
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
