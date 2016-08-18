"use strict";
function getLocations(parsedEvent) {
  return parsedEvent.meta.locations
    .concat('#' + parsedEvent.siteId, parsedEvent.meta.domain, '@any' );
}

module.exports = getLocations;
