export async function onRequestPost(context) {
  const { request, env } = context;

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Content-Type": "application/json"
  };

  try {
    if (!env.AI_GATEWAY_API_KEY) {
      return new Response(
        JSON.stringify({
          error: "AI_GATEWAY_API_KEY is not configured on the Cloudflare side."
        }),
        { status: 500, headers: corsHeaders }
      );
    }

    const body = await request.json();

    const prompt =
      typeof body.prompt === "string" ? body.prompt.trim() : "";

    const model =
      typeof body.model === "string" && body.model.trim()
        ? body.model.trim()
        : "inclusionai/ling-3.0-flash-fin";

    if (!prompt) {
      return new Response(
        JSON.stringify({ error: "Prompt is required." }),
        { status: 400, headers: corsHeaders }
      );
    }

    const gatewayResponse = await fetch(
      "https://ai-gateway.vercel.sh/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.AI_GATEWAY_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "user",
              content: prompt
            }
          ]
        })
      }
    );

    const data = await gatewayResponse.json();

    if (!gatewayResponse.ok) {
      return new Response(
        JSON.stringify({
          error:
            data?.error?.message ||
            data?.error ||
            `AI Gateway returned HTTP ${gatewayResponse.status}`
        }),
        {
          status: gatewayResponse.status,
          headers: corsHeaders
        }
      );
    }

    const result =
      data?.choices?.[0]?.message?.content ||
      "No output generated.";

    return new Response(
      JSON.stringify({ result }),
      { status: 200, headers: corsHeaders }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error
          ? error.message
          : "Unknown server error"
      }),
      { status: 500, headers: corsHeaders }
    );
  }
}

// Handle browser preflight (OPTIONS)
export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400"
    }
  });
}
