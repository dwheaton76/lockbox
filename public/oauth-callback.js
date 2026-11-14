// Google sends the user back here with the access token in the URL fragment.
// Hand it to the app (the app validates `state`), then get the token out of the URL.
(function () {
  const params = new URLSearchParams(location.hash.slice(1) || location.search.slice(1));
  const result = {
    state: params.get('state') || undefined,
    token: params.get('access_token') || undefined,
    expiresIn: Number(params.get('expires_in')) || undefined,
    error: params.get('error') || undefined,
  };
  history.replaceState(null, '', location.pathname);

  if (sessionStorage.getItem('lockbox.gdrive.redirect')) {
    // Full-page redirect sign-in: stash the result for the app and go back to it.
    sessionStorage.removeItem('lockbox.gdrive.redirect');
    sessionStorage.setItem('lockbox.gdrive.result', JSON.stringify(result));
    location.replace('./'); // the app lives next to this page (also under a sub-path)
  } else {
    // Popup sign-in: message the app's tab and close.
    const channel = new BroadcastChannel('lockbox-oauth');
    channel.postMessage(result);
    channel.close();
    window.close();
  }
})();
