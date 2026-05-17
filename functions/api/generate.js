/**
 * Cloudflare Pages Function — /api/generate
 *
 * 接收前端请求，携带 accessToken 调用 OpenAI checkout API，
 * 返回三种链接：Stripe / ChatGPT 站内 / OpenAI 原始
 */

export async function onRequestPost(context) {
  const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  try {
    const { accessToken, config } = await context.request.json();

    if (!accessToken) {
      return new Response(JSON.stringify({ success: false, error: '缺少 accessToken' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    }

    const country = config?.country || 'US';
    const currency = config?.currency || 'USD';
    const locale = config?.locale || 'ja-JP';
    const promoId = config?.promoId || 'plus-1-month-free';
    const stripeLocale = config?.stripeLocale || 'ja';

    /* 构造请求 payload */
    const payload = {
      plan_name: 'chatgptplusplan',
      billing_details: { country, currency },
      cancel_url: 'https://chatgpt.com/#pricing',
      promo_campaign: {
        promo_campaign_id: promoId,
        is_coupon_from_query_param: false,
      },
      checkout_ui_mode: 'hosted',
      locale,
    };

    /* 调用 OpenAI checkout API */
    const response = await fetch('https://chatgpt.com/backend-api/payments/checkout', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + accessToken,
        'Content-Type': 'application/json',
        'Accept-Language': locale + ',ja;q=0.9',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      return new Response(JSON.stringify({
        success: false,
        error: 'OpenAI 请求失败: ' + JSON.stringify(data),
        raw: data,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    }

    /* 提取 URL */
    const stripeUrl = data.url || data.stripe_hosted_url || data.checkout_url || '';

    /* 构造 ChatGPT 站内链接 */
    let chatgptUrl = '';
    if (stripeUrl) {
      try {
        const urlObj = new URL(stripeUrl);
        const sessionId = urlObj.searchParams.get('checkout') || urlObj.searchParams.get('session_id') || '';
        if (sessionId) {
          chatgptUrl = 'https://chatgpt.com/#pricing/checkout?sessionId=' + encodeURIComponent(sessionId);
        }
      } catch (_) {}
    }

    /* 构造 OpenAI 原始链接 */
    let openaiUrl = '';
    if (stripeUrl) {
      try {
        const urlObj = new URL(stripeUrl);
        const sessionId = urlObj.searchParams.get('checkout') || urlObj.searchParams.get('session_id') || '';
        if (sessionId) {
          openaiUrl = 'https://checkout.openai.com/api/checkout/session?sessionId=' + encodeURIComponent(sessionId);
        }
      } catch (_) {}
    }

    if (!stripeUrl) {
      return new Response(JSON.stringify({
        success: false,
        error: '未找到结算链接，请检查账号是否有试用资格或已订阅过 Plus',
        raw: data,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      stripe_url: stripeUrl,
      chatgpt_url: chatgptUrl,
      openai_url: openaiUrl,
      raw: data,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });

  } catch (e) {
    return new Response(JSON.stringify({
      success: false,
      error: '服务异常: ' + e.message,
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }
}

/* 处理 CORS preflight */
export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
