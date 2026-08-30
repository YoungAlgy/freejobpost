export function retiredFunctionResponse(functionName: string): Response {
  return new Response(
    JSON.stringify({
      ok: false,
      retired: true,
      function: functionName,
      message: "Legacy aggregate-job processing is retired.",
    }),
    {
      status: 410,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      },
    },
  );
}
