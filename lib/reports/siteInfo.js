'use strict';

const siteIdToLocationsMap = {},
  locationToSiteIdMap = {},
  processedLocations = {};

function onData(dateIndex, parsedEvent) {
  if (parsedEvent.name !== 'page-visited') {
    return;
  }

  const siteId = '#' + parsedEvent.siteId,
    locations = parsedEvent.meta.locations;

  function isTLD(locationName) {
    return locationName.charAt(0) === '.';
  }

  for (let location of locations) {
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

function processInterestingLocations() {
  // A path-based location (not a site id) is interesting if it has multiple matching site ids or has > MIN_PAGE_VISITS
  const MIN_PAGE_VISITS = 10,
    interestingLocations = locationToSiteIdMap,
    uninterestingLocations = new Set();

  for (let location of Object.keys(locationToSiteIdMap)) {
    const siteIdToPageVisitMap = locationToSiteIdMap[location],
      siteIds = Object.keys(siteIdToPageVisitMap);
    if (siteIds.length <= 1 && siteIdToPageVisitMap[siteIds[0]] < MIN_PAGE_VISITS) {
      console.log('Removing ' + location);
      console.log(siteIdToPageVisitMap);
      uninterestingLocations.add(location);
      delete interestingLocations[location];
      // Remove bad locations from the siteId -> location map
      for (let siteId of Object.keys(siteIdToLocationsMap)) {
        delete siteIdToLocationsMap[siteId][location];
      }
    }
  }

  processedLocations.interestingLocations = interestingLocations;
  processedLocations.uninterestingLocations = uninterestingLocations;
  return processedLocations;
}

function getInterestingLocations() {
  return processedLocations.interestingLocations || processInterestingLocations().interestingLocations;
}

function getUninterestingLocations() {
  return processedLocations.uninterestingLocations || processInterestingLocations().uninterestingLocations;
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
    locationToSiteIdMap: getInterestingLocations(),
    uninterestingLocations: getUninterestingLocations(),
    siteIdToLocationsMap
  };
}

module.exports = {
  init,
  onData,
  finalize,
  getSiteIdFor,
  getUninterestingLocations
};
