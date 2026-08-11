// localStorage データの取得と補正
let rawFolders = JSON.parse(localStorage.getItem("folders")) || [];
let folders = rawFolders.map(f => ({
  id: f.id || Date.now() + Math.random(),
  name: f.name || "無題のフォルダ",
  isCollapsed: f.isCollapsed || false,
  words: Array.isArray(f.words) ? f.words.map(w => ({
    ...w,
    examples: Array.isArray(w.examples) ? w.examples : []
  })) : []
}));

const foldersEl = document.getElementById("folders");
const createBtn = document.getElementById("createFolderBtn");
const folderInput = document.getElementById("folderName");

// あなたのCloudflare WorkerのURL
const WORKER_URL = "https://ifty.humbleflail205.workers.dev";

function save(){
  localStorage.setItem("folders", JSON.stringify(folders));
}

// 🤖 Cloudflare Worker経由でフル機能データ取得
async function fetchAIContent(word) {
  try {
    const res = await fetch(WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "word", word: word })
    });

    if (res.ok) {
      const data = await res.json();
      return {
        phonetics: data.phonetics || "",
        inflections: data.inflections || "",
        derivatives: data.derivatives || "",
        synonyms: data.synonyms || "",
        antonyms: data.antonyms || "",
        memoryTip: data.memoryTip || "",
        nuance: data.nuance || "",
        usUkSpelling: data.usUkSpelling || "",
        meanings: Array.isArray(data.meanings) ? data.meanings : [`【訳】 <span style="color:#e11d48; font-weight:bold;">${word}</span>`],
        examples: Array.isArray(data.examples) ? data.examples : []
      };
    }
  } catch (e) {
    console.error("Worker通信エラー:", e);
  }

  return {
    phonetics: "",
    inflections: "",
    derivatives: "",
    synonyms: "",
    antonyms: "",
    memoryTip: "",
    nuance: "",
    usUkSpelling: "",
    meanings: [`【訳】 <span style="color:#e11d48; font-weight:bold;">${word}</span>`],
    examples: [{ en: `Example with ${word}.`, jp: `${word}の例文` }]
  };
}

// 💬 AI自由質問（チャット）機能
window.askAIChat = async function(customQuery = null) {
  const inputEl = document.getElementById("aiChatInput");
  const resultEl = document.getElementById("aiChatResult");
  const query = customQuery || (inputEl ? inputEl.value.trim() : "");

  if (!query) return;

  if (inputEl) inputEl.value = query;
  resultEl.style.display = "block";
  resultEl.innerHTML = "⏳ AIが回答を作成中...";

  try {
    const res = await fetch(WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "chat", question: query })
    });

    if (res.ok) {
      const data = await res.json();
      const formattedAnswer = data.answer.replace(/\n/g, "<br>");
      resultEl.innerHTML = `<b>💡 AIの回答:</b><br>${formattedAnswer}`;
    } else {
      resultEl.innerHTML = "❌ 回答を取得できませんでした。";
    }
  } catch (e) {
    resultEl.innerHTML = "❌ エラーが発生しました。";
  }
};

// 音声再生用URLの取得
async function getAudioUrl(word) {
  try {
    const dictRes = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
    if (dictRes.ok) {
      const dictData = await dictRes.json();
      const audioObj = dictData[0]?.phonetics?.find(p => p.audio && p.audio.length > 0);
      return audioObj ? audioObj.audio : "";
    }
  } catch (e) {}
  return "";
}

// --- フォルダ・単語操作 ---
function createFolder() {
  if (!folderInput) return;
  const name = folderInput.value.trim();
  if (!name) return;
  folders.push({ id: Date.now(), name: name, isCollapsed: false, words: [] });
  folderInput.value = "";
  save();
  render();
}

if (createBtn) createBtn.onclick = createFolder;
if (folderInput) {
  folderInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); createFolder(); } });
}

window.renameFolder = function(folderId) {
  const f = folders.find(x => x.id === folderId);
  if (f) {
    const newName = prompt("新しいフォルダ名:", f.name);
    if (newName && newName.trim()) { f.name = newName.trim(); save(); render(); }
  }
};

window.clearFolderWords = function(folderId) {
  const f = folders.find(x => x.id === folderId);
  if (f && f.words.length > 0 && confirm(`「${f.name}」の全単語を消去しますか？`)) {
    f.words = []; save(); render();
  }
};

window.moveFolder = function(index, direction) {
  const targetIndex = index + direction;
  if (targetIndex >= 0 && targetIndex < folders.length) {
    const temp = folders[index]; folders[index] = folders[targetIndex]; folders[targetIndex] = temp;
    save(); render();
  }
};

window.toggleFolder = function(folderId) {
  const f = folders.find(x => x.id === folderId);
  if (f) { f.isCollapsed = !f.isCollapsed; save(); render(); }
};

window.deleteFolder = function(folderId) {
  if (confirm("フォルダを削除しますか？")) { folders = folders.filter(f => f.id !== folderId); save(); render(); }
};

window.deleteWord = function(folderId, index) {
  const f = folders.find(x => x.id === folderId);
  if (f) { f.words.splice(index, 1); save(); render(); }
};

window.moveWordOrder = function(folderId, wordIndex, direction) {
  const f = folders.find(x => x.id === folderId);
  if (f) {
    const targetIndex = wordIndex + direction;
    if (targetIndex >= 0 && targetIndex < f.words.length) {
      const temp = f.words[wordIndex]; f.words[wordIndex] = f.words[targetIndex]; f.words[targetIndex] = temp;
      save(); render();
    }
  }
};

window.transferWordToFolder = function(sourceFolderId, wordIndex, targetFolderId) {
  targetFolderId = Number(targetFolderId);
  if (!targetFolderId || sourceFolderId === targetFolderId) return;
  const sourceF = folders.find(x => x.id === sourceFolderId);
  const targetF = folders.find(x => x.id === targetFolderId);
  if (sourceF && targetF) {
    const [wordToMove] = sourceF.words.splice(wordIndex, 1);
    targetF.words.push(wordToMove); save(); render();
  }
};

// 単語テキスト自体の直接編集
window.updateWordText = function(folderId, wordIndex, newWord) {
  const f = folders.find(x => x.id === folderId);
  if (f && f.words[wordIndex]) {
    f.words[wordIndex].word = newWord.trim();
    save();
  }
};

window.updateMeaningHTML = function(folderId, wordIndex, meaningIndex, newHTML) {
  const f = folders.find(x => x.id === folderId);
  if (f && f.words[wordIndex] && f.words[wordIndex].meanings) {
    f.words[wordIndex].meanings[meaningIndex] = newHTML; save();
  }
};

window.applyColorToSelection = function(color) {
  document.execCommand('foreColor', false, color);
};

window.updateExampleText = function(folderId, wordIndex, exIndex, key, text) {
  const f = folders.find(x => x.id === folderId);
  if (f && f.words[wordIndex] && f.words[wordIndex].examples[exIndex]) {
    f.words[wordIndex].examples[exIndex][key] = text; save();
  }
};

window.addExample = function(folderId, wordIndex) {
  const f = folders.find(x => x.id === folderId);
  if (f && f.words[wordIndex]) {
    f.words[wordIndex].examples.push({ en: "New English example.", jp: "新しい例文の訳" });
    save(); render();
  }
};

window.deleteExample = function(folderId, wordIndex, exIndex) {
  const f = folders.find(x => x.id === folderId);
  if (f && f.words[wordIndex]) { f.words[wordIndex].examples.splice(exIndex, 1); save(); render(); }
};

window.playAudio = function(audioUrl, wordText) {
  setTimeout(() => {
    if (audioUrl) { new Audio(audioUrl).play().catch(() => speakFallback(wordText)); }
    else { speakFallback(wordText); }
  }, 200);
};

function speakFallback(text) {
  if ('speechSynthesis' in window && text) {
    window.speechSynthesis.cancel();
    const uttr = new SpeechSynthesisUtterance(text);
    uttr.lang = 'en-US'; uttr.rate = 0.9;
    window.speechSynthesis.speak(uttr);
  }
}

// --- 単語追加処理（AI自動生成） ---
window.addWord = async function(folderId, word){
  const cleanWord = word.trim();
  if(!cleanWord) return;

  const [audioUrl, aiData] = await Promise.all([
    getAudioUrl(cleanWord),
    fetchAIContent(cleanWord)
  ]);

  const folder = folders.find(f => f.id === folderId);
  if (folder) {
    folder.words.push({
      word: cleanWord,
      audio: audioUrl,
      ...aiData
    });
    save();
    render();
  }
};

// 📝 白紙カード追加処理（手動用）
window.addBlankWord = function(folderId) {
  const folder = folders.find(f => f.id === folderId);
  if (folder) {
    folder.words.push({
      word: "New Word",
      audio: "",
      phonetics: "",
      inflections: "",
      derivatives: "",
      synonyms: "",
      antonyms: "",
      memoryTip: "",
      nuance: "",
      usUkSpelling: "",
      meanings: ["【品詞】 ここに意味を入力"],
      examples: [{ en: "English Example", jp: "日本語訳" }]
    });
    save();
    render();
  }
};

// --- 画面描画 ---
function render(){
  if (!foldersEl) return;
  foldersEl.innerHTML = "";

  // 🤖 AI自由質問相談室（上部設置）
  const chatBox = document.createElement("div");
  chatBox.style.cssText = "background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 14px; margin-bottom: 20px;";
  chatBox.innerHTML = `
    <h3 style="margin: 0 0 8px 0; color: #166534; font-size: 1.1em; display: flex; align-items: center; gap: 6px;">
      🤖 AI英語相談室（ニュアンス・派生語・和英など何でも質問）
    </h3>
    <div style="display: flex; gap: 6px; margin-bottom: 8px;">
      <input id="aiChatInput" placeholder="例: enthusiasticとexuberantの違いは？ / considerの派生語は？ / 『誰何』は英語で？" 
        style="flex: 1; padding: 8px; border: 1px solid #86efac; border-radius: 4px;"
        onkeydown="if(event.key==='Enter') askAIChat();"
      >
      <button onclick="askAIChat()" style="background: #15803d; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-weight: bold;">質問する</button>
    </div>
    
    <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 8px;">
      <button onclick="askAIChat('enthusiasticとexuberantのニュアンスの違いを教えて')" style="background:#dcfce7; color:#15803d; border:1px solid #86efac; padding:3px 8px; border-radius:12px; font-size:0.75em; cursor:pointer;">💡 enthusiastic vs exuberant</button>
      <button onclick="askAIChat('considerの派生語を整理して')" style="background:#dcfce7; color:#15803d; border:1px solid #86efac; padding:3px 8px; border-radius:12px; font-size:0.75em; cursor:pointer;">💡 considerの派生語</button>
      <button onclick="askAIChat('「誰何する」に相当する単語・表現は？')" style="background:#dcfce7; color:#15803d; border:1px solid #86efac; padding:3px 8px; border-radius:12px; font-size:0.75em; cursor:pointer;">💡 「誰何」の英語</button>
    </div>

    <div id="aiChatResult" style="display: none; background: #ffffff; padding: 10px; border-radius: 6px; border: 1px solid #cbd5e1; font-size: 0.9em; color: #1e293b; line-height: 1.6;"></div>
  `;
  foldersEl.appendChild(chatBox);

  // フォルダ＆単語一覧描画
  folders.forEach((folder, folderIndex) => {
    const div = document.createElement("div");
    div.className = "folder";
    div.style.cssText = "background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 14px; margin-bottom: 16px;";

    const isCollapsed = folder.isCollapsed || false;

    div.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
        <div style="display: flex; align-items: center; gap: 8px; cursor: pointer;" onclick="toggleFolder(${folder.id})">
          <span style="font-size: 1.1em; color: #64748b;">${isCollapsed ? '▶' : '▼'}</span>
          <h2 style="margin: 0; font-size: 1.2em; color: #0f172a;">📁 ${folder.name} <span style="font-size:0.8em; color:#64748b; font-weight:normal;">(${folder.words.length}語)</span></h2>
        </div>

        <div style="display: flex; align-items: center; gap: 4px;">
          <button onclick="moveFolder(${folderIndex}, -1)" ${folderIndex === 0 ? 'disabled' : ''} style="padding: 4px 8px; font-size: 0.8em; cursor: pointer;">▲</button>
          <button onclick="moveFolder(${folderIndex}, 1)" ${folderIndex === folders.length - 1 ? 'disabled' : ''} style="padding: 4px 8px; font-size: 0.8em; cursor: pointer;">▼</button>
          <button onclick="renameFolder(${folder.id})" style="background:#0284c7; color:white; border:none; padding: 4px 8px; border-radius: 4px; font-size:0.8em; cursor:pointer;">✏️ リネーム</button>
          <button onclick="clearFolderWords(${folder.id})" style="background:#f59e0b; color:white; border:none; padding: 4px 8px; border-radius: 4px; font-size:0.8em; cursor:pointer;">🧹 単語全消し</button>
          <button onclick="deleteFolder(${folder.id})" style="background-color: #ef4444; color: white; border: none; padding: 4px 8px; border-radius: 4px; font-size:0.8em; cursor: pointer;">🗑️ フォルダ削除</button>
        </div>
      </div>

      ${!isCollapsed ? `
        <div style="margin-top: 12px;">
          <div style="display: flex; gap: 6px; margin-bottom: 10px;">
            <input placeholder="単語を入力してEnter (AI自動生成)"
              onkeydown="if(event.key==='Enter'){ addWord(${folder.id}, this.value); this.value=''; }"
              style="flex: 1; padding: 8px; border: 1px solid #cbd5e1; border-radius: 4px;"
            >
            <button onclick="addBlankWord(${folder.id})" style="background: #475569; color: white; border: none; padding: 8px 12px; border-radius: 4px; font-size: 0.85em; cursor: pointer; white-space: nowrap;">📄 手動追加（白紙）</button>
          </div>

          ${folder.words.map((w, wordIndex) => `
            <div class="word" style="background: #ffffff; border: 1px solid #e2e8f0; border-left: 6px solid #e11d48; padding: 14px; margin-top: 10px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
              
              <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #f1f5f9; padding-bottom: 6px; flex-wrap: wrap; gap: 6px;">
                <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                  <b contenteditable="true" onblur="updateWordText(${folder.id}, ${wordIndex}, this.innerText)" style="font-size: 1.4em; color: #0f172a; outline: none; border-bottom: 1px dashed #cbd5e1;" title="クリックして単語名を編集">${w.word}</b>
                  ${w.phonetics ? `<span style="color: #64748b; font-size: 0.9em; font-family: monospace;">${w.phonetics}</span>` : ''}
                  <button onclick="playAudio('${w.audio}', '${w.word}')" style="background:#e11d48; color:white; border:none; border-radius:50%; width:26px; height:26px; cursor:pointer; font-size:0.8em;" title="発音を聞く">🔊</button>
                </div>

                <div style="display: flex; align-items: center; gap: 4px;">
                  <select onchange="transferWordToFolder(${folder.id}, ${wordIndex}, this.value)" style="font-size:0.8em; padding: 2px 4px; border-radius:4px; border: 1px solid #cbd5e1;">
                    <option value="">📂 他フォルダ移動...</option>
                    ${folders.map(targetF => `<option value="${targetF.id}" ${targetF.id === folder.id ? 'disabled' : ''}>${targetF.name}</option>`).join('')}
                  </select>
                  <button onclick="moveWordOrder(${folder.id}, ${wordIndex}, -1)" ${wordIndex === 0 ? 'disabled' : ''} style="padding: 2px 6px; font-size: 0.75em; cursor: pointer;">▲</button>
                  <button onclick="moveWordOrder(${folder.id}, ${wordIndex}, 1)" ${wordIndex === folder.words.length - 1 ? 'disabled' : ''} style="padding: 2px 6px; font-size: 0.75em; cursor: pointer;">▼</button>
                  <button onclick="deleteWord(${folder.id}, ${wordIndex})" style="background-color: #f1f5f9; color: #64748b; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size:0.8em;">削除</button>
                </div>
              </div>

              <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; font-size: 0.8em;">
                ${w.inflections ? `<div style="color: #0284c7; background: #f0f9ff; border: 1px solid #bae6fd; padding: 2px 6px; border-radius: 4px;">🔄 <b>活用:</b> ${w.inflections}</div>` : ''}
                ${w.derivatives ? `<div style="color: #7c3aed; background: #f5f3ff; border: 1px solid #ddd6fe; padding: 2px 6px; border-radius: 4px;">🌱 <b>派生語:</b> ${w.derivatives}</div>` : ''}
                ${w.synonyms ? `<div style="color: #059669; background: #ecfdf5; border: 1px solid #a7f3d0; padding: 2px 6px; border-radius: 4px;">🔗 <b>類義・熟語:</b> ${w.synonyms}</div>` : ''}
                ${w.antonyms ? `<div style="color: #dc2626; background: #fef2f2; border: 1px solid #fecaca; padding: 2px 6px; border-radius: 4px;">⚡ <b>対義語:</b> ${w.antonyms}</div>` : ''}
                ${w.usUkSpelling ? `<div style="color: #d97706; background: #fffbeb; border: 1px solid #fde68a; padding: 2px 6px; border-radius: 4px;">🌐 <b>米英差異:</b> ${w.usUkSpelling}</div>` : ''}
              </div>

              ${(w.memoryTip || w.nuance) ? `
                <div style="margin-top: 8px; background: #fffbeb; border: 1px solid #fef3c7; border-radius: 6px; padding: 8px; font-size: 0.85em; color: #92400e;">
                  ${w.memoryTip ? `<div>💡 <b>覚え方・連想:</b> ${w.memoryTip}</div>` : ''}
                  ${w.nuance ? `<div style="margin-top: 4px;">🔍 <b>ニュアンス:</b> ${w.nuance}</div>` : ''}
                </div>
              ` : ''}

              <div style="margin-top: 10px; background: #fff5f5; padding: 10px; border-radius: 6px; border: 1px solid #ffe4e6;">
                <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 6px; background: #ffffff; padding: 3px 6px; border-radius: 4px; font-size: 0.75em; color: #64748b; border: 1px solid #f1f5f9;">
                  <span>文字色変更:</span>
                  <button onmousedown="event.preventDefault(); applyColorToSelection('#e11d48');" style="background:#e11d48; border:none; width:16px; height:16px; border-radius:50%; cursor:pointer;" title="赤"></button>
                  <button onmousedown="event.preventDefault(); applyColorToSelection('#2563eb');" style="background:#2563eb; border:none; width:16px; height:16px; border-radius:50%; cursor:pointer;" title="青"></button>
                  <button onmousedown="event.preventDefault(); applyColorToSelection('#059669');" style="background:#059669; border:none; width:16px; height:16px; border-radius:50%; cursor:pointer;" title="緑"></button>
                  <button onmousedown="event.preventDefault(); applyColorToSelection('#0f172a');" style="background:#0f172a; border:none; width:16px; height:16px; border-radius:50%; cursor:pointer;" title="黒"></button>
                </div>

                <ul style="margin: 0; padding-left: 0; list-style: none;">
                  ${w.meanings.map((m, meaningIndex) => `
                    <li style="margin-bottom: 6px; line-height: 1.5;">
                      <div contenteditable="true" onblur="updateMeaningHTML(${folder.id}, ${wordIndex}, ${meaningIndex}, this.innerHTML)" style="outline: none; padding: 2px 4px; font-size: 1.05em; color: #1e293b; border-radius: 4px;" title="直接編集可能">${typeof m === 'object' ? (m.text || "") : m}</div>
                    </li>
                  `).join("")}
                </ul>
              </div>

              <div style="margin-top: 10px; background: #f8fafc; padding: 10px; border-radius: 6px; font-size: 0.9em; border: 1px solid #e2e8f0;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px;">
                  <span style="font-weight: bold; color: #334155;">📖 単語帳例文</span>
                  <button onclick="addExample(${folder.id}, ${wordIndex})" style="background:#10b981; color:white; border:none; padding:2px 8px; border-radius:4px; font-size:0.8em; cursor:pointer;">➕ 例文追加</button>
                </div>

                ${w.examples && w.examples.length > 0 ? w.examples.map((ex, exIndex) => `
                  <div style="margin-bottom: 8px; background: #ffffff; padding: 8px 10px; border-radius: 4px; border-left: 3px solid #3b82f6; box-shadow: 0 1px 2px rgba(0,0,0,0.03);">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 6px;">
                      <div style="flex: 1;">
                        <p contenteditable="true" onblur="updateExampleText(${folder.id}, ${wordIndex}, ${exIndex}, 'en', this.innerText)" style="margin: 0 0 4px 0; color: #0f172a; font-weight: 600; line-height: 1.4; outline: none;">${ex.en}</p>
                        <p contenteditable="true" onblur="updateExampleText(${folder.id}, ${wordIndex}, ${exIndex}, 'jp', this.innerText)" style="margin: 0; color: #475569; font-size: 0.92em; line-height: 1.4; outline: none;">${ex.jp}</p>
                      </div>
                      <div style="display: flex; align-items: center; gap: 2px;">
                        <button onclick="moveExampleOrder(${folder.id}, ${wordIndex}, ${exIndex}, -1)" ${exIndex === 0 ? 'disabled' : ''} style="padding: 1px 4px; font-size: 0.7em; cursor: pointer;">▲</button>
                        <button onclick="moveExampleOrder(${folder.id}, ${wordIndex}, ${exIndex}, 1)" ${exIndex === w.examples.length - 1 ? 'disabled' : ''} style="padding: 1px 4px; font-size: 0.7em; cursor: pointer;">▼</button>
                        <button onclick="deleteExample(${folder.id}, ${wordIndex}, ${exIndex})" style="background: transparent; color: #ef4444; border: none; font-size: 0.8em; cursor: pointer;">🗑️</button>
                      </div>
                    </div>
                  </div>
                `).join("") : '<p style="margin:0; color:#94a3b8; font-style:italic;">例文はありません。</p>'}
              </div>

            </div>
          `).join("")}
        </div>
      ` : ''}
    `;

    foldersEl.appendChild(div);
  });
}

render();
