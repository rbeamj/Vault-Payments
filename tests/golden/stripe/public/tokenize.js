// GENERATED FILE — do not edit by hand.
//
// Browser tokenization for Stripe.
//
// Security properties, in order of importance:
//   - cardholder data is entered into provider-hosted inputs and never touches
//     this code or your server;
//   - the provider script is loaded from the provider's own CDN and is never
//     bundled, copied, or vendored into your build;
//   - this script only ever handles a token, never a card number.
//
// The server must inject the publishable key before this script runs:
//
//   <script>window.VAULT_CONFIG = { publishableKey: "" };</script>
//
// The publishable key is not a secret, but it is configuration, so it comes
// from the server rather than being baked into this file.

(function () {
  'use strict';

  var SCRIPT_URL = "https://js.stripe.com/v3/";
  var GLOBAL_NAME = "Stripe";
  var ROUTE = "/payments/authorize";
  var SUBMIT_TARGET = "#payment-form";
  var MOUNT = {"card":"#card-element"};

  function fail(message) {
    throw new Error('Vault-Payments tokenization: ' + message);
  }

  function injectedPublishableKey() {
    var config = globalThis.VAULT_CONFIG;
    var key = config && config.publishableKey;
    if (!key) {
      fail('window.VAULT_CONFIG.publishableKey is not set. The server must inject it before this script runs.');
    }
    return key;
  }

  function loadScript(url) {
    return new Promise(function (resolve, reject) {
      if (globalThis[GLOBAL_NAME]) {
        resolve();
        return;
      }
      var element = document.createElement('script');
      element.src = url;
      element.async = true;
      element.onload = function () { resolve(); };
      element.onerror = function () {
        reject(new Error('Could not load the provider script from ' + url));
      };
      document.head.appendChild(element);
    });
  }

  function mountHostedFields(provider) {
    var elements = provider.elements();
    Object.keys(MOUNT).forEach(function (selector) {
      var target = document.querySelector(selector);
      if (!target) {
        fail('no element matches ' + selector);
      }
      var type = MOUNT[selector];
      var component = elements.create(type);
      component.mount(selector);
      target.setAttribute('data-vault-mounted', type);
    });
  }

  function onSubmit(event, provider) {
    event.preventDefault();

    var form = event.currentTarget;
    var button = form.querySelector('button[type="submit"]');
    if (button) {
      button.disabled = true;
    }

    var tokenInput = form.querySelector('input[name="payment_token"]');

    provider
      .createPaymentMethod()
      .then(function (result) {
        if (result.error) {
          fail(result.error.message || 'the provider rejected the payment details');
        }
        if (!tokenInput) {
          fail('no <input name="payment_token"> found in the form');
        }
        tokenInput.value = result.paymentMethod ? result.paymentMethod.id : '';
        return fetch(ROUTE, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: Number(form.getAttribute('data-amount')),
            currency: form.getAttribute('data-currency'),
            reference: form.getAttribute('data-reference') || undefined
          })
        });
      })
      .then(function (response) {
        if (!response.ok) {
          return response.json().then(function (body) {
            fail(body && body.error ? body.error : 'request failed with ' + response.status);
          });
        }
        return response.json();
      })
      .then(function (body) {
        if (typeof form.getAttribute('data-success-url') === 'string') {
          globalThis.location.assign(form.getAttribute('data-success-url'));
        } else {
          fail('payment accepted: ' + JSON.stringify(body));
        }
      })
      .catch(function (error) {
        if (button) {
          button.disabled = false;
        }
        fail(error && error.message ? error.message : String(error));
      });
  }

  function start() {
    var publishableKey = injectedPublishableKey();

    loadScript(SCRIPT_URL)
      .then(function () {
        var Provider = globalThis[GLOBAL_NAME];
        if (typeof Provider !== 'function') {
          fail('the provider script did not install global ' + GLOBAL_NAME);
        }
        return new Provider(publishableKey);
      })
      .then(function (provider) {
        mountHostedFields(provider);

        var form = document.querySelector(SUBMIT_TARGET);
        if (!form) {
          fail('no form matches ' + SUBMIT_TARGET);
        }
        form.addEventListener('submit', function (event) {
          onSubmit(event, provider);
        });
      })
      .catch(function (error) {
        // Surface configuration problems loudly: a silent failure here would
        // look exactly like a working integration that collects nothing.
        globalThis.console.error(error);
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
