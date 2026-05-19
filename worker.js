/**
 * Cloudflare Worker — ChatGPT Trial Link 代理
 *
 * 部署方式：
 * 1. Cloudflare Dashboard → Workers & Pages → Create → Hello World
 * 2. 编辑 Worker 代码，粘贴此文件全部内容
 * 3. 部署后得到 URL，如 https://trial-api.你的账号名.workers.dev
 * 4. 在前端 index.html 的 WORKER_URL 填入该地址
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request) {
    /* CORS preflight */
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    }

    try {
      const { accessToken, config } = await request.json();

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

      const stripeUrl = data.url || data.stripe_hosted_url || data.checkout_url || '';

      let chatgptUrl = '';
      let openaiUrl = '';
      if (stripeUrl) {
        try {
          const urlObj = new URL(stripeUrl);
          const sessionId = urlObj.searchParams.get('checkout') || urlObj.searchParams.get('session_id') || '';
          if (sessionId) {
            chatgptUrl = 'https://chatgpt.com/#pricing/checkout?sessionId=' + encodeURIComponent(sessionId);
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
  },
};
