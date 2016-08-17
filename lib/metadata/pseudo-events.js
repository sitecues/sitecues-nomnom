'use strict';

const userAgentParser = require('./ua-parser');

const pseudoEventsFn = {
  'page-visited': getPageVisitPseudoEvents,
  'tts-requested': getTtsPseudoEvents,
  'zoom-changed': getZoomChangedPseudoEvents,
  'feedback-sent': getStarRatingPseudoEvents,
  'panel-clicked': getPanelClickedPseudoEvents,
  'key-command': getKeyCommandPseudoEvents
},
  INTERESTING_LANGS = new Set(['en', 'de', 'es', 'fr', 'se', 'pl']);

function getPageVisitedLocalePseudoEvents(parsedEvent) {
// Don't fill our table up with locale event data for bots and unsupported traffic
  const locale = parsedEvent.clientLanguage || parsedEvent.client_language,
    VALID_LOCALE_REGEX = /^[a-z]{2,3}(?:-[A-Z]{2,3}(?:-[a-zA-Z]{4})?)?$/m,
    pseudoEvents = [];

  if (locale) {
    if (locale.match(VALID_LOCALE_REGEX)) {
      const lang = locale.split('-')[0],
        isLangSupported = INTERESTING_LANGS.has(lang);
      if (isLangSupported) {
        if (locale.includes('-')) {
          pseudoEvents.push('locale::' + locale);
        }
        pseudoEvents.push('locale::' + lang);
      }
      else {
        pseudoEvents.push('locale::unsupported::@any');
        pseudoEvents.push('locale::unsupported::' + lang);
      }
    }
  }
  else {
    pseudoEvents.push('locale::@invalid');
  }

  return pseudoEvents;
}

function getKeyCommandPseudoEvents(parsedEvent) {
  return parsedEvent.details ? [ parsedEvent.details.keyName ] : [];
}

function getPageVisitPseudoEvents(parsedEvent) {
  const isZoomOn = parsedEvent.zoomLevel > 1,
    isSpeechOn = parsedEvent.ttsState,
    isThemeOn = parsedEvent.settings && parsedEvent.settings.themeName,
    isWindowNameUsed = parsedEvent.details && parsedEvent.details.windowName,
    pseudoEvents = [];

  if (isZoomOn) {
    pseudoEvents.push('zoom-on');
  }

  if (isSpeechOn) {
    pseudoEvents.push('speech-on');
  }

  if (isThemeOn) {
    pseudoEvents.push('theme-on');
  }

  if (isWindowNameUsed) {
    pseudoEvents.push('window-name-on');
  }

  // We no longer use this -- instead we use the user agent groups @supported, @unsupported
  // pseudoEvents.push(event.metadata.ua.isUnsupported ? 'unsupported' : 'supported');
  if (!parsedEvent.metadata.ua) {
    parsedEvent.metadata.ua = userAgentParser(parsedEvent);
  }
  if (parsedEvent.metadata.ua.isInconsistent) {
    pseudoEvents.push('supported-inconsistency');
  }

  const isBadgeHidden = parsedEvent.details && (parsedEvent.details.isBadgeHidden || parsedEvent.details.isUnsupported);
  pseudoEvents.push(isBadgeHidden ? 'non-operational' : 'operational');

  if (!isBadgeHidden) {
    const sessionEventCount = parsedEvent.metadata.sessionEventCount;
    if (sessionEventCount > 1) {
      pseudoEvents.push('nonbounce');
    }
  }

  // Get locale pseudo events if supported user agent
  if (!parsedEvent.metadata.ua.isUnsupported) {
    //return pseudoEvents.concat(getPageVisitedLocalePseudoEvents(parsedEvent);
  }

  return pseudoEvents;
}

// Create pseudo-events:
// 'speech-trigger-selection'
// 'speech-trigger-shift'
// 'speech-trigger-space'
function getTtsPseudoEvents(parsedEvent) {
  const details = parsedEvent.details;
  if (details) {
    return ['via-' + parsedEvent.details.trigger]; // There will always be a trigger
  }
}

function getZoomChangedPseudoEvents(parsedEvent) {
  const pseudoEvents = [],
    details = parsedEvent.details;
  if (!details) {
    return;
  }
  if (details.isSlider) {
    pseudoEvents.push(details.isSliderClick ? 'via-slider-click' : 'via-slider-drag');
  }
  else if (details.isCtrlWheel) {
    pseudoEvents.push('via-wheel');
  }
  else if (details.isUnpinch) {
    pseudoEvents.push('via-unpinch');
  }
  else if (details.isButtonPress) {
    pseudoEvents.push('via-A-button');
    pseudoEvents.push('glide-' + details.isLongGlide);
  }
  else if (details.isKey) {
    pseudoEvents.push('via-keypress');
    pseudoEvents.push('glide-' + details.isLongGlide);
    pseudoEvents.push('stolen-browser-key-' + details.isBrowserKeyOverride);
  }
  else {
    pseudoEvents.push('details-empty');
  }

  return pseudoEvents;
}

function getStarRatingPseudoEvents(parsedEvent) {
  var numStars = parsedEvent.details.rating;

  if (!numStars) {
    return [ 'no-stars-given' ];
  }

  // By returning 'star-given' for each, star, this allows the graphing viewer to be used
  // to see the average rating over time, by using the ratio of stars-given to star-given
  return [ 'any-stars-given' ].concat(Array(numStars).fill('one-star-given'));
}

function getPanelClickedPseudoEvents(parsedEvent) {
  return [ parsedEvent.details.target ];
}

// Return additional pseudo events that occurred based on event data or falsey if none
function getPseudoEvents(event) {
  const pseudoEventsGetterFn = pseudoEventsFn[event.name];
  if (pseudoEventsGetterFn) {
    let pseudoEvents = pseudoEventsGetterFn(event);
    if (pseudoEvents && pseudoEvents.length) {
      // Create name like page-visited::supported
      return pseudoEvents.map((pseudoEventName) => event.name + '::' + pseudoEventName);
    }
  }
}

module.exports = getPseudoEvents;
