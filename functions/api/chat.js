const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Content-Type": "application/json"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: corsHeaders
  });
}

function getClientMeta(request) {
  return {
    ip:
      request.headers.get("CF-Connecting-IP") ||
      (request.headers.get("X-Forwarded-For") || "").split(",")[0].trim() ||
      "unknown",
    country: request.headers.get("CF-IPCountry") || "unknown",
    ua: request.headers.get("User-Agent") || "unknown",
    ray: request.headers.get("CF-Ray") || null,
    timestamp: new Date().toISOString()
  };
}

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

export async function onRequestPost(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // Access log endpoint
  if (
    url.pathname.endsWith("/access-log") ||
    url.searchParams.get("action") === "access-log"
  ) {
    try {
      const body = await request.json().catch(() => ({}));
      const meta = getClientMeta(request);
      const entry = {
        ...meta,
        deviceId: body.deviceId || null,
        keyHash: body.keyHash ? String(body.keyHash).slice(0, 16) : null,
        success: !!body.success
      };

      if (env.ACCESS_LOG) {
        const key = `access:${meta.ip}:${Date.now()}`;
        await env.ACCESS_LOG.put(key, JSON.stringify(entry), {
          expirationTtl: 60 * 60 * 24 * 90
        });
      }

      console.log("[Jaguar Access Log]", entry);
      return json({
        ok: true,
        logged: true,
        meta: { ip: meta.ip, country: meta.country }
      });
    } catch (e) {
      return json({ ok: false, error: e.message }, 500);
    }
  }

  // Main chat endpoint
  try {
    if (!env.AI_GATEWAY_API_KEY) {
      return json(
        {
          error:
            "AI_GATEWAY_API_KEY is not configured on the Cloudflare side."
        },
        500
      );
    }

    const body = await request.json();

    const model =
      typeof body.model === "string" && body.model.trim()
        ? body.model.trim()
        : "inclusionai/ling-3.0-flash-fin";

    let messages = [];

    if (Array.isArray(body.messages) && body.messages.length > 0) {
      messages = body.messages.map((m) => {
        if (typeof m.content === "string") {
          return { role: m.role || "user", content: m.content };
        }
        return { role: m.role || "user", content: m.content };
      });
    } else {
      const prompt =
        typeof body.prompt === "string" ? body.prompt.trim() : "";
      if (!prompt) {
        return json({ error: "Prompt or messages are required." }, 400);
      }
      messages = [{ role: "user", content: prompt }];
    }

    // System prompt
    if (!messages.some((m) => m.role === "system")) {
      messages = [
        {
          role: "system",
          content:
            "You are Jaguar AI, a precise, professional assistant specialised in HTML, CSS, JavaScript, architecture, code analysis and file-assisted execution. Be clear, structured and practical. When code is requested, return complete, runnable snippets inside proper markdown fences."
        },
        ...messages
      ];
    }

    const gatewayResponse = await fetch(
      "https://ai-gateway.vercel.sh/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.AI_GATEWAY_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model,
          messages,
          stream: false
        })
      }
    );

    const data = await gatewayResponse.json();

    if (!gatewayResponse.ok) {
      return json(
        {
          error:
            data?.error?.message ||
            data?.error ||
            `AI Gateway returned HTTP ${gatewayResponse.status}`
        },
        gatewayResponse.status
      );
    }

    const result =
      data?.choices?.[0]?.message?.content || "No output generated.";

    return json({ result, model, usage: data.usage || null });
  } catch (error) {
    return json(
      {
        error:
          error instanceof Error ? error.message : "Unknown server error"
      },
      500
    );
  }
}
