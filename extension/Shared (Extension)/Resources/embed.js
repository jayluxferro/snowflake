/* global chrome, Popup */

window.onload = () => {
  // Fill i18n in HTML
  Popup.fill(document.body, (m) => {
    return chrome.i18n.getMessage(m);
  });

  const port = chrome.runtime.connect({
    name: "popup"
  });

  const popup = new Popup(
    (...args) => chrome.i18n.getMessage(...args),
    (event) => port.postMessage({ enabled: event.target.checked }),
    () => port.postMessage({ retry: true }),
    (
      (
        typeof false !== 'undefined'
        // eslint-disable-next-line no-undef
        && false
      )
        ? (newValue) => port.postMessage({ runInBackground: newValue })
        : undefined
    )
  );

  port.onMessage.addListener((m) => {
    const { clients, enabled, total, missingFeature } = m;

    if (missingFeature) {
      popup.missingFeature(missingFeature);
      return;
    }

    if (enabled) {
      popup.turnOn(clients, total);
    } else {
      popup.turnOff();
    }
  });
};
