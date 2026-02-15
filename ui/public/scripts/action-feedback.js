(function () {
  function setupActionFeedback(form) {
    if (form.__rwSetIntent) return;
    var buttons = form.querySelectorAll('[data-intent]');
    var intentField = document.getElementById('intent-field');

    function setIntent(intent) {
      if (!intentField) return;
      intentField.value = intent || 'compile';
    }

    function setActive(intent) {
      buttons.forEach(function (btn) {
        btn.classList.toggle('is-active', btn.dataset.intent === intent);
      });
    }

    form.__rwSetIntent = function (intent, silent) {
      setIntent(intent);
      if (!silent) setActive(intent);
    };

    buttons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var intent = btn.dataset.intent || 'compile';
        setIntent(intent);
        setActive(intent);
      });
    });

    form.addEventListener('htmx:beforeRequest', function (event) {
      var submitter = event.detail && event.detail.triggeringEvent ? event.detail.triggeringEvent.submitter : null;
      var intent = submitter && submitter.dataset ? submitter.dataset.intent : null;
      if (!intent) intent = 'compile';
      setIntent(intent);
      setActive(intent);
      buttons.forEach(function (btn) {
        btn.classList.toggle('is-loading', btn === submitter);
      });
    });

    form.addEventListener('htmx:afterRequest', function () {
      buttons.forEach(function (btn) {
        btn.classList.remove('is-loading');
      });
      setIntent('compile');
    });

    setActive('compile');
  }

  window.__rw = window.__rw || {};
  window.__rw.setupActionFeedback = setupActionFeedback;
})();
