// Test-process-only CloudWatch transport. Never imported by application code.
export async function mockMonitoring(input, init) {
  const request = new Request(input, init);
  const body = await request.json();
  const target = request.headers.get("x-amz-target");
  const payload = target?.endsWith("DescribeAlarms")
    ? {
        MetricAlarms: body.AlarmNames.map((AlarmName) => ({
          AlarmName,
          StateValue: "OK",
          StateUpdatedTimestamp: Date.now() / 1000,
        })),
      }
    : {
        MetricDataResults: body.MetricDataQueries.map((query) => ({
          Id: query.Id,
          StatusCode: "Complete",
          Timestamps: [body.EndTime - 300],
          Values: [
            query.Id === "api_count" ? 10 : query.Id === "api_5xx" ? 1 : 20,
          ],
        })),
      };
  return new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/x-amz-json-1.0" },
  });
}
