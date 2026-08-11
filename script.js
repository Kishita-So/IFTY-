export default {
  async fetch(request) {
    // CORS（クロスドメイン通信）を許可するヘッダー設定
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json"
    };

    // ブラウザからの事前通信（PREFLIGHT / OPTIONSリクエスト）へのレスポンス
    if (request.method === "OPTIONS") {
      return new Response(null, { headers });
    }

    try {
      // リクエストボディから単語を取得
      const { word } = await request.json();

      if (!word) {
        return new Response(JSON.stringify({ error: "単語が指定されていません" }), { status: 400, headers });
      }

      // AI（Groq API）へのプロンプト設定
      const prompt = `英単語「${word}」の市販単語帳（パス単・シス単レベル）のデータを生成してください。
以下の指定されたJSON形式のデータのみを出力してください。思考プロセスや解説などの余分なテキストは絶対に含めないでください。

{
  "meanings": [
    "【品詞】 <span style=\\"color:#e11d48; font-weight:bold;\\">コアの意味</span> [= 類義語], 派生語・別の意味",
    "【別品詞】 別の品詞の意味（あれば）"
  ],
  "examples": [
    {
      "en": "自然で実践的な英語の例文1",
      "jp": "例文1の自然な日本語訳"
    },
    {
      "en": "文脈や意味を変えた実践的な英語の例文2",
      "jp": "例文2の自然な日本語訳"
    }
  ]
}`;

      // 無料で使える超高速AI（Groq API）呼び出し
      const aiRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          // ※GroqのAPIキーを設定
          "Authorization": "Bearer gsk_yG3CjX3y8eE4k7P2Q9mN1aB5cD6eF7gH8iJ9kL0mN",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" }
        })
      });

      const aiData = await aiRes.json();

      // AIからの返答文を取得
      if (aiData.choices && aiData.choices[0] && aiData.choices[0].message) {
        const content = aiData.choices[0].message.content;
        return new Response(content, { headers });
      } else {
        throw new Error("AIからの応答が不正です");
      }

    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
    }
  }
};
