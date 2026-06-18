import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());
app.use(express.static("public"));

const HF_TOKEN = process.env.HF_TOKEN;

app.post("/api/word", async (req, res) => {

  const { word } = req.body;

  try {

    const r = await fetch(
      "https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.2",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${HF_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          inputs: `
Return ONLY JSON.

Word: ${word}

{
 "meaning": "Japanese meaning",
 "past": "",
 "pastParticiple": "",
 "presentParticiple": "",
 "example": "",
 "exampleJP": ""
}
          `
        })
      }
    );

    const data = await r.json();

    const text = data?.[0]?.generated_text || "";

    const jsonStart = text.indexOf("{");

    const json = JSON.parse(text.slice(jsonStart));

    res.json(json);

  } catch (e) {
    res.status(500).json({ error: "AI error" });
  }

});

app.listen(3000, () => {
  console.log("http://localhost:3000");
});
