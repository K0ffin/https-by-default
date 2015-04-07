/**
 * Copyright (c) 2015 Rob Wu <rob@robwu.nl> (https://robwu.nl)
 */
/* globals Components, APP_SHUTDOWN, console */

/* exported startup, install, shutdown, uninstall */
'use strict';
const Ci = Components.interfaces;
const Cm = Components.manager;
const Cr = Components.results;
const NS_URIFIXUP_CONTRACTID = '@mozilla.org/docshell/urifixup;1';

// The default fixup implementation, provided by nsDefaultURIFixup.
const DefaultURIFixup =
  Components.classesByID['{214c48a0-b57f-11d4-959c-0020183bf181}']
  .getService(Ci.nsIURIFixup);

function CustomURIFixup() {
}

CustomURIFixup.prototype = {
  // Metadata used by factory.
  classID: Components.ID('4262ff38-28eb-4845-b8f0-01262fdb72d5'),
  classDescription: 'Add https instead of http if scheme is not specified.',
  contractID: NS_URIFIXUP_CONTRACTID,

  // nsISupports
  QueryInterface: function CustomURIFixup_QueryInterface(iid) {
    if (Ci.nsISupports.equals(iid))
      return this;
    if (Ci.nsIURIFixup.equals(iid))
      return this;
    throw Cr.NS_ERROR_NO_INTERFACE;
  },

  // nsIURIFixup
  FIXUP_FLAG_NONE: 0,
  FIXUP_FLAG_ALLOW_KEYWORD_LOOKUP: 1,
  FIXUP_FLAGS_MAKE_ALTERNATE_URI: 2,
  FIXUP_FLAG_REQUIRE_WHITELISTED_HOST: 4,
  FIXUP_FLAG_FIX_SCHEME_TYPOS: 8,

  createExposableURI: function(aURI) {
    return DefaultURIFixup.createExposableURI(aURI);
  },

  createFixupURI: function(aURIText, aFixupFlags, aPostData) {
    let fixupInfo;
    try {
      fixupInfo = this.getFixupURIInfo(aURIText, aFixupFlags, aPostData);
    } catch (e) {
    }
    if (fixupInfo) {
      return fixupInfo.preferredURI;
    }
    return null;
  },

  getFixupURIInfo: function(aURIText, aFixupFlags, aPostData) {
    let fixupInfo =
      DefaultURIFixup.getFixupURIInfo(aURIText, aFixupFlags, aPostData);
    // If the protocol was fixed-up to http, AND
    // the original URI did not start with a RFC 2396-compliant scheme,
    // then assume that the URI was fixed-up by prefixing the default protocol,
    // i.e. 'http://' by nsDefaultURIFixup::FixupURIProtocol.
    if (fixupInfo &&
        fixupInfo.fixupChangedProtocol &&
        fixupInfo.preferredURI &&
        fixupInfo.preferredURI.schemeIs('http') &&
        !/^[a-z][a-z0-9+\-.]*:/i.test(aURIText)) {
      fixupInfo.preferredURI.scheme = 'https';
    }
    return fixupInfo;
  },

  keywordToURI: function(aKeyword, aPostData) {
    return DefaultURIFixup.keywordToURI(aKeyword, aPostData);
  },
};


function ComponentFactory(Component) {
  let originalCID;
  return {
    // nsISupports
    QueryInterface: function ComponentFactory_QueryInterface(iid) {
      if (Ci.nsISupports.equals(iid))
        return this;
      if (Ci.nsIFactory.equals(iid))
        return this;
      throw Cr.NS_ERROR_NO_INTERFACE;
    },

    // nsIFactory
    createInstance: function ComponentFactory_createInstance(aOuter, iid) {
      if (aOuter)
        throw Cr.NS_ERROR_NO_AGGREGATION;
      return new Component().QueryInterface(iid);
    },

    lockFactory: function ComponentFactory_lockFactory(aDoLock) {
      throw Cr.NS_ERROR_NOT_IMPLEMENTED;
    },

    // Component registration logic (no particular interface).
    register: function ComponentFactory_register() {
      // Note: Use Cm.QI() instead of Cm.nsIComponentRegistrar because of
      // https://bugzilla.mozilla.org/show_bug.cgi?id=1141070.
      var registrar = Cm.QueryInterface(Ci.nsIComponentRegistrar);
      // Save original CID for use in unregister().
      originalCID = registrar.contractIDToCID(Component.prototype.contractID);
      if (registrar.isCIDRegistered(Component.prototype.classID)) {
        console.warn('Not registering ' + Component.prototype.classID +
            ' because it was already registered.');
        return;
      }
      registrar.registerFactory(
          Component.prototype.classID,
          Component.prototype.classDescription,
          Component.prototype.contractID,
          this);
    },

    unregister: function ComponentFactory_unregister() {
      var registrar = Cm.QueryInterface(Ci.nsIComponentRegistrar);
      if (registrar.isCIDRegistered(Component.prototype.classID)) {
        registrar.unregisterFactory(Component.prototype.classID, this);
      } else {
        // This should not happen. It only happens when register() failed or
        // when something else (e.g. another addon) unregistered the factory.
        console.warn('Cannot unregister ' + Component.prototype.classID +
            ' because it was not registered!');
      }
      // Restore original factory.
      if (originalCID) {
        registrar.registerFactory(
            originalCID,
            'Original implementation of ' + Component.prototype.contractID,
            Component.prototype.contractID,
            null);
        originalCID = null;
      } else {
        console.warn('Cannot register original factory for ' +
            Component.prototype.contractID + ' because it was not saved.');
      }
    },
  };
}

let factory;

// Bootstrap hooks.
// https://developer.mozilla.org/en-US/docs/Extensions/bootstrap.js

function startup() {
  factory = new ComponentFactory(CustomURIFixup);
  factory.register();
}

function install() {}

function shutdown(data, reason) {
  // Don't bother restoring the old state upon shutdown of the browser.
  if (reason === APP_SHUTDOWN)
    return;
  factory.unregister();
}

function uninstall() {}