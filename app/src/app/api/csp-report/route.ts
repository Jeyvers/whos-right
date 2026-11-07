/** Receives browser CSP violation reports so we can see (in the server logs) anything the policy blocks. */
export async function POST(request: Request) {
  const text = (await request.text()).slice(0, 2000);
  console.warn("[csp-violation]", text);
  return new Response(null, { status: 204 });
}
