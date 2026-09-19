export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    if (!env.AI_GATEWAY_API_KEY) {
      return new Response(
        JSON.stringify({
          error: "AI_GATEWAY_API_KEY is not configured."
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    }

    const body = await request.json();

    const prompt =
      typeof body.prompt === "string"
        ? body.prompt.trim()
        : "";

    const model =
      typeof body.model === "string" && body.model.trim()
        ? body.model.trim()
        : "inclusionai/ling-3.0-flash-fin";

    if (!prompt) {
      return new Response(
        JSON.stringify({
          error: "Prompt is required."
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json"
          }
        }
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
            `AI Gateway returned HTTP ${gatewayResponse.status}`
        }),
        {
          status: gatewayResponse.status,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    }

    const result =
      data?.choices?.[0]?.message?.content ||
      "No output generated.";

    return new Response(
      JSON.stringify({ result }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error
          ? error.message
          : "Unknown server error"
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  }
}
