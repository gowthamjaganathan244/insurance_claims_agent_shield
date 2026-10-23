import { mockOperations } from "./mock-operations.mjs";
import { mockMonitoring } from "./mock-monitoring.mjs";
import { mockClaims } from "./mock-claims.mjs";
import { mockRemoteMonitoring } from "./mock-remote-monitoring.mjs";
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
  if (
    url.hostname === "testoperations.execute-api.ap-southeast-2.amazonaws.com"
  )
    return mockOperations(url, init);
  if (
    url.hostname === "testmonitoring.execute-api.ap-southeast-2.amazonaws.com"
  )
    return mockRemoteMonitoring(url, init);
  if (url.hostname === "b30dloh6e4.execute-api.ap-southeast-2.amazonaws.com")
    return mockClaims(url, init);
  if (url.hostname === "monitoring.ap-southeast-2.amazonaws.com")
    return mockMonitoring(input, init);
  return original(input, init);
};
