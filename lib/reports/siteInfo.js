'use strict';

const siteIdToLocationsMap = {},
  locationToSiteIdMap = {};

function onData(dateIndex, parsedEvent) {
  if (parsedEvent.name !== 'page-visited') {
    return;
  }

  const siteId = parsedEvent.siteId;

  function isTLD(locationName) {
    return locationName.charAt(0) === '.';
  }

  for (let location of parsedEvent.metadata.locations) {
    addToMap(locationToSiteIdMap, location, siteId);
    if (!isTLD(location)) {  // Not TLD like .gov, .edu, .com, etc.
      addToMap(siteIdToLocationsMap, siteId, location);
    }
  }
}

function addToMap(map, key1, key2) {

  if (!map[key1]) {
    map[key1] = {};
  }

  map[key1][key2] = (map[key1][key2] || 0) + 1;
}

function getLocationsForSiteId(siteId) {
  return Object.keys(siteIdToLocationsMap[siteId]);
}

function getSiteIdsWithMultipleDomains(allSiteIds) {
  function numDomainsComparator(a, b) {
    return Object.keys(siteIdToLocationsMap[b]).length - Object.keys(siteIdToLocationsMap[a]).length;
  }
  const multiDomainSiteIds = allSiteIds.filter((siteId) => getLocationsForSiteId(siteId).length > 1);
  return multiDomainSiteIds.sort(numDomainsComparator);
}

function getSiteIdFor(location) {
  function siteIdComparator(a, b) {
    // Sort by # of page visits
    return siteIdToPageVisits[b] - siteIdToPageVisits[a];
  }
  const siteIdToPageVisits = locationToSiteIdMap[location];
  if (siteIdToPageVisits) {
    const siteIds = Object.keys(siteIdToPageVisits);
    return siteIds.sort(siteIdComparator)[0];
  }
}

function init(_config) {
}

function finalize() {

  const allSiteIds = Object.keys(siteIdToLocationsMap),
    siteIdsWithMultipleDomains = getSiteIdsWithMultipleDomains(allSiteIds);

  return {
    allSiteIds,
    siteIdsWithMultipleDomains,
    locationToSiteIdMap,
    siteIdToLocationsMap
  };
}

module.exports = {
  init,
  onData,
  finalize,
  getSiteIdFor
};
