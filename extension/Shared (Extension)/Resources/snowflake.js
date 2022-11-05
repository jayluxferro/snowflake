/* global log, dbg, snowflake */

/**
Communication with the snowflake broker.

Browser snowflakes must register with the broker in order
to get assigned to clients.
*/

// Represents a broker running remotely.
class Broker {

  /**
   * When interacting with the Broker, snowflake must generate a unique session
   * ID so the Broker can keep track of each proxy's signalling channels.
   * On construction, this Broker object does not do anything until
   * `getClientOffer` is called.
   * @param {Config} config
   */
  constructor(config) {
    this.getClientOffer = this.getClientOffer.bind(this);
    this._postRequest = this._postRequest.bind(this);
    this.setNATType = this.setNATType.bind(this);

    this.config = config;
    this.url = config.brokerUrl;
    this.natType = "unknown";
    if (0 === this.url.indexOf('localhost', 0)) {
      // Ensure url has the right protocol + trailing slash.
      this.url = 'http://' + this.url;
    }
    if (0 !== this.url.indexOf('http', 0)) {
      this.url = 'https://' + this.url;
    }
    if ('/' !== this.url.substr(-1)) {
      this.url += '/';
    }
  }

  /**
   * Promises some client SDP Offer.
   * Registers this Snowflake with the broker using an HTTP POST request, and
   * waits for a response containing some client offer that the Broker chooses
   * for this proxy..
   * TODO: Actually support multiple clients.
   */
  getClientOffer(id, numClientsConnected) {
    return new Promise((fulfill, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.onreadystatechange = function() {
        if (xhr.DONE !== xhr.readyState) {
          return;
        }
        switch (xhr.status) {
          case Broker.CODE.OK: {
            const response = JSON.parse(xhr.responseText);
            if (response.Status == Broker.STATUS.MATCH) {
              return fulfill(response); // Should contain offer.
            } else if (response.Status == Broker.STATUS.TIMEOUT) {
              return reject(Broker.MESSAGE.TIMEOUT);
            } else {
              log('Broker ERROR: Unexpected ' + response.Status);
              return reject(Broker.MESSAGE.UNEXPECTED);
            }
          }
          default:
            log('Broker ERROR: Unexpected ' + xhr.status + ' - ' + xhr.statusText);
            snowflake.ui.setStatus(' failure. Please refresh.');
            return reject(Broker.MESSAGE.UNEXPECTED);
        }
      };
      this._xhr = xhr; // Used by spec to fake async Broker interaction
      const clients = Math.floor(numClientsConnected / 8) * 8;
      const data = {
        Version: "1.3",
        Sid: id,
        Type: this.config.proxyType,
        NAT: this.natType,
        Clients: clients,
        AcceptedRelayPattern: this.config.allowedRelayPattern,
      };
      this._postRequest(xhr, 'proxy', JSON.stringify(data));
    });
  }

  /**
   * Assumes getClientOffer happened, and a WebRTC SDP answer has been generated.
   * Sends it back to the broker, which passes it to back to the original client.
   * @param {string} id
   * @param {RTCSessionDescription} answer
   */
  sendAnswer(id, answer) {
    dbg(id + ' - Sending answer back to broker...\n');
    dbg(answer.sdp);
    const xhr = new XMLHttpRequest();
    xhr.onreadystatechange = function() {
      if (xhr.DONE !== xhr.readyState) {
        return;
      }
      switch (xhr.status) {
        case Broker.CODE.OK:
          dbg('Broker: Successfully replied with answer.');
          dbg(xhr.responseText);
          break;
        default:
          dbg('Broker ERROR: Unexpected ' + xhr.status + ' - ' + xhr.statusText);
          snowflake.ui.setStatus(' failure. Please refresh.');
          break;
      }
    };
    const data = {"Version": "1.0", "Sid": id, "Answer": JSON.stringify(answer)};
    this._postRequest(xhr, 'answer', JSON.stringify(data));
  }

  setNATType(natType) {
    this.natType = natType;
  }

  /**
   * @param {XMLHttpRequest} xhr
   * @param {string} urlSuffix for the broker is different depending on what action
   * is desired.
   * @param {string} payload
   */
  _postRequest(xhr, urlSuffix, payload) {
    try {
      xhr.open('POST', this.url + urlSuffix);
    } catch (err) {
      /*
      An exception happens here when, for example, NoScript allows the domain
      on which the proxy badge runs, but not the domain to which it's trying
      to make the HTTP xhr. The exception message is like "Component
      returned failure code: 0x805e0006 [nsIXMLHttpRequest.open]" on Firefox.
      */
      log('Broker: exception while connecting: ' + err.message);
      return;
    }
    xhr.send(payload);
  }

}

Broker.CODE = {
  OK: 200,
  BAD_REQUEST: 400,
  INTERNAL_SERVER_ERROR: 500
};

Broker.STATUS = {
  MATCH: "client match",
  TIMEOUT: "no match"
};

Broker.MESSAGE = {
  TIMEOUT: 'Timed out waiting for a client offer.',
  UNEXPECTED: 'Unexpected status.'
};


class Config {
  constructor(proxyType) {
    this.proxyType = proxyType || '';
  }
}

Config.prototype.brokerUrl = 'snowflake-broker.freehaven.net';

Config.prototype.relayAddr = {
  host: 'snowflake.freehaven.net',
  port: '443'
};

// Original non-wss relay:
// host: '192.81.135.242'
// port: 9902
Config.prototype.cookieName = "snowflake-allow";

// Bytes per second. Set to undefined to disable limit.
Config.prototype.rateLimitBytes = undefined;

Config.prototype.minRateLimit = 10 * 1024;

Config.prototype.rateLimitHistory = 5.0;

Config.prototype.defaultBrokerPollInterval = 60.0 * 1000; //1 poll every minutes
Config.prototype.slowestBrokerPollInterval = 6 * 60 * 60.0 * 1000; //1 poll every 6 hours
Config.prototype.pollAdjustment = 100.0 * 1000;
Config.prototype.fastBrokerPollInterval = 30 * 1000; //1 poll every 30 seconds

// Recheck our NAT type once every 2 days
Config.prototype.natCheckInterval = 2 * 24 * 60 * 60 * 1000;

// Timeout after sending answer before datachannel is opened
Config.prototype.datachannelTimeout = 20 * 1000;

// Timeout to close proxypair if no messages are sent
Config.prototype.messageTimeout = 30 * 1000;

Config.prototype.maxNumClients = 1;

Config.prototype.proxyType = "";

// TODO: Different ICE servers.
Config.prototype.pcConfig = {
  iceServers: [
    {
      urls: ['stun:stun.l.google.com:19302']
    }
  ]
};

Config.PROBEURL = "https://snowflake-broker.freehaven.net:8443/probe";

Config.prototype.allowedRelayPattern="snowflake.torproject.net";
/* global snowflake, log, dbg, Util, Parse, WS */

/**
Represents a single:

   client <-- webrtc --> snowflake <-- websocket --> relay

Every ProxyPair has a Snowflake ID, which is necessary when responding to the
Broker with an WebRTC answer.
*/

class ProxyPair {

  /**
   * @param relayAddr the destination relay
   * @param {*} rateLimit specifies a rate limit on traffic
   * @param {Config} config
   */
  constructor(relayAddr, rateLimit, config) {
    this.prepareDataChannel = this.prepareDataChannel.bind(this);
    this.connectRelay = this.connectRelay.bind(this);
    this.onClientToRelayMessage = this.onClientToRelayMessage.bind(this);
    this.onRelayToClientMessage = this.onRelayToClientMessage.bind(this);
    this.onError = this.onError.bind(this);
    this.flush = this.flush.bind(this);

    /** @type {string | undefined} */
    this.relayURL = undefined;
    this.relayAddr = relayAddr;
    this.rateLimit = rateLimit;
    this.config = config;
    this.pcConfig = config.pcConfig;
    this.id = Util.genSnowflakeID();
    this.c2rSchedule = [];
    this.r2cSchedule = [];
    this.counted = false;
  }

  /** Prepare a WebRTC PeerConnection and await for an SDP offer. */
  begin() {
    this.pc = new RTCPeerConnection(this.pcConfig);
    this.pc.onicecandidate = (evt) => {
      // Browser sends a null candidate once the ICE gathering completes.
      if (null === evt.candidate && this.pc.connectionState !== 'closed') {
        dbg('Finished gathering ICE candidates.');
        snowflake.broker.sendAnswer(this.id, this.pc.localDescription);
      }
    };
    // OnDataChannel triggered remotely from the client when connection succeeds.
    this.pc.ondatachannel = (dc) => {
      const channel = dc.channel;
      dbg('Data Channel established...');
      this.prepareDataChannel(channel);
      this.client = channel;
    };
  }

  /**
   * @param {RTCSessionDescription} offer
   * @returns {boolean} `true` on success, `false` on fail.
   */
  receiveWebRTCOffer(offer) {
    if ('offer' !== offer.type) {
      log('Invalid SDP received -- was not an offer.');
      return false;
    }
    try {
      this.pc.setRemoteDescription(offer);
    } catch (error) {
      log('Invalid SDP message.');
      return false;
    }
    dbg('SDP ' + offer.type + ' successfully received.');
    return true;
  }

  /**
   * Given a WebRTC DataChannel, prepare callbacks.
   * @param {RTCDataChannel} channel
   */
  prepareDataChannel(channel) {
    // if we don't receive any keep-alive messages from the client, close the
    // connection
    const onStaleTimeout = () => {
      console.log("Closing stale connection.");
      this.flush();
      this.close();
    };
    this.refreshStaleTimeout = () => {
      clearTimeout(this.messageTimer);
      this.messageTimer = setTimeout(onStaleTimeout, this.config.messageTimeout);
    };

    channel.onopen = () => {
      log('WebRTC DataChannel opened!');
      snowflake.ui.increaseClients();
      this.counted = true;

      this.refreshStaleTimeout();

      // This is the point when the WebRTC datachannel is done, so the next step
      // is to establish websocket to the server.
      this.connectRelay();
    };
    channel.onclose = () => {
      log('WebRTC DataChannel closed.');
      snowflake.ui.setStatus('disconnected by webrtc.');
      if (this.counted) {
        snowflake.ui.decreaseClients();
        this.counted = false;
      }
      this.flush();
      this.close();
    };
    channel.onerror = function () {
      log('Data channel error!');
    };
    channel.binaryType = "arraybuffer";
    channel.onmessage = this.onClientToRelayMessage;
  }

  /** Assumes WebRTC datachannel is connected. */
  connectRelay() {
    dbg('Connecting to relay...');
    // Get a remote IP address from the PeerConnection, if possible. Add it to
    // the WebSocket URL's query string if available.
    // MDN marks remoteDescription as "experimental". However the other two
    // options, currentRemoteDescription and pendingRemoteDescription, which
    // are not marked experimental, were undefined when I tried them in Firefox
    // 52.2.0.
    // https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/remoteDescription
    const desc = this.pc.remoteDescription;
    const peer_ip = Parse.ipFromSDP(desc!= null ? desc.sdp : undefined);
    const params = [];
    if (peer_ip != null) {
      params.push(["client_ip", peer_ip]);
    }
    const relay = this.relay =
      (this.relayURL === undefined) ?
        WS.makeWebsocket(this.relayAddr, params) :
        WS.makeWebsocketFromURL(this.relayURL, params);
    this.relay.label = 'websocket-relay';
    this.relay.onopen = () => {
      clearTimeout(this.connectToRelayTimeoutId);
      log(relay.label + ' connected!');
      snowflake.ui.setStatus('connected');
    };
    this.relay.onclose = () => {
      log(relay.label + ' closed.');
      snowflake.ui.setStatus('disconnected.');
      if (this.counted) {
        snowflake.ui.decreaseClients();
        this.counted = false;
      }
      this.flush();
      this.close();
    };
    this.relay.onerror = this.onError;
    this.relay.onmessage = this.onRelayToClientMessage;
    // TODO: Better websocket timeout handling.
    this.connectToRelayTimeoutId = setTimeout((() => {
      log(relay.label + ' timed out connecting.');
      relay.onclose();
    }), 5000);
  }

  /**
   * WebRTC --> websocket
   * @param {MessageEvent} msg
   */
  onClientToRelayMessage(msg) {
    dbg('WebRTC --> websocket data: ' + msg.data.byteLength + ' bytes');
    this.c2rSchedule.push(msg.data);
    this.flush();

    this.refreshStaleTimeout();
  }

  /**
   * websocket --> WebRTC
   * @param {MessageEvent} event
   */
  onRelayToClientMessage(event) {
    dbg('websocket --> WebRTC data: ' + event.data.byteLength + ' bytes');
    this.r2cSchedule.push(event.data);
    this.flush();
  }

  onError(event) {
    const ws = event.target;
    log(ws.label + ' error.');
    this.close();
  }

  /** Close both WebRTC and websocket. */
  close() {
    clearTimeout(this.connectToRelayTimeoutId);
    clearTimeout(this.messageTimer);
    if (this.webrtcIsReady()) {
      this.client.close();
    }
    if (this.peerConnOpen()) {
      this.pc.close();
    }
    if (this.relayIsReady()) {
      this.relay.close();
    }
    this.onCleanup();
  }

  /** Send as much data in both directions as the rate limit currently allows. */
  flush() {
    let busy = true;
    while (busy && !this.rateLimit.isLimited()) {
      busy = false;
      // WebRTC --> websocket
      if (this.c2rSchedule.length > 0 && this.relayIsReady() && this.relay.bufferedAmount < this.MAX_BUFFER) {
        const chunk = this.c2rSchedule.shift();
        this.relay.send(chunk);
        this.rateLimit.update(chunk.byteLength);
        busy = true;
      }
      // websocket --> WebRTC
      if (this.r2cSchedule.length > 0 && this.webrtcIsReady() && this.client.bufferedAmount < this.MAX_BUFFER) {
        const chunk = this.r2cSchedule.shift();
        this.client.send(chunk);
        this.rateLimit.update(chunk.byteLength);
        busy = true;
      }
    }

    if (this.flush_timeout_id) {
      clearTimeout(this.flush_timeout_id);
      this.flush_timeout_id = null;
    }
    if (this.r2cSchedule.length > 0 || this.c2rSchedule.length > 0 || (this.relayIsReady() && this.relay.bufferedAmount > 0) || (this.webrtcIsReady() && this.client.bufferedAmount > 0)) {
      this.flush_timeout_id = setTimeout(this.flush, this.rateLimit.when() * 1000);
    }
  }

  webrtcIsReady() {
    return null !== this.client && 'open' === this.client.readyState;
  }

  relayIsReady() {
    return (null !== this.relay) && (WebSocket.OPEN === this.relay.readyState);
  }

  /**
   * @param {WebSocket} ws
   */
  isClosed(ws) {
    return undefined === ws || WebSocket.CLOSED === ws.readyState;
  }

  peerConnOpen() {
    return (null !== this.pc) && ('closed' !== this.pc.connectionState);
  }

  /**
   * @param {typeof this.relayURL} relayURL
   */
  setRelayURL(relayURL) {
    this.relayURL = relayURL;
  }

}

ProxyPair.prototype.MAX_BUFFER = 10 * 1024 * 1024;

ProxyPair.prototype.pc = null;
ProxyPair.prototype.client = null; // WebRTC Data channel
ProxyPair.prototype.relay = null; // websocket

ProxyPair.prototype.connectToRelayTimeoutId = 0;
ProxyPair.prototype.messageTimer = 0;
ProxyPair.prototype.flush_timeout_id = null;

ProxyPair.prototype.onCleanup = null;
/* global log, dbg, DummyRateLimit, BucketRateLimit, ProxyPair */

/**
A JavaScript WebRTC snowflake proxy

Uses WebRTC from the client, and Websocket to the server.

Assume that the webrtc client plugin is always the offerer, in which case
this proxy must always act as the answerer.

TODO: More documentation
*/

class Snowflake {

  /**
   * Prepare the Snowflake with a Broker (to find clients) and optional UI.
   * @param {Config} config
   * @param {WebExtUI | BadgeUI | DebugUI} ui
   * @param {Broker} broker
   */
  constructor(config, ui, broker) {
    this.receiveOffer = this.receiveOffer.bind(this);

    this.config = config;
    this.ui = ui;
    this.broker = broker;
    this.broker.setNATType(ui.natType);
    this.proxyPairs = [];
    this.natFailures = 0;
    this.pollInterval = this.config.defaultBrokerPollInterval;
    if (undefined === this.config.rateLimitBytes) {
      this.rateLimit = new DummyRateLimit();
    } else {
      this.rateLimit = new BucketRateLimit(this.config.rateLimitBytes * this.config.rateLimitHistory, this.config.rateLimitHistory);
    }
    this.retries = 0;
  }

  /**
   * Set the target relay address spec, which is expected to be websocket.
   * TODO: Should potentially fetch the target from broker later, or modify
   * entirely for the Tor-independent version.
   * @param {{ host: string; port: string; }} relayAddr
   */
  setRelayAddr(relayAddr) {
    this.relayAddr = relayAddr;
    log('Using ' + relayAddr.host + ':' + relayAddr.port + ' as Relay.');
  }

  /**
   * Initialize WebRTC PeerConnection, which requires beginning the signalling
   * process. `pollBroker` automatically arranges signalling.
   */
  beginWebRTC() {
    this.pollBroker();
    this.pollTimeoutId = setTimeout((() => {
      this.beginWebRTC();
    }), this.pollInterval);
  }

  /**
   * Regularly poll Broker for clients to serve until this snowflake is
   * serving at capacity, at which point stop polling.
   */
  pollBroker() {
    // Poll broker for clients.
    if (this.proxyPairs.length >= this.config.maxNumClients) {
      log('At client capacity.');
      return;
    }
    const pair = this.makeProxyPair();
    log('Polling broker..');
    // Do nothing until a new proxyPair is available.
    let msg = 'Polling for client ... ';
    if (this.retries > 0) {
      msg += '[retries: ' + this.retries + ']';
    }
    this.ui.setStatus(msg);
    //update NAT type
    console.log("NAT type: " + this.ui.natType);
    this.broker.setNATType(this.ui.natType);
    const recv = this.broker.getClientOffer(pair.id, this.proxyPairs.length);
    recv.then((resp) => {
      const clientNAT = resp.NAT;
      if (!this.receiveOffer(pair, resp.Offer, resp.RelayURL)) {
        pair.close();
        return;
      }
      //set a timeout for channel creation
      setTimeout((() => {
        if (!pair.webrtcIsReady()) {
          log('proxypair datachannel timed out waiting for open');
          pair.close();
          // increase poll interval
          this.pollInterval =
            Math.min(this.pollInterval + this.config.pollAdjustment,
              this.config.slowestBrokerPollInterval);
          if (clientNAT == "restricted") {
            this.natFailures++;
          }
          // if we fail to connect to a restricted client 3 times in
          // a row, assume we have a restricted NAT
          if (this.natFailures >= 3) {
            this.ui.natType = "restricted";
            console.log("Learned NAT type: restricted");
            this.natFailures = 0;
            this.config.maxNumClients = 1;
          }
          this.broker.setNATType(this.ui.natType);
        } else {
          // decrease poll interval
          this.pollInterval =
            Math.max(this.pollInterval - this.config.pollAdjustment,
              this.config.defaultBrokerPollInterval);
          this.natFailures = 0;
          if (this.ui.natType == "unrestricted") {
            this.pollInterval = this.config.fastBrokerPollInterval;
            this.config.maxNumClients = 2;
          }
        }
      }), this.config.datachannelTimeout);
    }, function () {
      //on error, close proxy pair
      pair.close();
    });
    this.retries++;
  }

  /**
   * Receive an SDP offer from some client assigned by the Broker
   * @param {ProxyPair} pair an available ProxyPair.
   * @param {string} desc
   * @param {string | undefined} relayURL
   * @returns {boolean} `true` on success, `false` on fail.
   */
  receiveOffer(pair, desc, relayURL) {
    try {
      if (relayURL !== undefined) {
        const relayURLParsed = new URL(relayURL);
        const hostname = relayURLParsed.hostname;
        const protocol = relayURLParsed.protocol;
        if (protocol !== "wss:") {
          log('incorrect relay url protocol');
          return false;
        }
        if (!this.checkRelayPattern(this.config.allowedRelayPattern, hostname)) {
          log('relay url hostname does not match allowed pattern');
          return false;
        }
        pair.setRelayURL(relayURL);
      }
      /** @type {RTCSessionDescriptionInit} */
      const offer = JSON.parse(desc);
      dbg('Received:\n\n' + offer.sdp + '\n');
      const sdp = new RTCSessionDescription(offer);
      if (pair.receiveWebRTCOffer(sdp)) {
        this.sendAnswer(pair);
        return true;
      } else {
        return false;
      }
    } catch (e) {
      log('ERROR: Unable to receive Offer: ' + e);
      return false;
    }
  }

  /**
   * @param {ProxyPair} pair
   */
  sendAnswer(pair) {
    /** @param {RTCLocalSessionDescriptionInit} sdp */
    const next = function (sdp) {
      dbg('webrtc: Answer ready.');
      pair.pc.setLocalDescription(sdp).catch(fail);
    };
    const fail = function () {
      pair.close();
      dbg('webrtc: Failed to create or set Answer');
    };
    pair.pc.createAnswer().then(next).catch(fail);
  }

  /**
   * @returns {ProxyPair}
   */
  makeProxyPair() {
    const pair = new ProxyPair(this.relayAddr, this.rateLimit, this.config);
    this.proxyPairs.push(pair);

    log('Snowflake IDs: ' + (this.proxyPairs.map(p => p.id)).join(' | '));

    pair.onCleanup = () => {
      // Delete from the list of proxy pairs.
      const ind = this.proxyPairs.indexOf(pair);
      if (ind > -1) {
        this.proxyPairs.splice(ind, 1);
      }
    };
    pair.begin();
    return pair;
  }

  /** Stop all proxypairs. */
  disable() {
    log('Disabling Snowflake.');
    clearTimeout(this.pollTimeoutId);
    while (this.proxyPairs.length > 0) {
      this.proxyPairs.pop().close();
    }
  }

  /**
   * checkRelayPattern match str against patten
   * @param {string} pattern
   * @param {string} str typically a domain name to be checked
   * @return {boolean}
   */
  checkRelayPattern(pattern, str) {
    if (typeof pattern !== "string") {
      throw 'invalid checkRelayPattern input: pattern';
    }
    if (typeof str !== "string") {
      throw 'invalid checkRelayPattern input: str';
    }

    let exactMatch = false;
    if (pattern.charAt(0) === "^") {
      exactMatch = true;
      pattern = pattern.substring(1);
    }

    if (exactMatch) {
      return pattern.localeCompare(str) === 0;
    }
    return str.endsWith(pattern);
  }

}

Snowflake.prototype.relayAddr = null;
Snowflake.prototype.rateLimit = null;

Snowflake.MESSAGE = {
  CONFIRMATION: 'You\'re currently serving a Tor user via Snowflake.'
};
/**
All of Snowflake's DOM manipulation and inputs.
*/

class UI {

  constructor() {
    this.initStats();
  }

  initStats() {
    this.stats = [0];
    setInterval((() => {
      this.stats.unshift(0);
      this.stats.splice(24);
      this.postActive();
    }), 60 * 60 * 1000);
  }

  setStatus() {}

  get active() {
    return this.clients > 0;
  }

  postActive() {}

  increaseClients() {
    this.clients += 1;
    this.stats[0] += 1;
    this.postActive();
    return this.clients;
  }

  decreaseClients() {
    this.clients -= 1;
    if(this.clients < 0) {
      this.clients = 0;
    }
    this.postActive();
    return this.clients;
  }

  log() {}

}

UI.prototype.clients = 0;
UI.prototype.stats = null;
/* exported Util, Params, DummyRateLimit */
/* global Config */

/**
A JavaScript WebRTC snowflake proxy

Contains helpers for parsing query strings and other utilities.
*/

class Util {

  static genSnowflakeID() {
    return Math.random().toString(36).substring(2);
  }

  static hasWebRTC() {
    return typeof RTCPeerConnection === 'function';
  }

  static hasCookies() {
    return navigator.cookieEnabled;
  }

  /**
   * @returns {Promise<"restricted" | "unrestricted">}
   * resolves to "restricted" if we
   * fail to make a test connection to a known restricted
   * NAT, "unrestricted" if the test connection succeeds, and
   * "unknown" if we fail to reach the probe test server
   * @param {number} timeout
   */
  static checkNATType(timeout) {
    let pc = new RTCPeerConnection({iceServers: [
      {urls: 'stun:stun1.l.google.com:19302'}
    ]});
    let channel = pc.createDataChannel("NAT test");
    return (new Promise((fulfill, reject) => {
      let open = false;
      channel.onopen = function() {
        open = true;
        fulfill("unrestricted");
      };
      pc.onicecandidate = (evt) => {
        if (evt.candidate == null) {
          //ice gathering is finished
          Util.sendOffer(pc.localDescription)
          .then((answer) => {
            setTimeout(() => {
              if(!open) {
                fulfill("restricted");
              }
            }, timeout);
            pc.setRemoteDescription(JSON.parse(answer));
          }).catch((e) => {
            console.log(e);
            reject("Error receiving probetest answer");
          });
        }
      };
      pc.createOffer()
      .then((offer) =>  pc.setLocalDescription(offer))
      .catch((e) => {
        console.log(e);
        reject("Error creating offer for probetest");
      });
    }).finally(() => {
      channel.close();
      pc.close();
    }));
  }

  /**
   * Assumes getClientOffer happened, and a WebRTC SDP answer has been generated.
   * Sends it back to the broker, which passes it back to the original client.
   * @param {RTCSessionDescription} offer
   */
  static sendOffer(offer) {
    return new Promise((fulfill, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.timeout = 30 * 1000;
      xhr.onreadystatechange = function() {
        if (xhr.DONE !== xhr.readyState) {
          return;
        }
        switch (xhr.status) {
          case 200: {
            const response = JSON.parse(xhr.responseText);
            return fulfill(response.Answer); // Should contain offer.
          }
          default:
            console.log('Probe ERROR: Unexpected ' + xhr.status + ' - ' + xhr.statusText);
            return reject('Failed to get answer from probe service');
        }
      };
      const data = {"Status": "client match", "Offer": JSON.stringify(offer)};
      try {
        xhr.open('POST', Config.PROBEURL);
      } catch (error) {
        console.log('Signaling Server: exception while connecting: ' + error.message);
        return reject('unable to connect to signaling server');
      }
      xhr.send(JSON.stringify(data));
    });
  }
}


class Parse {

  /**
   * @param {typeof document.cookie} cookies
   * Parse a cookie data string (usually document.cookie). The return type is an
   * object mapping cookies names to values. Returns null on error.
   * http://www.w3.org/TR/DOM-Level-2-HTML/html.html#ID-8747038
   */
  static cookie(cookies) {
    const result = {};
    const strings = cookies ? cookies.split(';') : [];
    for (let i = 0, len = strings.length; i < len; i++) {
      const string = strings[i];
      const j = string.indexOf('=');
      if (-1 === j) {
        return null;
      }
      const name = decodeURIComponent(string.substr(0, j).trim());
      const value = decodeURIComponent(string.substr(j + 1).trim());
      if (!(name in result)) {
        result[name] = value;
      }
    }
    return result;
  }

  /**
   * @param {string} spec
   * Parse an address in the form 'host:port'. Returns an Object with keys 'host'
   * (String) and 'port' (int). Returns null on error.
   */
  static address(spec) {
    let m = null;
    if (!m) {
      // IPv6 syntax.
      m = spec.match(/^\[([\0-9a-fA-F:.]+)\]:([0-9]+)$/);
    }
    if (!m) {
      // IPv4 syntax.
      m = spec.match(/^([0-9.]+):([0-9]+)$/);
    }
    if (!m) {
      // TODO: Domain match
      return null;
    }
    const host = m[1];
    const port = parseInt(m[2], 10);
    if (isNaN(port) || port < 0 || port > 65535) {
      return null;
    }
    return {
      host: host,
      port: port
    };
  }

  /**
   * Parse a count of bytes. A suffix of 'k', 'm', or 'g' (or uppercase)
   * does what you would think. Returns null on error.
   */
  static byteCount(spec) {
    let matches = spec.match(/^(\d+(?:\.\d*)?)(\w*)$/);
    if (matches === null) {
      return null;
    }
    let count = Number(matches[1]);
    if (isNaN(count)) {
      return null;
    }
    const UNITS = new Map([
      ['', 1],
      ['k', 1024],
      ['m', 1024*1024],
      ['g', 1024*1024*1024],
    ]);
    let unit = matches[2].toLowerCase();
    if (!UNITS.has(unit)) {
      return null;
    }
    let multiplier = UNITS.get(unit);
    return count * multiplier;
  }

  /**
   * Parse a remote connection-address out of the "c=" Connection Data field
   * or the "a=" attribute fields of the session description.
   * Return undefined if none is found.
   * https://tools.ietf.org/html/rfc4566#section-5.7
   * https://tools.ietf.org/html/rfc5245#section-15
   */
  static ipFromSDP(sdp) {
    console.log(sdp);
    const ref = [
      /^a=candidate:[a-zA-Z0-9+/]+ \d+ udp \d+ ([\d.]+) /mg,
      /^a=candidate:[a-zA-Z0-9+/]+ \d+ udp \d+ ([0-9A-Fa-f:.]+) /mg,
      /^c=IN IP4 ([\d.]+)(?:(?:\/\d+)?\/\d+)?(:? |$)/mg,
      /^c=IN IP6 ([0-9A-Fa-f:.]+)(?:\/\d+)?(:? |$)/mg
    ];
    for (let i = 0, len = ref.length; i < len; i++) {
      const pattern = ref[i];
      let m = pattern.exec(sdp);
      while (m != null) {
        if(Parse.isRemoteIP(m[1])) return m[1];
        m = pattern.exec(sdp);
      }
    }
  }

  /**
   * Parse the mapped port out of an ice candidate returned from the
   * onicecandidate callback
   */
  static portFromCandidate(c) {
    const pattern = /(?:[\d.]+|[0-9A-Fa-f:.]+) (\d+) typ srflx/m;
    const m = pattern.exec(c);
    if (m != null) {
      return m[1];
    }
    return null;
  }

  /** Determine whether an IP address is a local, unspecified, or loopback address */
  static isRemoteIP(ip) {
    if (ip.includes(":")) {
      const ip6 = ip.split(':');
      // Loopback address
      const loopback = /^(?:0*:)*?:?0*1$/m;
      // Unspecified address
      const unspecified = /^(?:0*:)*?:?0*$/m;
      // Local IPv6 addresses are defined in https://tools.ietf.org/html/rfc4193
      return !((loopback.exec(ip) != null) || (unspecified.exec(ip) != null) ||
        (parseInt(ip6[0],16)&0xfe00) == 0xfc00);
    }

    // Local IPv4 addresses are defined in https://tools.ietf.org/html/rfc1918
    const ip4 = ip.split('.');
    return !(ip4[0] == 10 || ip4[0] == 127 || ip == "0.0.0.0" ||
      (ip4[0] == 172 && (ip4[1]&0xf0) == 16) ||
      (ip4[0] == 192 && ip4[1] == 168) ||
      // Carrier-Grade NAT as per https://tools.ietf.org/htm/rfc6598
      (ip4[0] == 100 && (ip4[1]&0xc0) == 64) ||
      // Dynamic Configuration as per https://tools.ietf.org/htm/rfc3927
      (ip4[0] == 169 && ip4[1] == 254));
  }

}


class Params {

  static getBool(query, param, defaultValue) {
    if (!query.has(param)) {
      return defaultValue;
    }
    const val = query.get(param);
    if ('true' === val || '1' === val || '' === val) {
      return true;
    }
    if ('false' === val || '0' === val) {
      return false;
    }
    return null;
  }

  /**
   * Get an object value and parse it as a byte count. Example byte counts are
   * '100' and '1.3m'. Returns |defaultValue| if param is not a key. Return null
   * on a parsing error.
   */
  static getByteCount(query, param, defaultValue) {
    if (!query.has(param)) {
      return defaultValue;
    }
    return Parse.byteCount(query.get(param));
  }

}


class BucketRateLimit {

  constructor(capacity, time) {
    this.capacity = capacity;
    this.time = time;
  }

  age() {
    const now = new Date();
    const delta = (now - this.lastUpdate) / 1000.0;
    this.lastUpdate = now;
    this.amount -= delta * this.capacity / this.time;
    if (this.amount < 0.0) {
      this.amount = 0.0;
    }
  }

  update(n) {
    this.age();
    this.amount += n;
    return this.amount <= this.capacity;
  }

  /** How many seconds in the future will the limit expire? */
  when() {
    this.age();
    return (this.amount - this.capacity) / (this.capacity / this.time);
  }

  isLimited() {
    this.age();
    return this.amount > this.capacity;
  }

}

BucketRateLimit.prototype.amount = 0.0;

BucketRateLimit.prototype.lastUpdate = new Date();


/** A rate limiter that never limits. */
class DummyRateLimit {

  constructor(capacity, time) {
    this.capacity = capacity;
    this.time = time;
  }

  update() {
    return true;
  }

  when() {
    return 0.0;
  }

  isLimited() {
    return false;
  }

}
/*
Only websocket-specific stuff.
*/

class WS {

  /**
   * Build an escaped URL string from unescaped components. Only scheme and host
   * are required. See RFC 3986, section 3.
   */
  static buildUrl(scheme, host, port, path, params) {
    const parts = [];
    parts.push(encodeURIComponent(scheme));
    parts.push('://');
    // If it contains a colon but no square brackets, treat it as IPv6.
    if (host.match(/:/) && !host.match(/[[\]]/)) {
      parts.push('[');
      parts.push(host);
      parts.push(']');
    } else {
      parts.push(encodeURIComponent(host));
    }
    if (undefined !== port && this.DEFAULT_PORTS[scheme] !== port) {
      parts.push(':');
      parts.push(encodeURIComponent(port.toString()));
    }
    if (undefined !== path && '' !== path) {
      if (!path.match(/^\//)) {
        path = '/' + path;
      }
      path = path.replace(/[^/]+/, function (m) {
        return encodeURIComponent(m);
      });
      parts.push(path);
    }
    if (undefined !== params) {
      parts.push('?');
      parts.push(new URLSearchParams(params).toString());
    }
    return parts.join('');
  }

  static makeWebsocket(addr, params) {
    const wsProtocol = this.WSS_ENABLED ? 'wss' : 'ws';
    const url = this.buildUrl(wsProtocol, addr.host, addr.port, '/', params);
    const ws = new WebSocket(url);
    /*
    'User agents can use this as a hint for how to handle incoming binary data:
    if the attribute is set to 'blob', it is safe to spool it to disk, and if it
    is set to 'arraybuffer', it is likely more efficient to keep the data in
    memory.'
    */
    ws.binaryType = 'arraybuffer';
    return ws;
  }

  /**
   * Creates a websocket connection from a URL and params to override
   * @param {URL|string} url
   * @param {URLSearchParams|string[][]} params
   * @return {WebSocket}
   */
  static makeWebsocketFromURL(url, params) {
    let parsedURL = new URL(url);
    let urlpa = new URLSearchParams(params);
    urlpa.forEach(function (value, key) {
      parsedURL.searchParams.set(key, value);
    });

    let ws = new WebSocket(url);
    /*
    'User agents can use this as a hint for how to handle incoming binary data:
    if the attribute is set to 'blob', it is safe to spool it to disk, and if it
    is set to 'arraybuffer', it is likely more efficient to keep the data in
    memory.'
    */
    ws.binaryType = 'arraybuffer';
    return ws;
  }

  static probeWebsocket(addr) {
    return /** @type {Promise<void>} */(new Promise((resolve, reject) => {
      const ws = WS.makeWebsocket(addr);
      ws.onopen = () => {
        resolve();
        ws.close();
      };
      ws.onerror = () => {
        reject();
        ws.close();
      };
    }));
  }

}

WS.WSS_ENABLED = true;

WS.DEFAULT_PORTS = {
  http: 80,
  https: 443
};
/* global module, require */

/*
WebRTC shims for multiple browsers.
*/

if (typeof module !== "undefined" && module !== null ? module.exports : undefined) {
  window = {};
  document = {
    getElementById: function() {
      return null;
    }
  };
  chrome = {};
  location = { search: '' };
  ({ URLSearchParams } = require('url'));
  if ((typeof TESTING === "undefined" || TESTING === null) || !TESTING) {
    webrtc = require('wrtc');
    RTCPeerConnection = webrtc.RTCPeerConnection;
    RTCSessionDescription = webrtc.RTCSessionDescription;
    WebSocket = require('ws');
    ({ XMLHttpRequest } = require('xmlhttprequest'));
  }
}
/* global Util, chrome, Config, UI, Broker, Snowflake, WS */
/* eslint no-unused-vars: 0 */

/*
UI
*/


/**
 * Decide whether we need to request or revoke the 'background' permission, and
 * set the `runInBackground` storage value appropriately.
 * @param {boolean | undefined} enabledSetting
 * @param {boolean | undefined} runInBackgroundSetting
 */
function maybeChangeBackgroundPermission(enabledSetting, runInBackgroundSetting) {
  const needBackgroundPermission =
    runInBackgroundSetting
    // When the extension is disabled, we need the permission to be revoked because
    // otherwise it'll keep the browser process running for no reason.
    && enabledSetting;
  // Yes, this is called even if the permission is already in the state we need
  // it to be in (granted/removed).
  new Promise(r => {
    chrome.permissions[needBackgroundPermission ? "request" : "remove"](
      { permissions: ['background'] },
      r
    );
  })
  .then(success => {
    // Currently the resolve value is `true` even when the permission was alrady granted
    // before it was requested (already removed before it was revoked). TODO Need to make
    // sure it's the desired behavior and if it needs to change.
    // https://developer.chrome.com/docs/extensions/reference/permissions/#method-remove
    // https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/permissions/remove#return_value
    // https://github.com/mdn/content/pull/17516
    if (success) {
      chrome.storage.local.set({ runInBackground: runInBackgroundSetting });
    }
  });
}

// If you want to gonna change this to `false`, double-check everything as some code
// may still be assuming it to be `true`.
const DEFAULT_ENABLED = true;

class WebExtUI extends UI {

  constructor() {
    super();
    this.onConnect = this.onConnect.bind(this);
    this.onMessage = this.onMessage.bind(this);
    this.onDisconnect = this.onDisconnect.bind(this);
    chrome.runtime.onConnect.addListener(this.onConnect);
  }

  checkNAT() {
    Util.checkNATType(config.datachannelTimeout).then((type) => {
      console.log("Setting NAT type: " + type);
      this.natType = type;
    }).catch((e) => {
      console.log(e);
    });
  }

  initNATType() {
    this.natType = "unknown";
    this.checkNAT();
    setInterval(() => {this.checkNAT();}, config.natCheckInterval);
  }

  tryProbe() {
    WS.probeWebsocket(config.relayAddr)
    .then(
      () => {
        this.missingFeature = false;
        this.setEnabled(true);
      },
      () => {
        log('Could not connect to bridge.');
        this.missingFeature = 'popupBridgeUnreachable';
        this.setEnabled(false);
      }
    );
  }

  initToggle() {
    // First, check if we have our status stored
    (new Promise((resolve) => {
      chrome.storage.local.get(["snowflake-enabled"], resolve);
    }))
    .then((result) => {
      let enabled = this.enabled;
      if (result['snowflake-enabled'] !== undefined) {
        enabled = result['snowflake-enabled'];
      } else {
        log("Toggle state not yet saved");
      }
      // If it isn't enabled, stop
      if (!enabled) {
        this.setEnabled(enabled);
        return;
      }
      // Otherwise, do feature checks
      if (!Util.hasWebRTC()) {
        this.missingFeature = 'popupWebRTCOff';
        this.setEnabled(false);
        return;
      }
      this.tryProbe();
    });
  }

  postActive() {
    this.setIcon();
    if (!this.port) { return; }
    this.port.postMessage({
      clients: this.clients,
      total: this.stats.reduce((t, c) => t + c, 0),
      enabled: this.enabled,
      missingFeature: this.missingFeature,
    });
  }

  onConnect(port) {
    this.port = port;
    port.onDisconnect.addListener(this.onDisconnect);
    port.onMessage.addListener(this.onMessage);
    this.postActive();
  }

  onMessage(m) {
    if (m.retry) {
      // FIXME: Can set a retrying state here
      this.tryProbe();
    } else if (m.enabled != undefined) {
      (new Promise((resolve) => {
        chrome.storage.local.set({ "snowflake-enabled": m.enabled }, resolve);
      }))
      .then(() => {
        log("Stored toggle state");
        this.initToggle();
      });
      if (
        typeof false !== 'undefined'
        // eslint-disable-next-line no-undef
        && false
      ) {
        new Promise(r => chrome.storage.local.get({ runInBackground: false }, r))
        .then(storage => {
          maybeChangeBackgroundPermission(m.enabled, storage.runInBackground);
        });
      }
    } else if (m.runInBackground != undefined) {
      if (
        typeof false !== 'undefined'
        // eslint-disable-next-line no-undef
        && false
      ) {
        new Promise(r => chrome.storage.local.get({ "snowflake-enabled": DEFAULT_ENABLED }, r))
        .then(storage => {
          maybeChangeBackgroundPermission(storage["snowflake-enabled"], m.runInBackground);
        });
      }
    } else {
      log("Unrecognized message");
    }
  }

  onDisconnect() {
    this.port = null;
  }

  /**
   * @param {boolean} enabled
   */
  setEnabled(enabled) {
    this.enabled = enabled;
    this.postActive();
    update();
  }

  setIcon() {
    let path = null;
    if (!this.enabled) {
      path = {
        48: "assets/toolbar-off-48.png",
        96: "assets/toolbar-off-96.png"
      };
    } else if (this.active) {
      path = {
        48: "assets/toolbar-running-48.png",
        96: "assets/toolbar-running-96.png"
      };
    } else {
      path = {
        48: "assets/toolbar-on-48.png",
        96: "assets/toolbar-on-96.png"
      };
    }
    chrome.browserAction.setIcon({
      path: path,
    });
  }

}

WebExtUI.prototype.port = null;

WebExtUI.prototype.enabled = DEFAULT_ENABLED;

/*
Entry point.
*/

/** @typedef {WebExtUI} UIOfThisContext */
var
  /** @type {boolean} */
  debug,
  /** @type {Snowflake | null} */
  snowflake,
  /** @type {Config | null} */
  config,
  /** @type {Broker | null} */
  broker,
  /** @type {UIOfThisContext | null} */
  ui,
  /** @type {(msg: unknown) => void} */
  log,
  /** @type {(msg: unknown) => void} */
  dbg,
  /** @type {() => void} */
  init,
  /** @type {() => void} */
  update,
  /** @type {boolean} */
  silenceNotifications;

(function () {

  silenceNotifications = false;
  debug = false;
  snowflake = null;
  config = null;
  broker = null;
  ui = null;

  // Log to both console and UI if applicable.
  // Requires that the snowflake and UI objects are hooked up in order to
  // log to console.
  log = function(msg) {
    console.log('Snowflake: ' + msg);
    if (snowflake != null) {
      snowflake.ui.log(msg);
    }
  };

  dbg = function(msg) {
    if (debug) {
      log(msg);
    }
  };

  init = function() {
    config = new Config("webext");
    ui = new WebExtUI();
    broker = new Broker(config);
    snowflake = new Snowflake(config, ui, broker);
    log('== snowflake proxy ==');
    ui.initToggle();
    ui.initNATType();
  };

  update = function() {
    if (!ui.enabled) {
      // Do not activate the proxy if any number of conditions are true.
      snowflake.disable();
      log('Currently not active.');
      return;
    }
    // Otherwise, begin setting up WebRTC and acting as a proxy.
    dbg('Contacting Broker at ' + broker.url);
    log('Starting snowflake');
    snowflake.setRelayAddr(config.relayAddr);
    snowflake.beginWebRTC();
  };

  window.onunload = function() {
    if (snowflake !== null) { snowflake.disable(); }
    return null;
  };

  window.onload = init;

}());
