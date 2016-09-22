"use strict";

const sessions = [],
  // Don't consider as a non-bounce session from these events:
  // Note: we may change this in the future -- need to compare with how it affects our bounce metrics so we know what we've done to ourselves,
  // and whether it's worth the extra expense.
  IGNORE_EVENTS = new Set([ 'error', 'mouse-shake', 'page-unloaded', 'page-scrolled-first', 'page-clicked-first' ]);

// We store sessions as numbers for efficiency
// Don't use the entire uuid as it's huge -- we don't need 100% guarantee of uniqueness
function asNumber(uuid) {
  // We use the last hex part of the uuid. It has 12 digits
  // Therefore for any 2 items there 1 in 16^12 (1 in ~281 trillion) chance of collision
  // However, because of the birthday paradox there is a higher chance, e.g. 0.2% if a million session ids on the same day
  const hexPart = uuid.split('-')[4];
  return parseInt(hexPart, 16);
}

function getSessionEventCount(dateIndex, parsedEvent) {
  if (IGNORE_EVENTS.has(parsedEvent.name)) {
    return; // Don't use error or mouse-shake events
  }
  const sessionId = parsedEvent.sessionId;
  if (!sessionId) {
    return 0;
  }

  const
    sessionIndex = asNumber(sessionId),
    sessionsForThisDay = sessions[dateIndex],
    numEvents = (sessionsForThisDay[sessionIndex] || 0) + 1;

  sessionsForThisDay[sessionIndex] = numEvents;

  return numEvents;
}

function getNumSessions(dateIndex) {
  return Object.keys(sessions[dateIndex]).length;
}

function getNumNonBounceSessions(dateIndex) {
  const sessionsForThisDay = sessions[dateIndex],
    allSessions = Object.keys(sessionsForThisDay),
    singleEventSessions = allSessions.filter((sessionId) => sessionsForThisDay[sessionId] > 1);

  return singleEventSessions.length;
}

function init(dateIndex) {
  sessions[dateIndex] = {};

}
// Clear memory used to store sessions for this date
function release(dateIndex) {
  sessions[dateIndex] = null;
}

module.exports = {
  getSessionEventCount,
  init,
  release,
  getNumSessions,
  getNumNonBounceSessions
};