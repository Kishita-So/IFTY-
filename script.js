// --- 修正箇所：メニューおよびログインUIの統合 ---
window.openMenuModal = function() {
  let modal = document.getElementById("appMenuModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "appMenuModal";
    modal.style.cssText = "position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); display: flex; justify-content: center; align-items: center; z-index: 10000;";
    document.body.appendChild(modal);
  }

  // ログインしていない場合はログイン画面を呼び出すようにする
  if (!currentUser) {
    modal.style.display = "none";
    setupLoginUI(); // 元のログイン画面生成関数を呼び出し
    return;
  }
  
  modal.innerHTML = `
    <div style="background: white; padding: 24px; border-radius: 12px; width: 90%; max-width: 340px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); text-align: center;">
      <h3 style="margin-top: 0; color: #0f172a; margin-bottom: 16px;">メニュー</h3>
      <div style="display: flex; flex-direction: column; gap: 10px;">
        <button onclick="${currentView === 'chat' ? 'switchToVocabView()' : 'switchToChatView()'}" style="padding: 10px; background: #0284c7; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">${currentView === 'chat' ? '📚 単語帳に戻る' : '🤖 ALLIAを開く'}</button>
        <button onclick="openFlashcardSubMenu()" style="padding: 10px; background: #10b981; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">▶ プレイ (フラッシュカード)</button>
        <hr style="width: 100%; border: none; border-top: 1px solid #e2e8f0; margin: 5px 0;">
        <button onclick="logout()" style="padding: 8px; background: #fee2e2; color: #991b1b; border: none; border-radius: 6px; cursor: pointer;">ログアウト</button>
        <button onclick="closeMenuModal()" style="padding: 8px; background: #e2e8f0; color: #334155; border: none; border-radius: 6px; cursor: pointer;">閉じる</button>
      </div>
    </div>
  `;
  modal.style.display = "flex";
};

// --- setupLoginUI を確実に再定義 ---
function setupLoginUI() {
  const landingPage = document.getElementById("landingPage") || document.body;
  // すでに画面があるか確認して上書き
  landingPage.innerHTML = `
    <div id="loginOverlay" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: #0f172a; display: flex; justify-content: center; align-items: center; z-index: 20000;">
      <div style="background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 24px; width: 90%; max-width: 380px; text-align: center;">
        <h2 style="color: #38bdf8; margin-top: 0; margin-bottom: 8px;">単語帳アプリ</h2>
        <p style="color: #94a3b8; font-size: 0.9em; margin-bottom: 20px;">メールアドレスを入力してログインしてください</p>
        <div style="display: flex; flex-direction: column; gap: 10px;">
          <input type="email" id="customEmailInput" placeholder="your_email@example.com" style="width: 100%; padding: 10px; border-radius: 6px; border: 1px solid #475569; background: #0f172a; color: white; box-sizing: border-box;">
          <button onclick="loginWithAccount(document.getElementById('customEmailInput').value)" style="background: #0284c7; color: white; border: none; padding: 10px; border-radius: 6px; cursor: pointer; font-weight: bold;">ログイン</button>
        </div>
      </div>
    </div>
  `;
  // portal等があれば隠す
  const mainPortal = document.getElementById("mainPortal");
  if (mainPortal) mainPortal.style.display = "none";
}
