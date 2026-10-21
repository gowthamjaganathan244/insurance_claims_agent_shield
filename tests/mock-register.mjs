// Loaded only by tests/start-server.mjs through a child process --import.
// The production application has no test authentication flag or bypass route.
const original = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(
    typeof input === "string" || input instanceof URL ? input : input.url,
  );
  if (url.hostname === "cognito-idp.ap-southeast-2.amazonaws.com") {
    url.protocol = "http:";
    url.hostname = "127.0.0.1";
    url.port = "3199";
    return original(
      input instanceof Request ? new Request(url, input) : url,
      init,
    );
  }
  return original(input, init);
};
